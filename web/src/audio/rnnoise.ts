/**
 * AI noise suppression with RNNoise (xiph/rnnoise, a small recurrent neural network trained to separate speech
 * from noise), compiled to WebAssembly by the Jitsi project (jitsi/rnnoise-wasm). Runs entirely in the browser.
 *
 * Unlike spectral subtraction it handles changing noise too: traffic, crowds, keyboards, wind, fans that speed up.
 * RNNoise works on 48 kHz mono in 10 ms frames; each channel is processed on its own and the result is blended
 * with the original by `amount` (1 = fully cleaned).
 */

const FRAME = 480;
const RATE = 48000;

interface RnnoiseModule {
  _rnnoise_create(model?: number): number;
  _rnnoise_destroy(ctx: number): void;
  _rnnoise_process_frame(ctx: number, out: number, input: number): number;
  _malloc(n: number): number;
  _free(p: number): void;
  HEAPF32: Float32Array;
}

let mod: Promise<RnnoiseModule> | null = null;
function load(): Promise<RnnoiseModule> {
  mod ??= import('@jitsi/rnnoise-wasm').then(async (m) => {
    const wasm = m.createRNNWasmModuleSync() as RnnoiseModule & { ready?: Promise<unknown> };
    await wasm.ready;
    return wasm;
  }).catch((e) => { mod = null; throw e; }); // don't cache a failed load: let the next call retry
  return mod;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

async function to48k(input: AudioBuffer): Promise<AudioBuffer> {
  if (input.sampleRate === RATE) return input;
  const ctx = new OfflineAudioContext(input.numberOfChannels, Math.ceil(input.duration * RATE), RATE);
  const src = ctx.createBufferSource();
  src.buffer = input;
  src.connect(ctx.destination);
  src.start();
  return ctx.startRendering();
}

export async function rnnoiseBuffer(input: AudioBuffer, amount: number, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<AudioBuffer> {
  const wasm = await load();
  const src = await to48k(input);
  const out = new AudioBuffer({ length: src.length, numberOfChannels: src.numberOfChannels, sampleRate: RATE });
  const buf = wasm._malloc(FRAME * 4);
  const idx = buf >> 2;
  const frames = Math.ceil(src.length / FRAME) + 1; // one extra frame flushes the network's 10 ms delay
  try {
    for (let ch = 0; ch < src.numberOfChannels; ch++) {
      const dry = src.getChannelData(ch);
      const wet = new Float32Array(src.length);
      const state = wasm._rnnoise_create(0);
      try {
        for (let f = 0; f < frames; f++) {
          if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
          const at = f * FRAME;
          const heap = wasm.HEAPF32; // re-read each frame: the heap can be replaced if it grows
          for (let i = 0; i < FRAME; i++) heap[idx + i] = (dry[at + i] ?? 0) * 32768;
          wasm._rnnoise_process_frame(state, buf, buf);
          const o = wasm.HEAPF32;
          // Output lags the input by one frame: frame f carries the cleaned samples of frame f - 1.
          const base = at - FRAME;
          if (base >= 0) for (let i = 0; i < FRAME && base + i < wet.length; i++) wet[base + i] = o[idx + i] / 32768;
          if (f % 400 === 0) { onProgress?.((ch + f / frames) / src.numberOfChannels); await tick(); }
        }
      } finally { wasm._rnnoise_destroy(state); }
      const mixed = new Float32Array(src.length);
      for (let i = 0; i < mixed.length; i++) mixed[i] = wet[i] * amount + dry[i] * (1 - amount);
      out.copyToChannel(mixed, ch);
    }
  } finally { wasm._free(buf); }
  onProgress?.(1);
  return out;
}
