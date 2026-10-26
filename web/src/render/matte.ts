import type { MatteSettings, RegionBlur, VideoLayer } from '../types';
import type { Ctx2D } from './captions';
import type { FrameSource } from './compose';

/**
 * Per-clip background removal and blur, applied to the source frame before the clip is cropped, transformed and filtered.
 * Works on a working copy of the frame (at most 1280 px wide): a colour key, or an AI person mask, then optional
 * replacement of the background (nothing, a colour, or the same shot blurred), then any blurred / mosaic areas.
 */

type Cvs = HTMLCanvasElement | OffscreenCanvas;
const WORK_W = 1280;

const make = (w: number, h: number): Cvs =>
  typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
const ctxOf = (c: Cvs): Ctx2D => c.getContext('2d', { willReadFrequently: true }) as Ctx2D;
const hasFilter = (c: Ctx2D) => typeof (c as { filter?: unknown }).filter === 'string';

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// ---------- AI person segmentation (MediaPipe selfie segmenter, loaded on first use) ----------

const VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

interface MpMask { width: number; height: number; getAsFloat32Array(): Float32Array; close(): void }
interface Segmenter { segmentForVideo(img: CanvasImageSource, ts: number): { confidenceMasks?: MpMask[]; close?: () => void } }

export type SegmenterState = 'idle' | 'loading' | 'ready' | 'error';
let segmenter: Segmenter | null = null;
let state: SegmenterState = 'idle';
let loading: Promise<void> | null = null;
let lastError = '';
const listeners = new Set<() => void>();

export const segmenterState = () => ({ state, error: lastError });
/** Called when the model finishes loading (or fails), so the preview can redraw. */
export const onSegmenterChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function loadSegmenter(): Promise<void> {
  if (state === 'ready') return Promise.resolve();
  if (loading) return loading;
  state = 'loading';
  listeners.forEach((l) => l());
  loading = (async () => {
    try {
      const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${VISION}/vision_bundle.mjs`);
      const files = await mod.FilesetResolver.forVisionTasks(`${VISION}/wasm`);
      const make = (delegate: 'GPU' | 'CPU') => mod.ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false,
      });
      try { segmenter = await make('GPU'); } catch { segmenter = await make('CPU'); }
      state = 'ready';
    } catch (e) {
      state = 'error';
      lastError = (e as Error).message || 'The AI model could not be loaded. Check your internet connection.';
      loading = null; // allow a retry
    }
    listeners.forEach((l) => l());
  })();
  return loading;
}

// ---------- precise person matting (MODNet via onnxruntime-web, loaded on first use) ----------

const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist';
const MODNET = 'https://huggingface.co/Xenova/modnet/resolve/main/onnx/model.onnx';

interface OrtSession { inputNames: string[]; outputNames: string[]; run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array; dims: number[] }>> }
interface OrtLib { Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown; env: { logLevel: string; wasm: { wasmPaths: string; numThreads: number } }; InferenceSession: { create(model: ArrayBuffer | string, opts: unknown): Promise<OrtSession> } }

let ortLib: OrtLib | null = null;
let modnet: OrtSession | null = null;
let preciseState: SegmenterState = 'idle';
let preciseLoading: Promise<void> | null = null;
let preciseError = '';
let preciseProgress = 0;
let preciseBackend = '';

export const preciseStatus = () => ({ state: preciseState, error: preciseError, progress: preciseProgress, backend: preciseBackend });

export function loadPrecise(): Promise<void> {
  if (preciseState === 'ready') return Promise.resolve();
  if (preciseLoading) return preciseLoading;
  preciseState = 'loading'; preciseProgress = 0;
  listeners.forEach((l) => l());
  preciseLoading = (async () => {
    try {
      ortLib = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${ORT}/ort.all.min.mjs`)) as unknown as OrtLib;
      ortLib.env.wasm.wasmPaths = `${ORT}/`;
      ortLib.env.wasm.numThreads = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
      // Download the model with progress, and keep it in the browser's cache so later sessions start at once.
      let cache: Cache | null = null;
      try { cache = await caches.open('keyframe-models'); } catch { /* private window: no cache */ }
      let res = (await cache?.match(MODNET)) ?? null;
      if (!res) {
        res = await fetch(MODNET);
        if (!res.ok) throw new Error(`The matting model could not be downloaded (${res.status}).`);
        void cache?.put(MODNET, res.clone()).catch(() => undefined);
      }
      const total = Number(res.headers.get('content-length')) || 25_888_640;
      const reader = res.body!.getReader();
      const parts: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value); got += value.length;
        preciseProgress = Math.min(1, got / total);
        listeners.forEach((l) => l());
      }
      const buf = new Uint8Array(got);
      let o = 0;
      for (const c of parts) { buf.set(c, o); o += c.length; }
      ortLib.env.logLevel = 'error'; // the "nodes assigned to CPU" notices are harmless but land in the console as errors
      try { modnet = await ortLib.InferenceSession.create(buf.buffer, { executionProviders: ['webgpu', 'wasm'], logSeverityLevel: 3 }); preciseBackend = 'GPU'; }
      catch { modnet = await ortLib.InferenceSession.create(buf.buffer, { executionProviders: ['wasm'], logSeverityLevel: 3 }); preciseBackend = 'CPU'; }
      preciseState = 'ready';
    } catch (e) {
      preciseState = 'error';
      preciseError = (e as Error).message || 'The matting model could not be loaded. Check your internet connection.';
      preciseLoading = null;
    }
    listeners.forEach((l) => l());
  })();
  return preciseLoading;
}

/**
 * Drop stray blobs from a matte: label the connected regions of (alpha > 0.15) and zero every region much smaller than
 * the biggest one, so a poster or lamp the model half-mistook for a person disappears while the person (and a raised hand
 * that touches them) stays.
 */
function dropIslands(arr: Float32Array, w: number, h: number, keep = 0.12) {
  const n = w * h, label = new Int32Array(n), stack = new Int32Array(n);
  const sizes: number[] = [0];
  let next = 1;
  for (let i = 0; i < n; i++) {
    if (label[i] || arr[i] <= 0.15) continue;
    let sp = 0, count = 0;
    stack[sp++] = i; label[i] = next;
    while (sp) {
      const p = stack[--sp]; count++;
      const x = p % w, y = (p / w) | 0;
      if (x > 0 && !label[p - 1] && arr[p - 1] > 0.15) { label[p - 1] = next; stack[sp++] = p - 1; }
      if (x < w - 1 && !label[p + 1] && arr[p + 1] > 0.15) { label[p + 1] = next; stack[sp++] = p + 1; }
      if (y > 0 && !label[p - w] && arr[p - w] > 0.15) { label[p - w] = next; stack[sp++] = p - w; }
      if (y < h - 1 && !label[p + w] && arr[p + w] > 0.15) { label[p + w] = next; stack[sp++] = p + w; }
    }
    sizes.push(count); next++;
  }
  const biggest = Math.max(0, ...sizes);
  if (!biggest) return;
  for (let i = 0; i < n; i++) if (label[i] && sizes[label[i]] < biggest * keep) arr[i] = 0;
}

/**
 * Close gaps the matting model leaves when the subject fills the frame: wherever the fast engine is very sure a pixel is
 * the person, the matte is raised to match. It only ever adds confident interior, so it does not bring back a halo.
 */
function assistWithFast(m: { alpha: Uint8Array; w: number; h: number }, frame: Cvs) {
  if (state !== 'ready') { void loadSegmenter(); return; }
  try {
    const res = segmenter!.segmentForVideo(frame as CanvasImageSource, ++tick * 33);
    const mk = res.confidenceMasks?.[0];
    if (!mk) return;
    const arr = mk.getAsFloat32Array(), mw = mk.width, mh = mk.height;
    for (let y = 0; y < m.h; y++) {
      const fy = Math.min(mh - 1, Math.floor((y * mh) / m.h)) * mw;
      for (let x = 0; x < m.w; x++) {
        const v = arr[fy + Math.min(mw - 1, Math.floor((x * mw) / m.w))];
        if (v > 0.93) { const a = Math.round(v * 255), i = y * m.w + x; if (m.alpha[i] < a) m.alpha[i] = a; }
      }
    }
    res.confidenceMasks?.forEach((x) => x.close());
  } catch { /* fast engine unavailable: keep the matting result as is */ }
}

/** MODNet alpha for a frame, 0..255 per pixel, at about 512 px on the short side. */
async function runModnet(frame: Cvs): Promise<PreciseMask> {
  const ort = ortLib!, sess = modnet!;
  const fw = frame.width, fh = frame.height;
  const k = 512 / Math.min(fw, fh);
  const iw = Math.max(32, Math.round((fw * k) / 32) * 32), ih = Math.max(32, Math.round((fh * k) / 32) * 32);
  const t = make(iw, ih), tx = ctxOf(t);
  tx.imageSmoothingQuality = 'high';
  tx.drawImage(frame as CanvasImageSource, 0, 0, iw, ih);
  const px = tx.getImageData(0, 0, iw, ih).data;
  const n = iw * ih, input = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    input[i] = px[i * 4] / 127.5 - 1;
    input[n + i] = px[i * 4 + 1] / 127.5 - 1;
    input[2 * n + i] = px[i * 4 + 2] / 127.5 - 1;
  }
  const out = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, ih, iw]) });
  const a = out[sess.outputNames[0]].data;
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) alpha[i] = a[i] <= 0 ? 0 : a[i] >= 1 ? 255 : Math.round(a[i] * 255);
  const out2 = { alpha, w: iw, h: ih };
  assistWithFast(out2, frame);
  return out2;
}

interface PreciseMask { alpha: Uint8Array; w: number; h: number }

/** Set by the preview each frame: while playing, an unprepared clip uses the fast engine so the mask never lags the picture. */
export const matteHints = { playing: false };

const GRID = 30; // matte frames per second of source video
const gridKey = (t: number) => Math.round(t * GRID);
const LIVE_FRAMES = 64;

/** Mattes of one source file: a small window of ready-to-use frames, and the whole prepared clip packed (deflate) in memory. */
interface Store {
  w: number; h: number;
  live: Map<number, PreciseMask>;
  packed: Map<number, Uint8Array>;
  unpacking: Set<number>;
  state: 'idle' | 'running' | 'done' | 'error';
  progress: number;
  error: string;
  abort: AbortController | null;
}
const stores = new Map<string, Store>();
const storeOf = (asset: string): Store => {
  let s = stores.get(asset);
  if (!s) { s = { w: 0, h: 0, live: new Map(), packed: new Map(), unpacking: new Set(), state: 'idle', progress: 0, error: '', abort: null }; stores.set(asset, s); }
  return s;
};

export const analysisStatus = (asset: string) => { const s = stores.get(asset); return { state: s?.state ?? 'idle', progress: s?.progress ?? 0, error: s?.error ?? '', frames: s?.packed.size ?? 0 }; };

const livePut = (s: Store, k: number, m: PreciseMask) => {
  s.live.delete(k); s.live.set(k, m);
  while (s.live.size > LIVE_FRAMES) s.live.delete(s.live.keys().next().value!);
};

async function pack(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
}
async function unpackBytes(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
}

async function unpack(s: Store, k: number) {
  if (s.live.has(k) || s.unpacking.has(k)) return;
  const bytes = s.packed.get(k);
  if (!bytes) return;
  s.unpacking.add(k);
  try { livePut(s, k, { alpha: await unpackBytes(bytes), w: s.w, h: s.h }); } finally { s.unpacking.delete(k); }
  listeners.forEach((l) => l());
}

/** The prepared (or already computed) matte for source time `t`, synchronously, or null. Unpacks the next frames in the background. */
function matteAt(asset: string, t: number, slack = 2): PreciseMask | null {
  const s = stores.get(asset);
  if (!s) return null;
  const k = gridKey(t);
  for (let j = 1; j <= 12; j++) if (s.packed.has(k + j) && !s.live.has(k + j)) void unpack(s, k + j);
  const hit = s.live.get(k);
  if (hit) return hit;
  if (s.packed.has(k)) void unpack(s, k);
  for (let d = 1; d <= slack; d++) { const m = s.live.get(k - d) ?? s.live.get(k + d); if (m) return m; }
  return null;
}

let busy = false;
let pending: { asset: string; k: number; frame: Cvs } | null = null;

/** Compute one matte in the background (latest request wins); redraws when it lands. Used while paused and for unprepared clips. */
function requestPrecise(asset: string, t: number, frame: Cvs) {
  if (preciseState !== 'ready') { void loadPrecise(); return; }
  const s = storeOf(asset), k = gridKey(t);
  if (s.live.has(k) || s.packed.has(k)) return;
  pending = { asset, k, frame };
  if (busy) return;
  busy = true;
  void (async () => {
    while (pending) {
      const job = pending; pending = null;
      try { const m = await runModnet(job.frame); const st = storeOf(job.asset); st.w = m.w; st.h = m.h; livePut(st, job.k, m); } catch (e) { console.warn('[matte] frame failed', e); }
      listeners.forEach((l) => l());
    }
    busy = false;
  })();
}

/** Snapshot of a source frame at working size, for the async model. */
function snapshot(src: FrameSource): Cvs {
  const pw = Math.min(WORK_W, Math.round(src.w)), ph = Math.max(1, Math.round((pw * src.h) / src.w));
  const c = make(pw, ph);
  src.draw(ctxOf(c), 0, 0, pw, ph);
  return c;
}

/**
 * Prepare a clip's cut-out: decode the used part of the source file in order, matte every frame (30 per second) and keep
 * the results packed in memory. Playback and export then read exact mattes with no waiting, and neighbouring frames are
 * smoothed so the edge does not flicker.
 */
export async function prepareCutout(asset: string, blob: Blob, from: number, to: number): Promise<void> {
  const s = storeOf(asset);
  if (s.state === 'running') return;
  s.abort?.abort();
  const ctl = new AbortController();
  s.abort = ctl; s.state = 'running'; s.progress = 0; s.error = '';
  listeners.forEach((l) => l());
  try {
    await Promise.all([loadPrecise(), loadSegmenter()]); // the fast model also fills gaps in the matte
    if (preciseState !== 'ready') throw new Error(preciseError || 'The matting model is not ready.');
    const { Input, BlobSource, ALL_FORMATS, CanvasSink } = await import('mediabunny');
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) throw new Error('This browser cannot decode the video for the cut-out.');
    const sink = new CanvasSink(track, { width: Math.min(720, track.displayWidth) });
    const first = gridKey(Math.max(0, from)), last = gridKey(Math.max(from, to));
    const ts: number[] = [];
    for (let k = first; k <= last; k++) ts.push(k / GRID);
    let prev: Uint8Array | null = null, i = 0;
    for await (const wrapped of sink.canvasesAtTimestamps(ts)) {
      ctl.signal.throwIfAborted();
      const k = first + i++;
      if (wrapped) {
        const m = await runModnet(wrapped.canvas);
        // Blend with the previous frame where the two agree (steadies the edge); keep the new one where the person moved.
        if (prev && prev.length === m.alpha.length) for (let j = 0; j < m.alpha.length; j++) { const d = m.alpha[j] - prev[j]; if (d < 48 && d > -48) m.alpha[j] = (m.alpha[j] * 0.65 + prev[j] * 0.35) | 0; }
        prev = m.alpha.slice();
        s.w = m.w; s.h = m.h;
        s.packed.set(k, await pack(m.alpha));
      }
      s.progress = Math.min(1, i / ts.length);
      if (i % 3 === 0) listeners.forEach((l) => l());
    }
    s.state = 'done'; s.progress = 1;
  } catch (e) {
    s.state = (e as Error).name === 'AbortError' ? 'idle' : 'error';
    s.error = (e as Error).message;
  } finally { s.abort = null; listeners.forEach((l) => l()); }
}

export const cancelCutout = (asset: string) => stores.get(asset)?.abort?.abort();
export const forgetCutout = (asset: string) => { stores.get(asset)?.abort?.abort(); stores.delete(asset); };

/**
 * Export: make sure the matte of every clip with the precise cut-out that shows at `t` is ready, so the synchronous
 * frame composer finds it. Prepared clips are just unpacked; others are computed here, frame by frame.
 */
export async function warmMattes(clips: { id: string; assetId: string; fx?: VideoLayer; start: number; duration: number; kind: string; in: number; speed: number; freeze?: boolean }[], t: number, frameFor: (id: string) => FrameSource | null) {
  for (const c of clips) {
    const m = c.fx?.matte;
    if (c.kind !== 'video' || !m || m.mode !== 'ai' || (m.engine ?? 'precise') !== 'precise') continue;
    if (t < c.start - 1e-6 || t >= c.start + c.duration - 1e-6) continue;
    const st = storeOf(c.assetId), srcT = c.freeze ? c.in : c.in + (t - c.start) * c.speed, k = gridKey(srcT);
    if (st.live.has(k)) continue;
    if (st.packed.has(k)) { await unpack(st, k); continue; }
    const src = frameFor(c.id);
    if (!src || !src.w) continue;
    const mm = await runModnet(snapshot(src));
    st.w = mm.w; st.h = mm.h;
    livePut(st, k, mm);
  }
}

/** Load the model(s) the project's clips need and fail loudly: an export must not silently skip the cut-out. */
export async function requireSegmenter(clips: { fx?: VideoLayer }[]) {
  const ai = clips.filter((c) => c.fx?.matte?.mode === 'ai');
  if (ai.some((c) => (c.fx!.matte!.engine ?? 'precise') === 'precise')) {
    await loadPrecise();
    if (preciseState !== 'ready') throw new Error(`The AI background cut-out could not start: ${preciseError || 'model not loaded'}`);
  }
  if (ai.some((c) => c.fx!.matte!.engine === 'fast')) {
    await loadSegmenter();
    if (state !== 'ready') throw new Error(`The AI background cut-out could not start: ${lastError || 'model not loaded'}`);
  }
}

let tick = 0;
let lastMask: { id: string; at: number; arr: Float32Array; w: number; h: number } | null = null;

/** Person confidence (0..1 per pixel) for the frame in `canvas`, or null while the model is not ready. */
function personMask(id: string, canvas: Cvs, t: number): { arr: Float32Array; w: number; h: number } | null {
  if (state !== 'ready') { void loadSegmenter(); return null; }
  const at = Math.round(t * 60);
  if (lastMask && lastMask.id === id && lastMask.at === at) return lastMask;
  try {
    const res = segmenter!.segmentForVideo(canvas as CanvasImageSource, ++tick * 33);
    const m = res.confidenceMasks?.[0];
    if (!m) return null;
    const arr = new Float32Array(m.getAsFloat32Array()); // copy: the model reuses its buffer
    const out = { id, at, arr, w: m.width, h: m.height };
    res.confidenceMasks?.forEach((x) => x.close());
    lastMask = out;
    return out;
  } catch {
    return null;
  }
}

// ---------- colour key ----------

/** Make the pixels near the key colour transparent, and pull the key colour's tint out of the edges. */
function chromaKey(img: ImageData, m: MatteSettings) {
  const d = img.data;
  const [kr, kg, kb] = rgb(m.keyColor);
  const cbOf = (r: number, g: number, b: number) => (-0.168736 * r - 0.331264 * g + 0.5 * b) / 255;
  const crOf = (r: number, g: number, b: number) => (0.5 * r - 0.418688 * g - 0.081312 * b) / 255;
  const kcb = cbOf(kr, kg, kb), kcr = crOf(kr, kg, kb);
  const sim = (m.similarity / 100) * 0.45, soft = Math.max(0.002, (m.smoothness / 100) * 0.35);
  const spill = m.spill / 100;
  const kc = kr >= kg && kr >= kb ? 0 : kg >= kb ? 1 : 2; // the key colour's dominant channel
  const saturated = Math.max(kr, kg, kb) - Math.min(kr, kg, kb) > 60;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const dist = Math.hypot(cbOf(r, g, b) - kcb, crOf(r, g, b) - kcr);
    let a = (dist - sim) / soft;
    a = a <= 0 ? 0 : a >= 1 ? 1 : a * a * (3 - 2 * a);
    if (m.invert) a = 1 - a;
    if (spill > 0 && saturated && a > 0) {
      const o1 = d[i + ((kc + 1) % 3)], o2 = d[i + ((kc + 2) % 3)], other = (o1 + o2) / 2;
      if (d[i + kc] > other) d[i + kc] = d[i + kc] - (d[i + kc] - other) * spill;
    }
    d[i + 3] = d[i + 3] * a;
  }
}

// ---------- shared canvases ----------

interface Work { w: number; h: number; base: Cvs; out: Cvs; tmp: Cvs; mask: Cvs; blur: Cvs; person: Cvs }
const works = new Map<string, Work>();

function workFor(id: string, w: number, h: number): Work {
  let k = works.get(id);
  if (!k || k.w !== w || k.h !== h) { k = { w, h, base: make(w, h), out: make(w, h), tmp: make(w, h), mask: make(w, h), blur: make(w, h), person: make(w, h) }; works.set(id, k); }
  return k;
}
const clear = (c: Cvs) => { const x = ctxOf(c); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.clearRect(0, 0, c.width, c.height); return x; };

/** Forget a clip's canvases (when it is deleted). */
export const releaseMatte = (id: string) => { works.delete(id); };

// ---------- the pipeline ----------

export const needsMatte = (l: Pick<VideoLayer, 'matte' | 'regionBlurs'>) => (!!l.matte && l.matte.mode !== 'none') || !!l.regionBlurs?.length;

/** Does any clip in the project use the AI cut-out? (so an export can load the model first) */
export const usesAiMatte = (clips: { fx?: VideoLayer }[]) => clips.some((c) => c.fx?.matte?.mode === 'ai');

/** Shift the mask in `m` outwards (grow) or inwards (shrink) by r px, using 8 offset copies. */
function morph(w: Work, r: number) {
  const x = ctxOf(w.tmp);
  const base = ctxOf(w.mask);
  clear(w.tmp);
  const dirs = Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4) * Math.abs(r), Math.sin((i * Math.PI) / 4) * Math.abs(r)]);
  if (r > 0) { x.drawImage(w.mask as CanvasImageSource, 0, 0); for (const [dx, dy] of dirs) x.drawImage(w.mask as CanvasImageSource, dx, dy); }
  else {
    x.drawImage(w.mask as CanvasImageSource, 0, 0);
    x.globalCompositeOperation = 'destination-in';
    for (const [dx, dy] of dirs) x.drawImage(w.mask as CanvasImageSource, dx, dy);
  }
  clear(w.mask);
  base.drawImage(w.tmp as CanvasImageSource, 0, 0);
}

function applyRegion(w: Work, r: RegionBlur) {
  const px = w.w / 1080;
  const out = ctxOf(w.out), blur = clear(w.blur);
  if (r.look === 'pixelate') {
    const block = Math.max(2, r.amount * px);
    const sw = Math.max(1, Math.round(w.w / block)), sh = Math.max(1, Math.round(w.h / block));
    const small = clear(w.tmp);
    small.imageSmoothingEnabled = true;
    small.drawImage(w.out as CanvasImageSource, 0, 0, sw, sh);
    blur.imageSmoothingEnabled = false;
    blur.drawImage(w.tmp as CanvasImageSource, 0, 0, sw, sh, 0, 0, w.w, w.h);
  } else if (hasFilter(blur)) {
    (blur as { filter: string }).filter = `blur(${Math.max(0.5, r.amount * px).toFixed(1)}px)`;
    blur.drawImage(w.out as CanvasImageSource, 0, 0);
    (blur as { filter: string }).filter = 'none';
  } else {
    blur.drawImage(w.out as CanvasImageSource, 0, 0);
  }
  // The area's mask: a white shape with a soft edge (or its inverse).
  const m = clear(w.mask);
  const cx = (r.x / 100) * w.w, cy = (r.y / 100) * w.h, rw = (r.w / 100) * w.w, rh = (r.h / 100) * w.h;
  const feather = (r.feather / 100) * Math.min(rw, rh) * 0.3;
  if (feather > 0.5 && hasFilter(m)) (m as { filter: string }).filter = `blur(${feather.toFixed(1)}px)`;
  m.fillStyle = '#fff';
  m.beginPath();
  if (r.shape === 'ellipse') m.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2); else m.rect(cx - rw / 2, cy - rh / 2, rw, rh);
  m.fill();
  (m as { filter: string }).filter = 'none';
  if (r.invert) { m.globalCompositeOperation = 'xor'; m.fillRect(0, 0, w.w, w.h); m.globalCompositeOperation = 'source-over'; }
  blur.globalCompositeOperation = 'destination-in';
  blur.drawImage(w.mask as CanvasImageSource, 0, 0);
  blur.globalCompositeOperation = 'source-over';
  out.drawImage(w.blur as CanvasImageSource, 0, 0);
}

/**
 * Run a clip's background removal and blurred areas over its source frame. Returns the processed frame (same shape as
 * the source, so cropping and fitting are unchanged), or the source itself when nothing is set or the AI model is still loading.
 */
export function processSource(id: string, src: FrameSource, layer: Pick<VideoLayer, 'matte' | 'regionBlurs'>, t: number, at?: { asset: string; srcT: number; cutout?: boolean }): FrameSource {
  if (!needsMatte(layer) || !src.w || !src.h) return src;
  const pw = Math.min(WORK_W, Math.round(src.w)), ph = Math.max(1, Math.round((pw * src.h) / src.w));
  const w = workFor(id, pw, ph);
  const base = clear(w.base);
  src.draw(base, 0, 0, pw, ph);
  const m = layer.matte && layer.matte.mode !== 'none' ? layer.matte : null;
  const out = clear(w.out);
  const px = pw / 1080;

  if (m) {
    // 1. person: the frame with the background made transparent.
    const person = clear(w.person);
    person.drawImage(w.base as CanvasImageSource, 0, 0);
    let ok = true;
    if (m.mode === 'chroma') {
      const img = person.getImageData(0, 0, pw, ph);
      chromaKey(img, m);
      person.putImageData(img, 0, 0);
    } else {
      let pm: { arr: Float32Array; w: number; h: number } | null;
      const precise = (m.engine ?? 'precise') === 'precise';
      const asset = at?.asset ?? id, srcT = at?.srcT ?? t;
      if (precise) {
        let got = matteAt(asset, srcT);
        if (!got && !matteHints.playing) {
          // Paused: compute this exact frame in the background and show it as soon as it lands.
          if (!storeOf(asset).live.has(gridKey(srcT))) { const copy = make(pw, ph); ctxOf(copy).drawImage(w.base as CanvasImageSource, 0, 0); requestPrecise(asset, srcT, copy); }
          got = matteAt(asset, srcT, 1);
        }
        pm = got ? { arr: Float32Array.from(got.alpha, (v) => v / 255), w: got.w, h: got.h } : null;
        if (!pm && matteHints.playing) { void loadSegmenter(); pm = personMask(id, w.base, t); } // not prepared: real-time engine while playing
        if (pm && m.cleanup !== false) dropIslands(pm.arr, pm.w, pm.h);
      } else pm = personMask(id, w.base, t);
      if (!pm) ok = false;
      else {
        // Mask canvas from the model's confidence.
        const mc = make(pm.w, pm.h), mx = ctxOf(mc), md = mx.createImageData(pm.w, pm.h);
        const band = precise ? 0.14 : 0.12; // a tight ramp: wide ones leave a bright wall-coloured fringe around the person
        const thr = m.threshold / 100, lo = Math.max(0, thr - band), hi = Math.min(1, thr + band);
        for (let i = 0; i < pm.arr.length; i++) {
          let a = (pm.arr[i] - lo) / Math.max(0.01, hi - lo);
          a = a < 0 ? 0 : a > 1 ? 1 : a;
          md.data[i * 4] = 255; md.data[i * 4 + 1] = 255; md.data[i * 4 + 2] = 255; md.data[i * 4 + 3] = (m.invert ? 1 - a : a) * 255;
        }
        mx.putImageData(md, 0, 0);
        const k = clear(w.mask);
        k.imageSmoothingQuality = 'high';
        k.drawImage(mc as CanvasImageSource, 0, 0, pw, ph);
        if (m.shift) morph(w, m.shift * px);
        // Soft edge.
        person.globalCompositeOperation = 'destination-in';
        if (m.edge > 0 && hasFilter(person)) (person as { filter: string }).filter = `blur(${(m.edge * px).toFixed(1)}px)`;
        person.drawImage(w.mask as CanvasImageSource, 0, 0);
        (person as { filter: string }).filter = 'none';
        person.globalCompositeOperation = 'source-over';
      }
    }
    if (!ok) {
      // Model or matte not ready. A cut-out layer shows nothing yet (the full frame would hide everything placed behind the subject); other layers show the untouched frame.
      if (!at?.cutout) return src;
      return { w: src.w, h: src.h, draw: () => {}, alphaAt: () => 0 };
    }
    // 2. what shows behind it.
    if (m.background === 'color') { out.fillStyle = m.bgColor; out.fillRect(0, 0, pw, ph); }
    else if (m.background === 'blur') {
      if (hasFilter(out)) (out as { filter: string }).filter = `blur(${Math.max(1, m.bgBlur * px).toFixed(1)}px)`;
      const g = Math.round(m.bgBlur * px * 2);
      out.drawImage(w.base as CanvasImageSource, -g, -g, pw + g * 2, ph + g * 2);
      (out as { filter: string }).filter = 'none';
    }
    out.drawImage(w.person as CanvasImageSource, 0, 0);
  } else {
    out.drawImage(w.base as CanvasImageSource, 0, 0);
  }

  // 3. blurred / mosaic areas.
  for (const r of layer.regionBlurs ?? []) applyRegion(w, r);

  return {
    w: src.w, h: src.h, draw: (c, dx, dy, dw, dh) => c.drawImage(w.out as CanvasImageSource, dx, dy, dw, dh),
    alphaAt: (u, v) => {
      if (u < 0 || v < 0 || u >= 1 || v >= 1) return 0;
      try { return ctxOf(w.out).getImageData(Math.floor(u * w.w), Math.floor(v * w.h), 1, 1).data[3] / 255; } catch { return 1; }
    },
  };
}
