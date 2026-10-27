/// <reference lib="webworker" />

/**
 * Runs the MODNet matting model off the main thread, so the editor keeps responding while a cut-out is analysed.
 * The page sends a frame as an ImageBitmap and gets the alpha back; everything heavy (resize, normalise, inference) happens here.
 */

interface OrtSession { inputNames: string[]; outputNames: string[]; run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array; dims: number[] }>> }
interface OrtLib { Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown; env: { logLevel: string; wasm: { wasmPaths: string; numThreads: number } }; InferenceSession: { create(model: ArrayBuffer | string, opts: unknown): Promise<OrtSession> } }

type In =
  | { type: 'load'; ort: string; model: string; threads: number }
  | { type: 'run'; id: number; bitmap: ImageBitmap };

const scope = self as unknown as DedicatedWorkerGlobalScope;
let ort: OrtLib | null = null;
let sess: OrtSession | null = null;

async function load(msg: { ort: string; model: string; threads: number }) {
  ort = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${msg.ort}/ort.all.min.mjs`)) as unknown as OrtLib;
  ort.env.wasm.wasmPaths = `${msg.ort}/`;
  ort.env.wasm.numThreads = msg.threads;
  // Download the model with progress, and keep it in the browser's cache so later sessions start at once.
  let cache: Cache | null = null;
  try { cache = await caches.open('keyframe-models'); } catch { /* private window: no cache */ }
  let res = (await cache?.match(msg.model)) ?? null;
  if (!res) {
    res = await fetch(msg.model);
    if (!res.ok) throw new Error(`The matting model could not be downloaded (${res.status}).`);
    void cache?.put(msg.model, res.clone()).catch(() => undefined);
  }
  const total = Number(res.headers.get('content-length')) || 25_888_640;
  const reader = res.body!.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length;
    scope.postMessage({ type: 'progress', p: Math.min(1, got / total) });
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const c of parts) { buf.set(c, o); o += c.length; }
  ort.env.logLevel = 'error'; // the "nodes assigned to CPU" notices are harmless but land in the console as errors
  let backend = 'GPU';
  try { sess = await ort.InferenceSession.create(buf.buffer, { executionProviders: ['webgpu', 'wasm'], logSeverityLevel: 3 }); }
  catch { sess = await ort.InferenceSession.create(buf.buffer, { executionProviders: ['wasm'], logSeverityLevel: 3 }); backend = 'CPU'; }
  scope.postMessage({ type: 'ready', backend });
}

/** MODNet alpha for a frame, 0..255 per pixel, at about 512 px on the short side. */
async function run(id: number, frame: ImageBitmap) {
  const fw = frame.width, fh = frame.height;
  const k = 512 / Math.min(fw, fh);
  const iw = Math.max(32, Math.round((fw * k) / 32) * 32), ih = Math.max(32, Math.round((fh * k) / 32) * 32);
  const c = new OffscreenCanvas(iw, ih), cx = c.getContext('2d', { willReadFrequently: true })!;
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(frame, 0, 0, iw, ih);
  frame.close();
  const px = cx.getImageData(0, 0, iw, ih).data;
  const n = iw * ih, input = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    input[i] = px[i * 4] / 127.5 - 1;
    input[n + i] = px[i * 4 + 1] / 127.5 - 1;
    input[2 * n + i] = px[i * 4 + 2] / 127.5 - 1;
  }
  const out = await sess!.run({ [sess!.inputNames[0]]: new ort!.Tensor('float32', input, [1, 3, ih, iw]) });
  const a = out[sess!.outputNames[0]].data;
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) alpha[i] = a[i] <= 0 ? 0 : a[i] >= 1 ? 255 : Math.round(a[i] * 255);
  scope.postMessage({ type: 'result', id, alpha, w: iw, h: ih }, [alpha.buffer]);
}

scope.onmessage = (e: MessageEvent<In>) => {
  const m = e.data;
  if (m.type === 'load') {
    load(m).catch((err) => scope.postMessage({ type: 'error', message: (err as Error).message || 'The matting model could not be loaded. Check your internet connection.' }));
  } else {
    run(m.id, m.bitmap).catch((err) => scope.postMessage({ type: 'fail', id: m.id, message: (err as Error).message }));
  }
};
