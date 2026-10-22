/**
 * Transparent caption export as Apple ProRes 4444 + alpha (.mov), encoded by the local ffmpeg.
 *
 * ProRes 4444 is the alpha format every editor reads natively: After Effects, Premiere, Final Cut,
 * DaVinci Resolve. (PNG / Animation MOVs no longer decode on modern macOS.) The browser renders the
 * caption frames with the same compositor as the preview and streams them here; ffmpeg does the encode.
 * Frames arrive with straight alpha and are written premultiplied, the convention editors expect for ProRes.
 *
 *   POST   /api/export/prores?width&height&fpsNum&fpsDen[&sampleRate&channels]
 *            body: interleaved s16le PCM soundtrack (empty for a silent file) -> { id, encoder }
 *   POST   /api/export/prores/:id/frames   body: frame records (below)      -> { frames }
 *   POST   /api/export/prores/:id/finish   -> the .mov file (video/quicktime)
 *   DELETE /api/export/prores/:id          -> cancel and clean up
 *
 * Frame records, back to back (little-endian):
 *   u8 0                          blank (fully transparent) frame
 *   u8 1                          repeat the previous frame
 *   u8 2, u16 x, y, w, h, w*h*4   RGBA (straight alpha) for that box; everything outside it is transparent
 * Captions cover a small part of the frame, so sending only the box keeps the transfer small.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { randomUUID } from 'node:crypto';
import type { Context } from 'hono';
import { HttpError } from './errors.js';
import { ffmpegPath, makeTempDir, removeTempDir } from './transcribe.js';

interface Box { x: number; y: number; w: number; h: number }

interface Session {
  dir: string;
  out: string;
  width: number;
  height: number;
  child: ChildProcessWithoutNullStreams;
  exit: Promise<number>;
  stderr: string;
  frame: Buffer;
  box: Box | null; // painted area of `frame`; the rest is zero
  frames: number;
  touched: number;
}

const sessions = new Map<string, Session>();
const IDLE_MS = 10 * 60_000;

// Abandoned exports (tab closed mid-render) are killed and cleaned up.
setInterval(() => {
  for (const [id, s] of sessions) if (Date.now() - s.touched > IDLE_MS) void close(id);
}, 60_000).unref();

async function close(id: string) {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  if (s.child.exitCode === null) s.child.kill('SIGKILL');
  await s.exit.catch(() => {});
  await removeTempDir(s.dir).catch((e) => console.warn('temp cleanup failed:', e));
}

let encoderCache: Promise<'prores_videotoolbox' | 'prores_ks'> | null = null;

/** Hardware ProRes (Apple silicon / macOS) is ~10x faster; fall back to ffmpeg's portable encoder. */
function pickEncoder() {
  encoderCache ??= new Promise((resolve) => {
    const p = spawn(ffmpegPath(), ['-hide_banner', '-nostdin', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=c=black@0:s=64x64:d=0.1,format=rgba', '-vf', 'format=ayuv64le',
      '-c:v', 'prores_videotoolbox', '-profile:v', '4444', '-f', 'null', '-']);
    p.on('error', () => resolve('prores_ks'));
    p.on('close', (code) => resolve(code === 0 ? 'prores_videotoolbox' : 'prores_ks'));
  });
  return encoderCache;
}

const int = (c: Context, name: string, min: number, max: number, fallback?: number) => {
  const raw = c.req.query(name);
  const v = raw === undefined ? fallback : Number(raw);
  if (v === undefined || !Number.isInteger(v) || v < min || v > max) throw new HttpError(400, `Invalid ${name}.`);
  return v;
};

export async function startProRes(c: Context) {
  const width = int(c, 'width', 16, 8192);
  const height = int(c, 'height', 16, 8192);
  const fpsNum = int(c, 'fpsNum', 1, 480_000);
  const fpsDen = int(c, 'fpsDen', 1, 100_000);
  const sampleRate = int(c, 'sampleRate', 0, 192_000, 0);
  const channels = int(c, 'channels', 0, 2, 0);

  const dir = await makeTempDir();
  try {
    const audio = path.join(dir, 'audio.pcm');
    const withAudio = sampleRate > 0 && channels > 0 && !!c.req.raw.body;
    if (withAudio) await pipeline(Readable.fromWeb(c.req.raw.body as NodeReadableStream), createWriteStream(audio));
    const hasAudio = withAudio && (await stat(audio)).size > 0;

    const encoder = await pickEncoder();
    const out = path.join(dir, 'captions.mov');
    // Premultiplied alpha, the ProRes 4444 convention (After Effects, Motion and Final Cut write it this way and
    // most editors read it that way); straight alpha shows soft edges, blur and fades as solid blobs there.
    // Done at 16 bits so opaque colors stay exact. Then BT.709 limited range, tagged, to match the preview.
    const color = 'format=gbrap16le,premultiply=inplace=1,scale=out_color_matrix=bt709:out_range=tv,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv';
    const args = [
      '-hide_banner', '-nostdin', '-y', '-loglevel', 'error',
      '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-framerate', `${fpsNum}/${fpsDen}`, '-i', 'pipe:0',
      ...(hasAudio ? ['-f', 's16le', '-ar', String(sampleRate), '-ac', String(channels), '-i', audio] : []),
      '-map', '0:v', ...(hasAudio ? ['-map', '1:a', '-c:a', 'pcm_s16le'] : []),
      ...(encoder === 'prores_videotoolbox'
        ? ['-vf', `${color},format=ayuv64le`, '-c:v', 'prores_videotoolbox', '-profile:v', '4444']
        : ['-vf', color, '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16', '-vendor', 'apl0']),
      out,
    ];
    const child = spawn(ffmpegPath(), args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const session: Session = {
      dir, out, width, height, child, stderr: '', frame: Buffer.alloc(width * height * 4), box: null, frames: 0, touched: Date.now(),
      exit: new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (code) => resolve(code ?? -1)); }),
    };
    child.stdout.resume();
    child.stderr.on('data', (d: Buffer) => { session.stderr = (session.stderr + d.toString()).slice(-8000); });
    child.stdin.on('error', () => {}); // surfaced through the exit code instead
    session.exit.catch(() => {});
    const id = randomUUID();
    sessions.set(id, session);
    return c.json({ id, encoder });
  } catch (e) {
    await removeTempDir(dir).catch(() => {});
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new HttpError(500, 'ffmpeg is not installed. Install it (brew install ffmpeg) or set FFMPEG_PATH.');
    throw e;
  }
}

function session(c: Context): Session {
  const s = sessions.get(c.req.param('id') ?? '');
  if (!s) throw new HttpError(404, 'This export has expired. Start it again.');
  s.touched = Date.now();
  return s;
}

function failure(s: Session) {
  const detail = s.stderr.trim().split('\n').slice(-3).join(' ');
  return new HttpError(500, `ffmpeg stopped while encoding ProRes${detail ? `: ${detail}` : '.'}`);
}

/** Write one full frame to ffmpeg and wait until it has been handed to the OS (the buffer is reused). */
function writeFrame(s: Session): Promise<void> {
  if (s.child.exitCode !== null || s.child.stdin.destroyed) return Promise.reject(failure(s));
  return new Promise((resolve, reject) => s.child.stdin.write(s.frame, (err) => (err ? reject(failure(s)) : resolve())));
}

function clearBox(s: Session) {
  const b = s.box;
  if (!b) return;
  const stride = s.width * 4;
  for (let y = b.y; y < b.y + b.h; y++) s.frame.fill(0, y * stride + b.x * 4, y * stride + (b.x + b.w) * 4);
  s.box = null;
}

export async function proResFrames(c: Context) {
  const s = session(c);
  const body = Buffer.from(await c.req.arrayBuffer());
  const stride = s.width * 4;
  let o = 0;
  while (o < body.length) {
    const kind = body[o++];
    if (kind === 0) clearBox(s);
    else if (kind === 2) {
      if (o + 8 > body.length) throw new HttpError(400, 'Truncated frame record.');
      const b = { x: body.readUInt16LE(o), y: body.readUInt16LE(o + 2), w: body.readUInt16LE(o + 4), h: body.readUInt16LE(o + 6) };
      o += 8;
      const bytes = b.w * b.h * 4;
      if (b.x + b.w > s.width || b.y + b.h > s.height || o + bytes > body.length) throw new HttpError(400, 'Frame record is out of bounds.');
      clearBox(s);
      for (let row = 0; row < b.h; row++) body.copy(s.frame, (b.y + row) * stride + b.x * 4, o + row * b.w * 4, o + (row + 1) * b.w * 4);
      o += bytes;
      s.box = b;
    } else if (kind !== 1) throw new HttpError(400, `Unknown frame record ${kind}.`);
    await writeFrame(s);
    s.frames++;
  }
  return c.json({ frames: s.frames });
}

export async function finishProRes(c: Context) {
  const id = c.req.param('id') ?? '';
  const s = session(c);
  s.child.stdin.end();
  const code = await s.exit;
  if (code !== 0 || !s.frames) {
    const err = failure(s);
    await close(id);
    throw err;
  }
  sessions.delete(id);
  const { size } = await stat(s.out);
  const file = createReadStream(s.out);
  file.on('close', () => void removeTempDir(s.dir).catch((e) => console.warn('temp cleanup failed:', e)));
  return new Response(Readable.toWeb(file) as ReadableStream, {
    headers: { 'Content-Type': 'video/quicktime', 'Content-Length': String(size) },
  });
}

export async function cancelProRes(c: Context) {
  await close(c.req.param('id') ?? '');
  return c.json({ ok: true });
}
