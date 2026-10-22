import {
  ALL_FORMATS, AudioBufferSource, BlobSource, BufferTarget, CanvasSink, CanvasSource, Conversion, EncodedPacketSink, EncodedVideoPacketSource,
  getFirstEncodableAudioCodec, Input, Mp4OutputFormat, Output, QUALITY_HIGH, QUALITY_VERY_HIGH, WebMOutputFormat,
} from 'mediabunny';
import { needsMix } from '../audio/mix';
import { renderSoundtrack } from '../audio/render';
import { isSimple, sourceTimeAt, videoClips } from './clips';
import type { Project } from '../types';
import { composeFrame, outputSize } from '../render/compose';
import { getBlob } from './db';
import { ensureFonts } from './fonts';
import { projectFontIds } from './util';

/** Chroma-key colors for caption-only exports: pure green and pure blue key cleanly in every editor. */
export const SCREEN_COLORS = { green: '#00FF00', blue: '#0000FF', transparent: 'transparent' } as const;
export type ScreenColor = keyof typeof SCREEN_COLORS;

/** Container for transparent exports: ProRes 4444 MOV (encoded by the local server's ffmpeg) or VP9 WebM with alpha. */
export type AlphaFormat = 'mov' | 'webm';

/** H.264 MP4 has no alpha channel, so transparent exports use MOV or WebM instead. */
export const exportExtension = (screen?: ScreenColor, alphaFormat: AlphaFormat = 'mov') =>
  (screen === 'transparent' ? alphaFormat : 'mp4');

export interface ExportOptions {
  longSide: 1280 | 1920 | 2560 | 3840;
  quality: 'high' | 'very-high';
  /** Captions only, on a chroma-key color or a transparent background instead of the video (for overlaying in another editor). */
  screen?: ScreenColor;
  /** Keep the soundtrack in a screen export (handy for lining it up). Always true for normal exports. */
  screenAudio?: boolean;
  /** Container for `screen: 'transparent'` (default 'mov'). */
  alphaFormat?: AlphaFormat;
  onProgress: (p: number) => void;
  signal?: AbortSignal;
}

export async function loadBrollImages(p: Project) {
  const map = new Map<string, ImageBitmap>();
  for (const b of [...p.broll, ...(p.overlays ?? []).filter((o) => o.assetId).map((o) => ({ assetId: o.assetId! }))]) {
    if (map.has(b.assetId)) continue;
    const blob = await getBlob(b.assetId);
    if (blob) map.set(b.assetId, await createImageBitmap(blob));
  }
  return map;
}

/**
 * Burn captions into the video entirely in the browser (WebCodecs via mediabunny).
 * Decodes each source frame, paints it with the same compositor as the preview, re-encodes H.264,
 * and passes the original audio through untouched.
 */
export async function exportVideo(project: Project, opts: ExportOptions): Promise<Blob> {
  const first = videoClips(project.clips ?? [])[0];
  if (!first) throw new Error('This project has no video.');
  const file = await getBlob(first.assetId);
  if (!file) throw new Error('The video file is missing from local storage. Re-import it.');
  if (typeof VideoEncoder === 'undefined') throw new Error('This browser has no WebCodecs support. Use Chrome, Edge or Safari 17+.');

  await ensureFonts(projectFontIds(project));
  if (opts.screen === 'transparent' && (opts.alphaFormat ?? 'mov') === 'mov') return exportProRes(project, file, opts);
  // Anything edited (cuts, speed, several clips) goes through the frame-by-frame timeline renderer.
  if (!isSimple(project)) return exportClips(project, opts);
  const screen = opts.screen ? SCREEN_COLORS[opts.screen] : null;
  const alpha = opts.screen === 'transparent';
  const withAudio = !screen || opts.screenAudio !== false;
  const broll = screen ? new Map<string, ImageBitmap>() : await loadBrollImages(project);
  const { width, height } = outputSize(project, opts.longSide);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha });
  if (!ctx) throw new Error('Could not create a 2D canvas.');

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const output = new Output({ format: alpha ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });

  const mix = withAudio && needsMix(project);
  const conversion = await Conversion.init({
    input,
    output,
    // With a custom soundtrack the original audio is dropped here and the mastered mix is muxed in afterwards.
    audio: mix || !withAudio ? { discard: true } : undefined,
    video: {
      codec: alpha ? 'vp9' : 'avc',
      alpha: alpha ? 'keep' : 'discard',
      bitrate: opts.quality === 'very-high' ? QUALITY_VERY_HIGH : QUALITY_HIGH,
      forceTranscode: true,
      processedWidth: width,
      processedHeight: height,
      // Screen exports still walk the source frames, so frame rate, length and caption timing match a normal export exactly.
      process: (sample) => {
        if (screen) composeFrame(ctx, width, height, project, sample.timestamp, null, { background: screen, hideBroll: true });
        else composeFrame(ctx, width, height, project, sample.timestamp, (c, dx, dy, dw, dh) => sample.draw(c, dx, dy, dw, dh), { brollImages: broll });
        return canvas;
      },
    },
  });
  if (!conversion.isValid) {
    const reasons = conversion.discardedTracks.map((d) => `${d.track.type}: ${d.reason}`).join(', ');
    throw new Error(`This video can't be converted in the browser (${reasons || 'unsupported codec'}).`);
  }
  conversion.onProgress = (p) => opts.onProgress(mix ? p * 0.85 : p);
  const onAbort = () => void conversion.cancel();
  opts.signal?.addEventListener('abort', onAbort);
  try {
    await conversion.execute();
  } finally {
    opts.signal?.removeEventListener('abort', onAbort);
    broll.forEach((b) => b.close());
  }
  const buf = (output.target as BufferTarget).buffer;
  if (!buf) throw new Error('Export produced no data.');
  const video = new Blob([buf], { type: alpha ? 'video/webm' : 'video/mp4' });
  if (!mix) return video;

  opts.onProgress(0.86);
  const duration = project.duration || (await new Input({ source: new BlobSource(video), formats: ALL_FORMATS }).computeDuration());
  const soundtrack = await renderSoundtrack(project, file, duration);
  if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  opts.onProgress(0.93);
  return muxSoundtrack(video, soundtrack, alpha);
}

/** Copy the encoded video packets as-is and add the mastered soundtrack as a new AAC (or Opus, for WebM) track. */
async function muxSoundtrack(video: Blob, soundtrack: AudioBuffer, webm: boolean): Promise<Blob> {
  const input = new Input({ source: new BlobSource(video), formats: ALL_FORMATS });
  const vtrack = await input.getPrimaryVideoTrack();
  if (!vtrack) throw new Error('Rendered video track is missing.');
  const codec = await getFirstEncodableAudioCodec(webm ? ['opus'] : ['aac', 'opus'], { numberOfChannels: 2, sampleRate: soundtrack.sampleRate, bitrate: 192_000 });
  if (!codec) throw new Error(`This browser cannot encode ${webm ? 'Opus' : 'AAC'} audio.`);
  const output = new Output({ format: webm ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const vsrc = new EncodedVideoPacketSource(webm ? 'vp9' : 'avc');
  output.addVideoTrack(vsrc);
  const asrc = new AudioBufferSource({ codec, bitrate: 192_000 });
  output.addAudioTrack(asrc);
  await output.start();
  const decoderConfig = await vtrack.getDecoderConfig();
  let first = true;
  for await (const packet of new EncodedPacketSink(vtrack).packets()) {
    await vsrc.add(packet, first && decoderConfig ? { decoderConfig } : undefined);
    first = false;
  }
  // Feed audio in 1-second chunks to keep encoder memory flat.
  const step = soundtrack.sampleRate;
  for (let i = 0; i < soundtrack.length; i += step) {
    const len = Math.min(step, soundtrack.length - i);
    const chunk = new AudioBuffer({ length: len, numberOfChannels: soundtrack.numberOfChannels, sampleRate: soundtrack.sampleRate });
    for (let c = 0; c < soundtrack.numberOfChannels; c++) chunk.copyToChannel(soundtrack.getChannelData(c).subarray(i, i + len), c);
    await asrc.add(chunk);
  }
  vsrc.close();
  asrc.close();
  await output.finalize();
  const buf = (output.target as BufferTarget).buffer;
  if (!buf) throw new Error('Export produced no data.');
  return new Blob([buf], { type: webm ? 'video/webm' : 'video/mp4' });
}

/** Common editing frame rates; a measured source rate snaps to the nearest one so editors see clean CFR timing. */
const STANDARD_RATES = [[24000, 1001], [24, 1], [25, 1], [30000, 1001], [30, 1], [48, 1], [50, 1], [60000, 1001], [60, 1]] as const;

function snapFrameRate(rate: number): { num: number; den: number } {
  if (!(rate > 0)) return { num: 30, den: 1 };
  const [num, den] = STANDARD_RATES.reduce((a, b) => (Math.abs(b[0] / b[1] - rate) < Math.abs(a[0] / a[1] - rate) ? b : a));
  return Math.abs(num / den - rate) / rate < 0.01 ? { num, den } : { num: Math.round(rate * 1000), den: 1000 };
}

/** Float channels → interleaved little-endian signed 16-bit PCM. */
function toPcm16(buf: AudioBuffer, channels: 1 | 2): Uint8Array<ArrayBuffer> {
  const out = new DataView(new ArrayBuffer(buf.length * channels * 2));
  const data = Array.from({ length: channels }, (_, c) => buf.getChannelData(Math.min(c, buf.numberOfChannels - 1)));
  for (let i = 0; i < buf.length; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      out.setInt16((i * channels + c) * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    }
  }
  return new Uint8Array(out.buffer);
}

interface Box { x: number; y: number; w: number; h: number }

/** Smallest box holding every non-transparent pixel, or null for a fully transparent frame. */
function opaqueBox(px: Uint32Array, w: number, h: number): Box | null {
  const rowEmpty = (y: number) => { for (let i = y * w, e = i + w; i < e; i++) if (px[i]) return false; return true; };
  let top = 0, bottom = h - 1;
  while (top < h && rowEmpty(top)) top++;
  if (top === h) return null;
  while (rowEmpty(bottom)) bottom--;
  let left = w, right = -1;
  for (let y = top; y <= bottom; y++) {
    const row = y * w;
    for (let x = 0; x < left; x++) if (px[row + x]) { left = x; break; }
    for (let x = w - 1; x > right; x--) if (px[row + x]) { right = x; break; }
  }
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

const sameFrame = (a: Box | null, ad: Uint32Array | null, b: Box | null, bd: Uint32Array | null) => {
  if (!a || !b || !ad || !bd) return !a && !b;
  if (a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h) return false;
  for (let i = 0; i < ad.length; i++) if (ad[i] !== bd[i]) return false;
  return true;
};

async function api(url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new Error('ProRes export needs the Keyframe.lk server running (npm run dev).');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `ProRes export failed (HTTP ${res.status}).`);
  }
  return res;
}

const BINARY = { 'Content-Type': 'application/octet-stream' };

/**
 * Captions only, as Apple ProRes 4444 with alpha in a MOV: the transparent format After Effects, Premiere,
 * Final Cut and DaVinci Resolve all read natively. Frames are painted here with the preview's compositor at a
 * constant rate snapped from the source (so timing matches a normal export) and streamed to the local server,
 * where ffmpeg encodes them. Only the box around the captions is sent, and a repeated frame is sent as a flag.
 */
async function exportProRes(project: Project, file: Blob, opts: ExportOptions): Promise<Blob> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  const duration = project.duration || (await input.computeDuration());
  const fps = snapFrameRate(track ? (await track.computePacketStats(120)).averagePacketRate : 30);
  const frameCount = Math.max(1, Math.round((duration * fps.num) / fps.den));
  const { width, height } = outputSize(project, opts.longSide);
  const signal = opts.signal;

  const soundtrack = opts.screenAudio !== false ? await renderSoundtrack(project, file, duration) : null;
  signal?.throwIfAborted();
  const channels = soundtrack && soundtrack.numberOfChannels > 1 ? 2 : 1;
  const start = soundtrack ? 0.1 : 0.02;
  opts.onProgress(start);

  const q = new URLSearchParams({ width: String(width), height: String(height), fpsNum: String(fps.num), fpsDen: String(fps.den) });
  if (soundtrack) { q.set('sampleRate', String(soundtrack.sampleRate)); q.set('channels', String(channels)); }
  const { id } = (await (await api(`/api/export/prores?${q}`, {
    method: 'POST', body: soundtrack ? toPcm16(soundtrack, channels) : undefined, headers: BINARY, signal,
  })).json()) as { id: string };
  const base = `/api/export/prores/${id}`;

  try {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha: true }); // GPU canvas: willReadFrequently forces CPU raster, ~10x slower here
    if (!ctx) throw new Error('Could not create a 2D canvas.');
    let parts: BlobPart[] = [];
    let bytes = 0, frames = 0, sent = 0;
    let uploading: Promise<void> = Promise.resolve();
    // One batch uploads while the next renders; awaiting the previous upload keeps memory bounded.
    const flush = async () => {
      if (!frames) return;
      const body = new Blob(parts), n = frames;
      parts = []; bytes = 0; frames = 0;
      await uploading;
      uploading = api(`${base}/frames`, { method: 'POST', body, headers: BINARY, signal }).then(() => {
        sent += n;
        opts.onProgress(start + (0.97 - start) * (sent / frameCount));
      });
    };

    let prevBox: Box | null = null, prevData: Uint32Array<ArrayBuffer> | null = null;
    for (let i = 0; i < frameCount; i++) {
      signal?.throwIfAborted();
      composeFrame(ctx, width, height, project, (i * fps.den) / fps.num, null, { background: 'transparent', hideBroll: true });
      const px = new Uint32Array(ctx.getImageData(0, 0, width, height).data.buffer);
      const box = opaqueBox(px, width, height);
      let data: Uint32Array<ArrayBuffer> | null = null;
      if (box) {
        data = new Uint32Array(box.w * box.h);
        for (let y = 0; y < box.h; y++) {
          const from = (box.y + y) * width + box.x;
          data.set(px.subarray(from, from + box.w), y * box.w);
        }
      }
      if (i > 0 && sameFrame(box, data, prevBox, prevData)) parts.push(Uint8Array.of(1));
      else if (!box || !data) parts.push(Uint8Array.of(0));
      else {
        const head = new DataView(new ArrayBuffer(9));
        head.setUint8(0, 2);
        head.setUint16(1, box.x, true); head.setUint16(3, box.y, true); head.setUint16(5, box.w, true); head.setUint16(7, box.h, true);
        parts.push(head, data);
        bytes += data.byteLength;
      }
      prevBox = box; prevData = data;
      frames++;
      if (bytes > 24 * 1024 * 1024 || frames >= 60) await flush();
    }
    await flush();
    await uploading;
    opts.onProgress(0.98);
    const mov = await (await api(`${base}/finish`, { method: 'POST', signal })).blob();
    opts.onProgress(1);
    return new Blob([mov], { type: 'video/quicktime' });
  } catch (e) {
    void fetch(base, { method: 'DELETE' }).catch(() => {});
    throw e;
  }
}

/**
 * Render the timeline frame by frame: for each output frame pick the video clip under it, decode the
 * source frame at the clip's (speed-adjusted) time, compose captions and effects on top, encode.
 * Audio is the mixed timeline soundtrack (time-stretched clips, music, effects).
 */
async function exportClips(project: Project, opts: ExportOptions): Promise<Blob> {
  const screen = opts.screen ? SCREEN_COLORS[opts.screen] : null;
  const alpha = opts.screen === 'transparent';
  const withAudio = !screen || opts.screenAudio !== false;
  const clips = videoClips(project.clips ?? []);
  const duration = project.duration;
  if (!(duration > 0)) throw new Error('The timeline is empty.');
  const { width, height } = outputSize(project, opts.longSide);
  const signal = opts.signal;

  // One decoder per source file; frame rate follows the first clip.
  const sinks = new Map<string, { sink: CanvasSink; input: Input }>();
  let fps = { num: 30, den: 1 };
  for (const c of clips) {
    if (sinks.has(c.assetId)) continue;
    const blob = await getBlob(c.assetId);
    if (!blob) throw new Error(`The file for “${c.name}” is missing from local storage. Re-import it.`);
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) throw new Error(`This browser cannot decode “${c.name}”.`);
    if (sinks.size === 0) fps = snapFrameRate((await track.computePacketStats(120)).averagePacketRate);
    sinks.set(c.assetId, { sink: new CanvasSink(track), input });
  }
  const rate = Math.min(60, fps.num / fps.den);
  const frameCount = Math.max(1, Math.round(duration * rate));

  opts.onProgress(0.01);
  const soundtrack = withAudio ? await renderSoundtrack(project, null, duration) : null;
  signal?.throwIfAborted();
  const aCodec = soundtrack ? await getFirstEncodableAudioCodec(alpha ? ['opus'] : ['aac', 'opus'], { numberOfChannels: 2, sampleRate: soundtrack.sampleRate, bitrate: 192_000 }) : null;
  if (soundtrack && !aCodec) throw new Error(`This browser cannot encode ${alpha ? 'Opus' : 'AAC'} audio.`);
  opts.onProgress(0.1);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha });
  if (!ctx) throw new Error('Could not create a 2D canvas.');
  const broll = screen ? new Map<string, ImageBitmap>() : await loadBrollImages(project);
  const output = new Output({ format: alpha ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const vsrc = new CanvasSource(canvas, { codec: alpha ? 'vp9' : 'avc', bitrate: opts.quality === 'very-high' ? QUALITY_VERY_HIGH : QUALITY_HIGH, alpha: alpha ? 'keep' : 'discard' });
  output.addVideoTrack(vsrc, { frameRate: rate });
  const asrc = soundtrack && aCodec ? new AudioBufferSource({ codec: aCodec, bitrate: 192_000 }) : null;
  if (asrc) output.addAudioTrack(asrc);
  await output.start();

  try {
    // Every video clip (on any track) gets one decoder pass over its frames, pulled in lockstep with the output frames it covers.
    const range = (c: typeof clips[number]) => {
      const i0 = Math.max(0, Math.ceil(c.start * rate - 0.5)), i1 = Math.min(frameCount, Math.ceil((c.start + c.duration) * rate - 0.5));
      return { i0, i1 };
    };
    const runs = new Map<string, { gen: AsyncGenerator<{ canvas: HTMLCanvasElement | OffscreenCanvas } | null>; i0: number; i1: number }>();
    if (!screen) {
      for (const c of clips) {
        const { i0, i1 } = range(c);
        if (i1 <= i0) continue;
        const ts: number[] = [];
        for (let k = i0; k < i1; k++) ts.push(Math.max(0, Math.min(sourceTimeAt(c, k / rate), c.sourceDuration - 0.002)));
        runs.set(c.id, { gen: sinks.get(c.assetId)!.sink.canvasesAtTimestamps(ts), i0, i1 });
      }
    }
    for (let k = 0; k < frameCount; k++) {
      signal?.throwIfAborted();
      const t = k / rate;
      const frames = new Map<string, HTMLCanvasElement | OffscreenCanvas | null>();
      for (const [id, r] of runs) {
        if (k < r.i0 || k >= r.i1) continue;
        const got = (await r.gen.next()).value ?? null;
        frames.set(id, got?.canvas ?? null);
      }
      if (screen) composeFrame(ctx, width, height, project, t, null, { background: screen, hideBroll: true });
      else {
        composeFrame(ctx, width, height, project, t, null, {
          brollImages: broll,
          frameFor: (c) => {
            const src = frames.get(c.id);
            return src ? { draw: (x, dx, dy, dw, dh) => x.drawImage(src, dx, dy, dw, dh), w: src.width, h: src.height } : null;
          },
        });
      }
      await vsrc.add(t, 1 / rate);
      if (k % 8 === 0) opts.onProgress(0.1 + 0.8 * (k / frameCount));
    }
    vsrc.close();
    if (asrc && soundtrack) {
      const step = soundtrack.sampleRate;
      for (let k = 0; k < soundtrack.length; k += step) {
        signal?.throwIfAborted();
        const len = Math.min(step, soundtrack.length - k);
        const chunk = new AudioBuffer({ length: len, numberOfChannels: soundtrack.numberOfChannels, sampleRate: soundtrack.sampleRate });
        for (let c = 0; c < soundtrack.numberOfChannels; c++) chunk.copyToChannel(soundtrack.getChannelData(c).subarray(k, k + len), c);
        await asrc.add(chunk);
      }
      asrc.close();
    }
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => {});
    throw e;
  } finally {
    broll.forEach((b) => b.close());
  }
  const buf = (output.target as BufferTarget).buffer;
  if (!buf) throw new Error('Export produced no data.');
  opts.onProgress(1);
  return new Blob([buf], { type: alpha ? 'video/webm' : 'video/mp4' });
}
