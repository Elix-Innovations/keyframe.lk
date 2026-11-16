import { spawn } from 'node:child_process';
import { createWriteStream, openAsBlob, type WriteStream } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { HttpError } from './errors.js';
import type { TranscribeResponse } from './types.js';
import { recordFailure, recordGemini, recordMinutes, type GeminiUsageMetadata } from './usage.js';

export type Language = 'si' | 'en' | 'auto';
export type Provider = 'auto' | 'elevenlabs' | 'openai' | 'gemini';
type Concrete = Exclude<Provider, 'auto'>;
type Word = TranscribeResponse['words'][number];
type Alignment = NonNullable<TranscribeResponse['alignment']>;

export const ffmpegPath = () => process.env.FFMPEG_PATH || 'ffmpeg';
export const ffprobePath = () => process.env.FFPROBE_PATH || 'ffprobe';

const OPENAI_MAX_BYTES = 24 * 1024 * 1024;
const OPENAI_CHUNK_SECONDS = 600;

// ---------------------------------------------------------------------------
// Process helpers
// ---------------------------------------------------------------------------

interface RunResult { code: number; stdout: string; stderr: string }

/** `keepAllStderr` skips the tail truncation, for callers that parse the whole log (e.g. silencedetect). */
function run(cmd: string, args: string[], timeoutMs = 0, keepAllStderr = false): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timer: NodeJS.Timeout | undefined;
    if (timeoutMs > 0) timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
      if (!keepAllStderr && stderr.length > 64_000) stderr = stderr.slice(-32_000); // keep the tail only
    });
    child.on('error', (err) => { if (timer) clearTimeout(timer); reject(err); });
    child.on('close', (code) => { if (timer) clearTimeout(timer); resolve({ code: code ?? -1, stdout, stderr }); });
  });
}

export async function checkFfmpeg(): Promise<boolean> {
  try {
    const r = await run(ffmpegPath(), ['-version'], 5000);
    return r.code === 0;
  } catch {
    return false;
  }
}

async function ffmpeg(args: string[]): Promise<void> {
  let r: RunResult;
  try {
    r = await run(ffmpegPath(), ['-hide_banner', '-nostdin', '-y', ...args]);
  } catch (err) {
    throw new HttpError(500, `Could not run ffmpeg (${(err as Error).message}). Install ffmpeg or set FFMPEG_PATH.`);
  }
  if (r.code !== 0) {
    const tail = r.stderr.trim().split('\n').slice(-6).join('\n');
    if (/does not contain any stream|Output file .* does not contain|matches no streams/i.test(r.stderr)) {
      throw new HttpError(400, 'The uploaded file has no audio track.');
    }
    if (/Invalid data found when processing input/i.test(r.stderr)) {
      throw new HttpError(415, 'ffmpeg could not read the uploaded file (unsupported or corrupt media).');
    }
    throw new HttpError(500, `ffmpeg failed: ${tail}`);
  }
}

async function probeDuration(file: string): Promise<number | null> {
  try {
    const r = await run(ffprobePath(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], 30_000);
    const d = parseFloat(r.stdout.trim());
    return r.code === 0 && Number.isFinite(d) && d > 0 ? d : null;
  } catch {
    return null;
  }
}

/** Fallback when ffprobe is unavailable: read "Duration: hh:mm:ss.xx" from `ffmpeg -i`'s banner. */
async function ffmpegDuration(file: string): Promise<number | null> {
  try {
    const r = await run(ffmpegPath(), ['-hide_banner', '-nostdin', '-i', file], 30_000);
    const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.stderr);
    if (!m) return null;
    const d = Number(m[1]) * 3600 + Number(m[2]) * 60 + parseFloat(m[3]);
    return Number.isFinite(d) && d > 0 ? d : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Upload reception (streamed straight to disk, never buffered in memory)
// ---------------------------------------------------------------------------

export interface ReceivedUpload { filePath: string; fields: Record<string, string>; bytes: number }

function toNodeReadable(body: ReadableStream<Uint8Array>): Readable {
  return Readable.fromWeb(body as unknown as NodeReadableStream<Uint8Array>);
}

function writeChunk(out: WriteStream, chunk: Buffer): Promise<void> | void {
  if (!out.write(chunk)) return new Promise((resolve, reject) => {
    const onDrain = () => { out.off('error', onError); resolve(); };
    const onError = (e: Error) => { out.off('drain', onDrain); reject(e); };
    out.once('drain', onDrain);
    out.once('error', onError);
  });
}

function endStream(out: WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    out.once('error', reject);
    out.end(() => resolve());
  });
}

/**
 * Minimal streaming multipart/form-data parser. File parts are written to disk as they arrive;
 * small text fields are kept in memory (capped at 64 KB each). Only the first file part is kept.
 */
async function receiveMultipart(body: ReadableStream<Uint8Array>, boundary: string, dir: string): Promise<ReceivedUpload> {
  const delim = Buffer.from(`\r\n--${boundary}`);
  const CRLFCRLF = Buffer.from('\r\n\r\n');
  const fields: Record<string, string> = {};
  let filePath: string | null = null;
  let bytes = 0;
  // Sticky write error (ENOSPC, EIO...): an 'error' event with no listener would crash the process.
  let streamErr: Error | null = null;

  type Part = { name: string; out?: WriteStream; text?: Buffer[]; textLen: number };
  let part = null as Part | null;
  let state = 'preamble' as 'preamble' | 'afterBoundary' | 'headers' | 'body' | 'done';
  // Prepend CRLF so the very first boundary (which has no leading CRLF) matches `delim`.
  let buf: Buffer = Buffer.from('\r\n');

  const emit = async (data: Buffer) => {
    if (!part || data.length === 0) return;
    if (part.out) {
      if (streamErr || part.out.destroyed) throw streamErr ?? new Error('Upload write stream closed unexpectedly.');
      bytes += data.length;
      await writeChunk(part.out, data);
      if (streamErr) throw streamErr;
    } else if (part.text) {
      if (part.textLen + data.length > 64 * 1024) throw new HttpError(413, `Form field "${part.name}" is too large.`);
      part.text.push(data);
      part.textLen += data.length;
    }
  };
  const finishPart = async () => {
    if (!part) return;
    if (part.out) {
      if (streamErr) throw streamErr;
      await endStream(part.out);
    }
    else if (part.text) fields[part.name] = Buffer.concat(part.text).toString('utf8');
    part = null;
  };

  try {
    for await (const chunk of toNodeReadable(body)) {
      buf = buf.length ? Buffer.concat([buf, chunk as Buffer]) : (chunk as Buffer);
      parse: while (true) {
        switch (state) {
          case 'preamble': {
            const i = buf.indexOf(delim);
            if (i === -1) { buf = buf.subarray(Math.max(0, buf.length - delim.length)); break parse; }
            buf = buf.subarray(i + delim.length);
            state = 'afterBoundary';
            continue;
          }
          case 'afterBoundary': {
            if (buf.length < 2) break parse;
            if (buf[0] === 0x2d && buf[1] === 0x2d) { state = 'done'; break parse; } // "--" = final boundary
            // Skip optional transport padding + CRLF.
            const nl = buf.indexOf('\r\n');
            if (nl === -1) { if (buf.length > 1024) throw new HttpError(400, 'Malformed multipart body.'); break parse; }
            buf = buf.subarray(nl + 2);
            state = 'headers';
            continue;
          }
          case 'headers': {
            const i = buf.indexOf(CRLFCRLF);
            if (i === -1) { if (buf.length > 16 * 1024) throw new HttpError(400, 'Malformed multipart headers.'); break parse; }
            const headerText = buf.subarray(0, i).toString('utf8');
            buf = buf.subarray(i + 4);
            const disp = /content-disposition:([^\r\n]*)/i.exec(headerText)?.[1] ?? '';
            const name = /\bname="([^"]*)"/i.exec(disp)?.[1] ?? '';
            const hasFilename = /\bfilename\*?=/i.test(disp);
            if (hasFilename && filePath === null) {
              const original = /\bfilename="([^"]*)"/i.exec(disp)?.[1] ?? 'upload';
              const ext = path.extname(original).replace(/[^.\w]/g, '').slice(0, 10);
              filePath = path.join(dir, `input${ext}`);
              const out = createWriteStream(filePath);
              out.on('error', (e) => { streamErr = e; });
              part = { name, out, textLen: 0 };
            } else if (hasFilename) {
              part = { name, textLen: 0 }; // extra files are discarded
            } else {
              part = { name, text: [], textLen: 0 };
            }
            state = 'body';
            continue;
          }
          case 'body': {
            const i = buf.indexOf(delim);
            if (i === -1) {
              // Keep enough bytes to detect a delimiter split across chunks.
              const safe = buf.length - (delim.length - 1);
              if (safe > 0) { await emit(buf.subarray(0, safe)); buf = buf.subarray(safe); }
              break parse;
            }
            await emit(buf.subarray(0, i));
            await finishPart();
            buf = buf.subarray(i + delim.length);
            state = 'afterBoundary';
            continue;
          }
          case 'done':
            break parse;
        }
      }
      if (state === 'done') break;
    }
  } finally {
    // Close any dangling write stream (truncated upload).
    if (part?.out && !part.out.closed) part.out.destroy();
  }

  if (state !== 'done') throw new HttpError(400, 'Upload was truncated or the multipart body is malformed.');
  if (!filePath || bytes === 0) throw new HttpError(400, 'No file received. Send the media in a multipart field named "file".');
  return { filePath, fields, bytes };
}

/**
 * Receives the upload for /api/transcribe. Two modes are accepted:
 *  - multipart/form-data with fields `file`, `language`, `provider` (streamed-parsed to disk);
 *  - a raw media body (any other Content-Type, e.g. video/mp4) with `?language=&provider=` query params.
 */
export async function receiveUpload(req: Request, dir: string): Promise<ReceivedUpload> {
  if (!req.body) throw new HttpError(400, 'Empty request body.');
  const contentType = req.headers.get('content-type') ?? '';
  if (/^multipart\/form-data/i.test(contentType)) {
    const boundary = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
    const b = boundary?.[1] ?? boundary?.[2];
    if (!b) throw new HttpError(400, 'multipart/form-data request is missing its boundary.');
    return receiveMultipart(req.body, b, dir);
  }
  const filePath = path.join(dir, 'input.bin');
  await pipeline(toNodeReadable(req.body), createWriteStream(filePath));
  const { size } = await stat(filePath);
  if (size === 0) throw new HttpError(400, 'Empty request body.');
  return { filePath, fields: {}, bytes: size };
}

export const makeTempDir = () => mkdtemp(path.join(os.tmpdir(), 'keyframe-'));
export const removeTempDir = (dir: string) => rm(dir, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

function normalizeWords(raw: { text: string; start: number; end: number }[], offset = 0): Word[] {
  const out: Word[] = [];
  for (const w of raw) {
    const text = (w.text ?? '').trim();
    if (!text) continue;
    const start = Number(w.start);
    const end = Number(w.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    out.push({ text, start: start + offset, end: Math.max(start, end) + offset });
  }
  return out;
}

async function providerError(name: string, res: Response): Promise<HttpError> {
  let body = '';
  try { body = (await res.text()).slice(0, 2000); } catch { /* ignore */ }
  let detail = body;
  try {
    const j = JSON.parse(body);
    detail = j?.detail?.message ?? j?.detail?.status ?? (typeof j?.detail === 'string' ? j.detail : undefined)
      ?? j?.error?.message ?? body;
  } catch { /* not JSON */ }
  const msg = `${name} error (${res.status}): ${detail || res.statusText}`;
  if (res.status === 401 || res.status === 403) return new HttpError(401, msg);
  if (res.status === 429) return new HttpError(429, msg);
  if (res.status === 413) return new HttpError(413, msg);
  return new HttpError(502, msg);
}

async function transcribeElevenLabs(audioPath: string, language: Language): Promise<{ words: Word[]; language: string }> {
  const form = new FormData();
  form.append('model_id', process.env.ELEVENLABS_MODEL || 'scribe_v1');
  form.append('file', await openAsBlob(audioPath, { type: 'audio/flac' }), 'audio.flac');
  if (language === 'si') form.append('language_code', 'sin');
  else if (language === 'en') form.append('language_code', 'eng');
  form.append('timestamps_granularity', 'word');
  form.append('tag_audio_events', 'false');

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY! },
    body: form,
  });
  const model = process.env.ELEVENLABS_MODEL || 'scribe_v1';
  recordMinutes('elevenlabs', model, (await probeDuration(audioPath)) ?? 0, res.ok);
  if (!res.ok) throw await providerError('ElevenLabs', res);
  const data = (await res.json()) as {
    language_code?: string;
    words?: { text: string; start: number; end: number; type?: string }[];
  };
  const words = normalizeWords((data.words ?? []).filter((w) => (w.type ?? 'word') === 'word'));
  return { words, language: data.language_code ?? (language === 'auto' ? 'unknown' : language) };
}

async function transcribeOpenAIFile(audioPath: string, language: Language): Promise<{ words: Word[]; language?: string }> {
  const form = new FormData();
  form.append('model', 'whisper-1');
  form.append('file', await openAsBlob(audioPath, { type: 'audio/mpeg' }), path.basename(audioPath));
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  if (language !== 'auto') form.append('language', language);

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  recordMinutes('openai', 'whisper-1', (await probeDuration(audioPath)) ?? 0, res.ok);
  if (!res.ok) throw await providerError('OpenAI', res);
  const data = (await res.json()) as { language?: string; words?: { word: string; start: number; end: number }[] };
  return {
    words: normalizeWords((data.words ?? []).map((w) => ({ text: w.word, start: w.start, end: w.end }))),
    language: data.language,
  };
}

async function transcribeOpenAI(audioPath: string, language: Language, dir: string): Promise<{ words: Word[]; language: string }> {
  const { size } = await stat(audioPath);
  if (size <= OPENAI_MAX_BYTES) {
    const r = await transcribeOpenAIFile(audioPath, language);
    return { words: r.words, language: r.language ?? language };
  }
  // Too large for OpenAI's 25 MB limit: split into ~10 minute chunks and offset timestamps.
  await ffmpeg(['-i', audioPath, '-f', 'segment', '-segment_time', String(OPENAI_CHUNK_SECONDS), '-c', 'copy',
    '-reset_timestamps', '1', path.join(dir, 'chunk_%04d.mp3')]);
  const chunks = (await readdir(dir)).filter((f) => /^chunk_\d+\.mp3$/.test(f)).sort();
  const words: Word[] = [];
  let offset = 0;
  let detected: string | undefined;
  for (const name of chunks) {
    const chunkPath = path.join(dir, name);
    const r = await transcribeOpenAIFile(chunkPath, language);
    detected ??= r.language;
    for (const w of r.words) words.push({ ...w, start: w.start + offset, end: w.end + offset });
    // Use the real chunk length (segment cuts land on frame boundaries, not exactly 600 s).
    offset += (await probeDuration(chunkPath)) ?? OPENAI_CHUNK_SECONDS;
  }
  return { words, language: detected ?? language };
}


// ---------------------------------------------------------------------------
// Google Gemini (audio understanding with structured word timings)
// ---------------------------------------------------------------------------

/** gemini-2.5-flash is retired for new API keys, so the default is gemini-3.5-flash; override with GEMINI_MODEL. */
const geminiModel = () => process.env.GEMINI_MODEL || 'gemini-3.5-flash';
/** Timestamps from an LLM drift on long audio, so long files are cut at pauses into short pieces. */
const GEMINI_TARGET_CHUNK = 30;
const GEMINI_MAX_CHUNK = 45;
const GEMINI_CONCURRENCY = 3;

const GEMINI_PROMPT = (language: Language) => `Transcribe this audio verbatim, word by word.
${language === 'en' ? 'The speech is English.' : 'The speaker uses Sri Lankan Sinhala, often mixed with English words (code-mixing).'}
- Write Sinhala words in Sinhala Unicode script and English words in Latin letters exactly as spoken (e.g. "program", "ICT", "A/L").
- Write numbers as digits. Keep sentence punctuation attached to the preceding word.
- Include every spoken word in order. Do not translate, summarise, correct grammar, or skip filler words.
- For each word give its start and end time in seconds from the start of THIS audio clip, with 2 decimals.
- If there is no speech, return an empty list.`;

const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    words: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { text: { type: 'STRING' }, start: { type: 'NUMBER' }, end: { type: 'NUMBER' } },
        required: ['text', 'start', 'end'],
      },
    },
  },
  required: ['words'],
};

/**
 * Choose cut points near every GEMINI_TARGET_CHUNK seconds, preferring the middle of a silence. With `words`
 * (a transcript that already has rough timings) a cut never lands inside a word, and gaps between words also count.
 */
async function chunkCutPoints(audioPath: string, duration: number, words?: RawWord[]): Promise<number[]> {
  if (duration <= GEMINI_MAX_CHUNK) return [];
  // The whole log is needed: truncating it would drop the early silences of a long file.
  const r = await run(ffmpegPath(), ['-hide_banner', '-nostdin', '-nostats', '-i', audioPath, '-af', 'silencedetect=noise=-32dB:d=0.25', '-f', 'null', '-'], 0, true);
  let candidates: number[] = [];
  const re = /silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g;
  for (let m; (m = re.exec(r.stderr));) candidates.push((parseFloat(m[1]) + parseFloat(m[2])) / 2);
  const insideWord = (t: number) => !!words?.some((w) => t > w.start && t < w.end);
  if (words?.length) {
    candidates = candidates.filter((t) => !insideWord(t));
    for (let i = 1; i < words.length; i++) if (words[i].start - words[i - 1].end >= 0.15) candidates.push((words[i - 1].end + words[i].start) / 2);
  }
  const cuts: number[] = [];
  let last = 0;
  while (duration - last > GEMINI_MAX_CHUNK) {
    const target = last + GEMINI_TARGET_CHUNK;
    const near = candidates.filter((t) => t > last + 15 && t < last + GEMINI_MAX_CHUNK);
    let cut = near.length ? near.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a)) : target;
    // No pause at all: cut at the nearest word boundary rather than through a word.
    const w = words?.find((x) => cut > x.start && cut < x.end);
    if (w) cut = cut - w.start < w.end - cut ? w.start : w.end;
    if (cut <= last + 1) cut = target;
    cuts.push(cut);
    last = cut;
  }
  return cuts;
}

type Piece = { start: number; end: number; file: string };

/** Cut [bounds[i], bounds[i+1]) out of `audioPath` as lossless FLAC (no encoder delay to shift timings). */
async function cutPieces(audioPath: string, bounds: number[], dir: string, prefix: string): Promise<Piece[]> {
  const pieces: Piece[] = new Array(bounds.length - 1);
  // A few at a time; one ffmpeg process per chunk at once can exhaust CPU or file handles.
  let nextCut = 0;
  await Promise.all(Array.from({ length: Math.min(4, pieces.length) }, async () => {
    while (nextCut < pieces.length) {
      const i = nextCut++;
      const start = bounds[i];
      const end = bounds[i + 1];
      if (bounds.length === 2) { pieces[i] = { start, end, file: audioPath }; continue; }
      const file = path.join(dir, `${prefix}_${String(i).padStart(4, '0')}.flac`);
      try {
        await ffmpeg(['-ss', start.toFixed(3), '-to', end.toFixed(3), '-i', audioPath, '-c:a', 'flac', file]);
      } catch (err) {
        nextCut = pieces.length; // stop the other workers from starting more cuts
        throw err;
      }
      pieces[i] = { start, end, file };
    }
  }));
  return pieces;
}

async function geminiRequest(audio: Buffer, language: Language, attempt = 0, mimeType = 'audio/flac'): Promise<RawWord[]> {
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ inlineData: { mimeType, data: audio.toString('base64') } }, { text: GEMINI_PROMPT(language) }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: GEMINI_SCHEMA, temperature: 0 },
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    // Network drop or timeout: retry, then report as a provider problem rather than a bare 500.
    if (attempt < 2) return geminiRequest(audio, language, attempt + 1, mimeType);
    throw new HttpError(504, `Gemini did not respond (${(err as Error).message}). Try again, or use a shorter clip.`);
  }
  if ((res.status === 429 || res.status >= 500) && attempt < 2) {
    recordFailure('gemini', geminiModel());
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    return geminiRequest(audio, language, attempt + 1, mimeType);
  }
  if (!res.ok) { recordFailure('gemini', geminiModel()); throw await providerError('Gemini', res); }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
    usageMetadata?: GeminiUsageMetadata;
  };
  recordGemini(geminiModel(), data.usageMetadata);
  if (data.promptFeedback?.blockReason) throw new HttpError(422, `Gemini blocked the audio (${data.promptFeedback.blockReason}).`);
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  try {
    return (JSON.parse(text) as { words?: { text: string; start: number; end: number }[] }).words ?? [];
  } catch {
    if (attempt < 2) return geminiRequest(audio, language, attempt + 1, mimeType);
    throw new HttpError(502, `Gemini returned an unreadable transcript (finish reason: ${data.candidates?.[0]?.finishReason ?? 'unknown'}).`);
  }
}

/** Make model timings usable: clamp into the clip, keep them monotonic, give every word some duration. */
function sanitizeTimings(raw: { text: string; start: number; end: number }[], clipDur: number) {
  const out: { text: string; start: number; end: number }[] = [];
  let prevEnd = 0;
  for (const w of raw) {
    let start = Math.min(Math.max(Number(w.start) || 0, prevEnd), clipDur);
    let end = Math.min(Math.max(Number(w.end) || start, start + 0.05), clipDur);
    if (end <= start) { start = Math.max(prevEnd, clipDur - 0.05); end = clipDur; }
    out.push({ text: w.text, start, end });
    prevEnd = end;
  }
  return out;
}

type RawWord = { text: string; start: number; end: number };

/** Non-silent stretches of a clip, used to sanity-check and repair model timings. */
async function speechIntervals(file: string, clipDur: number): Promise<[number, number][]> {
  const r = await run(ffmpegPath(), ['-hide_banner', '-nostdin', '-i', file, '-af', 'silencedetect=noise=-32dB:d=0.2', '-f', 'null', '-']);
  const out: [number, number][] = [];
  let cursor = 0;
  const re = /silence_start: ([\d.]+)|silence_end: ([\d.]+)/g;
  for (let m; (m = re.exec(r.stderr));) {
    if (m[1] !== undefined) { const t = parseFloat(m[1]); if (t - cursor > 0.05) out.push([cursor, t]); }
    else cursor = parseFloat(m[2]);
  }
  if (clipDur - cursor > 0.05) out.push([cursor, clipDur]);
  return out.length ? out : [[0, clipDur]];
}

/**
 * LLM timestamps occasionally collapse (all words at ~0, stuck, or running past the clip).
 * Detect that so the chunk can be retried or repaired.
 */
function timingsLookBroken(raw: RawWord[], clipDur: number, speech: [number, number][]): boolean {
  if (raw.length < 4) return false;
  const starts = raw.map((w) => Number(w.start));
  if (starts.some((t) => !Number.isFinite(t))) return true;
  let backwards = 0, stuck = 0;
  for (let i = 1; i < starts.length; i++) {
    if (starts[i] < starts[i - 1] - 0.05) backwards++;
    if (Math.abs(starts[i] - starts[i - 1]) < 0.01) stuck++;
  }
  const n = starts.length - 1;
  if (backwards / n > 0.1 || stuck / n > 0.3) return true;
  if (Math.max(...raw.map((w) => Number(w.end) || 0)) > clipDur * 1.1 + 1) return true;
  const speechSpan = speech[speech.length - 1][1] - speech[0][0];
  const span = starts[starts.length - 1] - starts[0];
  return speechSpan > 5 && span < speechSpan * 0.5;
}

/** Fallback timing: spread words over the detected speech, proportional to their length. */
function distributeOverSpeech(raw: RawWord[], speech: [number, number][]): RawWord[] {
  const weights = raw.map((w) => Math.max(1, [...w.text].length) + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const speechTotal = speech.reduce((a, [s, e]) => a + (e - s), 0);
  const at = (x: number) => { // map a position on the concatenated speech timeline back to clip time
    for (const [s, e] of speech) { if (x <= e - s) return s + x; x -= e - s; }
    return speech[speech.length - 1][1];
  };
  let acc = 0;
  return raw.map((w, i) => {
    const a = (acc / total) * speechTotal;
    acc += weights[i];
    const b = (acc / total) * speechTotal;
    return { text: w.text, start: at(a), end: at(Math.max(a, b - 0.02)) };
  });
}

// ---------------------------------------------------------------------------
// Forced alignment (Python service): exact word timings for Gemini's text
// ---------------------------------------------------------------------------

const sinhalaServiceUrl = () => process.env.SINHALA_SERVICE_URL || 'http://localhost:8788';
let alignerNotice = '';

export type AlignerStatus = 'ready' | 'downloading' | 'missing' | 'unavailable';

/** Asks the Python service whether the forced aligner can run right now ('unavailable' = service down or packages missing). */
export async function alignerStatus(): Promise<AlignerStatus> {
  try {
    const res = await fetch(`${sinhalaServiceUrl()}/api/sinhala/health`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return 'unavailable';
    const { align } = (await res.json()) as { align?: string };
    if (align === 'ready' || align === 'available') return 'ready';
    if (align === 'downloading' || align === 'missing') return align;
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

/** Why a chunk kept Gemini's own timings; shown to the user so unaligned captions are never a surprise. */
type AlignResult = { words: RawWord[]; reason?: undefined } | { words: null; reason: string };

/**
 * Re-time a clip's words from the audio itself (MMS forced aligner in python/). Returns
 * `words: null` plus a reason when the aligner is not running, still downloading its model, or
 * rejects the match; the caller then keeps Gemini's own timings.
 */
async function alignWords(file: string, raw: RawWord[], language: Language): Promise<AlignResult> {
  if (raw.length === 0) return { words: raw };
  const form = new FormData();
  form.append('file', await openAsBlob(file, { type: file.endsWith('.flac') ? 'audio/flac' : 'audio/mpeg' }), path.basename(file));
  form.append('words', JSON.stringify(raw.map((w) => w.text)));
  form.append('language', language);
  const fail = (reason: string): AlignResult => {
    if (reason !== alignerNotice) console.warn(`[align] ${reason}; keeping the transcriber's timings`);
    alignerNotice = reason;
    return { words: null, reason };
  };
  try {
    const res = await fetch(`${sinhalaServiceUrl()}/api/sinhala/align`, { method: 'POST', body: form, signal: AbortSignal.timeout(180_000) });
    if (!res.ok) {
      const detail = await res.json().then((j: { detail?: string }) => j.detail).catch(() => res.statusText);
      return fail(res.status === 503 ? `aligner model not ready (${detail})` : `aligner rejected the clip (${res.status}: ${detail})`);
    }
    const data = (await res.json()) as { words: [number, number][] };
    if (data.words?.length !== raw.length) {
      return fail(`aligner returned ${data.words?.length ?? 0} timings for ${raw.length} words`);
    }
    alignerNotice = '';
    return { words: raw.map((w, i) => ({ text: w.text, start: data.words[i][0], end: data.words[i][1] })) };
  } catch (err) {
    return fail(`aligner service unreachable at ${sinhalaServiceUrl()} (${(err as Error).message})`);
  }
}

/** The aligner cannot run at all right now: no point asking again for every chunk. */
const alignerDown = (reason: string) => reason.startsWith('aligner service unreachable') || reason.startsWith('aligner model not ready');

/**
 * Re-time any transcript (ElevenLabs, Whisper) from the audio with the forced aligner, chunk by chunk at pauses.
 * Chunks the aligner rejects keep the transcriber's own timings; `alignment` says how many were re-timed.
 */
export async function alignTranscript(audioPath: string, words: Word[], language: Language, dir: string): Promise<{ words: Word[]; alignment: Alignment }> {
  if (!words.length) return { words, alignment: { aligned: 0, total: 0 } };
  const duration = (await probeDuration(audioPath)) ?? (await ffmpegDuration(audioPath)) ?? words[words.length - 1].end;
  const cuts = await chunkCutPoints(audioPath, duration, words);
  const bounds = [0, ...cuts, duration];
  const groups: Word[][] = bounds.slice(1).map(() => []);
  for (const w of words) {
    const mid = (w.start + w.end) / 2;
    let i = bounds.findIndex((b, k) => k > 0 && mid < b) - 1;
    if (i < 0) i = groups.length - 1;
    groups[i].push(w);
  }
  const pieces = await cutPieces(audioPath, bounds, dir, 'aln');
  const out: Word[][] = groups.map((g) => g);
  const alignment: Alignment = { aligned: 0, total: groups.filter((g) => g.length).length };
  let next = 0;
  let down = false;
  await Promise.all(Array.from({ length: Math.min(2, pieces.length) }, async () => {
    while (next < pieces.length) {
      const i = next++;
      const p = pieces[i];
      if (!groups[i].length) continue;
      if (down) continue;
      const rel = groups[i].map((w) => ({ text: w.text, start: w.start - p.start, end: w.end - p.start }));
      const aligned = await alignWords(p.file, rel, language);
      if (aligned.words) {
        alignment.aligned++;
        out[i] = normalizeWords(sanitizeTimings(aligned.words, p.end - p.start), p.start);
      } else {
        alignment.reason ??= aligned.reason;
        if (alignerDown(aligned.reason)) down = true;
      }
    }
  }));
  return { words: out.flat(), alignment };
}

async function transcribeGemini(audioPath: string, language: Language, dir: string): Promise<{ words: Word[]; language: string; alignment: Alignment }> {
  // A duration of 0 would clamp every word timing to 0, so never default to it.
  const duration = (await probeDuration(audioPath)) ?? (await ffmpegDuration(audioPath));
  if (duration === null) throw new HttpError(500, 'Could not read the audio duration (is ffprobe installed?).');
  const cuts = await chunkCutPoints(audioPath, duration);
  const pieces = await cutPieces(audioPath, [0, ...cuts, duration], dir, 'gem');

  const results: Word[][] = new Array(pieces.length);
  const alignment: Alignment = { aligned: 0, total: pieces.length };
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(GEMINI_CONCURRENCY, pieces.length) }, async () => {
    while (next < pieces.length) {
      const i = next++;
      const p = pieces[i];
      const clipDur = p.end - p.start;
      const [audio, speech] = await Promise.all([readFile(p.file), speechIntervals(p.file, clipDur)]);
      let raw = await geminiRequest(audio, language);
      const aligned = await alignWords(p.file, raw, language);
      if (aligned.words) {
        alignment.aligned++;
        results[i] = normalizeWords(sanitizeTimings(aligned.words, clipDur), p.start);
        continue;
      }
      alignment.reason ??= aligned.reason;
      for (let attempt = 0; attempt < 2 && timingsLookBroken(raw, clipDur, speech); attempt++) {
        console.warn(`[gemini] chunk ${i} timings look broken, retrying (${attempt + 1})`);
        raw = await geminiRequest(audio, language);
      }
      if (timingsLookBroken(raw, clipDur, speech)) {
        console.warn(`[gemini] chunk ${i}: using speech-based timing fallback`);
        raw = distributeOverSpeech(raw, speech);
      }
      results[i] = normalizeWords(sanitizeTimings(raw, clipDur), p.start);
    }
  }));
  return { words: results.flat(), language: language === 'auto' ? 'unknown' : language, alignment };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function resolveProvider(provider: Provider): Concrete {
  const has: Record<Concrete, boolean> = {
    elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
  };
  const envName: Record<Concrete, string> = { elevenlabs: 'ELEVENLABS_API_KEY', gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY' };
  if (provider !== 'auto') {
    if (!has[provider]) throw new HttpError(400, `${provider} transcription needs ${envName[provider]} to be set on the server.`);
    return provider;
  }
  // Preference for Sinhala accuracy: ElevenLabs Scribe, then Gemini, then Whisper.
  const order: Concrete[] = ['elevenlabs', 'gemini', 'openai'];
  const found = order.find((p) => has[p]);
  if (found) return found;
  throw new HttpError(400,
    'No transcription provider is configured. Set ELEVENLABS_API_KEY, GEMINI_API_KEY or OPENAI_API_KEY in server/.env.');
}

/** Transcribes a media file that has already been saved into `dir`. Caller owns cleanup of `dir`. */
export async function transcribeFile(
  inputPath: string,
  dir: string,
  language: Language,
  provider: Provider,
): Promise<TranscribeResponse> {
  const chosen = resolveProvider(provider);

  // Mono 16 kHz lossless FLAC: no encoder delay, so chunk and aligner timings stay exact. Whisper gets an MP3 made
  // from it (its 25 MB limit); the aligner then re-times Whisper's words against the FLAC.
  const audioPath = path.join(dir, 'audio.flac');
  await ffmpeg(['-i', inputPath, '-vn', '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-c:a', 'flac', audioPath]);

  let result: { words: Word[]; language: string; alignment?: Alignment };
  if (chosen === 'gemini') result = await transcribeGemini(audioPath, language, dir);
  else {
    let raw: { words: Word[]; language: string };
    if (chosen === 'elevenlabs') raw = await transcribeElevenLabs(audioPath, language);
    else {
      const mp3Path = path.join(dir, 'audio.mp3');
      await ffmpeg(['-i', audioPath, '-c:a', 'libmp3lame', '-b:a', '64k', mp3Path]);
      raw = await transcribeOpenAI(mp3Path, language, dir);
    }
    // Every engine's words are re-timed from the audio; transcriber timings are only the fallback.
    result = { ...raw, ...(await alignTranscript(audioPath, raw.words, language, dir)) };
  }

  const duration = (await probeDuration(inputPath))
    ?? (await probeDuration(audioPath))
    ?? (result.words.length ? result.words[result.words.length - 1].end : 0);

  return { provider: chosen, language: result.language, duration, words: result.words, ...(result.alignment ? { alignment: result.alignment } : {}) };
}
