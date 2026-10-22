/**
 * Background-noise removal by spectral subtraction, entirely in the browser.
 *
 * 1. Frame the audio (1024 samples, 75 % overlap, sqrt-Hann window).
 * 2. Learn the noise profile from the quietest 10 % of frames: the mean power spectrum there.
 * 3. Per frame and bin, scale the spectrum by sqrt(1 − α·noise/power), floored, with fast attack and
 *    slow release over time plus a 3-bin smooth over frequency (less "musical noise").
 *
 * Works best on steady noise: fans, hiss, hum, room tone. It cannot separate speech from other voices or music.
 */

const N = 1024;
const HOP = N / 4;
const BINS = N / 2 + 1;

const WIN = Float32Array.from({ length: N }, (_, i) => Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N)));
const COS = Float32Array.from({ length: N / 2 }, (_, i) => Math.cos((2 * Math.PI * i) / N));
const SIN = Float32Array.from({ length: N / 2 }, (_, i) => -Math.sin((2 * Math.PI * i) / N));
const REV = (() => {
  const r = new Uint16Array(N), bits = Math.log2(N);
  for (let i = 0; i < N; i++) { let x = i, y = 0; for (let b = 0; b < bits; b++) { y = (y << 1) | (x & 1); x >>= 1; } r[i] = y; }
  return r;
})();

/** In-place radix-2 FFT. */
function fft(re: Float32Array, im: Float32Array) {
  for (let i = 0; i < N; i++) {
    const j = REV[i];
    if (j > i) { const a = re[i]; re[i] = re[j]; re[j] = a; const b = im[i]; im[i] = im[j]; im[j] = b; }
  }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1, step = N / size;
    for (let start = 0; start < N; start += size) {
      for (let k = 0, t = 0; k < half; k++, t += step) {
        const a = start + k, b = a + half;
        const xr = re[b] * COS[t] - im[b] * SIN[t], xi = re[b] * SIN[t] + im[b] * COS[t];
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export interface DenoiseResult { buffer: AudioBuffer; noiseFloorDb: number | null }

/** `strength` 0..1: how aggressively noise is cut (and how low the residual floor goes). */
export async function denoiseBuffer(input: AudioBuffer, strength: number, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<DenoiseResult> {
  const alpha = 1 + 3 * strength;
  const floor = 0.4 - 0.34 * strength;
  const out = new AudioBuffer({ length: input.length, numberOfChannels: input.numberOfChannels, sampleRate: input.sampleRate });
  let floorPow = 0, floorN = 0;

  for (let ch = 0; ch < input.numberOfChannels; ch++) {
    const src = input.getChannelData(ch);
    const len = src.length;
    const padded = new Float32Array(len + 2 * N);
    padded.set(src, N);
    const frames = Math.ceil((len + N) / HOP);

    // Pass 1: frame energies → quietest decile.
    const energy = new Float32Array(frames);
    for (let f = 0; f < frames; f++) {
      let e = 0; const o = f * HOP;
      for (let i = 0; i < N; i++) { const v = padded[o + i]; e += v * v; }
      energy[f] = e;
    }
    const live = Array.from(energy).filter((e) => e > 1e-9).sort((a, b) => a - b);
    if (live.length < 4) { out.copyToChannel(src, ch); continue; }
    const thr = live[Math.floor(live.length * 0.1)];

    // Pass 2: mean power spectrum of the quiet frames = noise profile.
    const re = new Float32Array(N), im = new Float32Array(N);
    const noise = new Float32Array(BINS);
    let used = 0;
    for (let f = 0; f < frames; f++) {
      if (energy[f] > thr || energy[f] <= 1e-9) continue;
      const o = f * HOP;
      for (let i = 0; i < N; i++) { re[i] = padded[o + i] * WIN[i]; im[i] = 0; }
      fft(re, im);
      for (let k = 0; k < BINS; k++) noise[k] += re[k] * re[k] + im[k] * im[k];
      used++;
    }
    for (let k = 0; k < BINS; k++) noise[k] /= Math.max(1, used);
    const smooth = new Float32Array(BINS);
    for (let k = 0; k < BINS; k++) smooth[k] = (noise[Math.max(0, k - 1)] + noise[k] * 2 + noise[Math.min(BINS - 1, k + 1)]) / 4;
    let sum = 0; for (let k = 0; k < BINS; k++) sum += smooth[k];
    floorPow += sum / (N * N * 0.5); floorN++;

    // Pass 3: gate every frame and overlap-add.
    const acc = new Float32Array(len + 2 * N);
    const prev = new Float32Array(BINS).fill(1), gain = new Float32Array(BINS);
    for (let f = 0; f < frames; f++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const o = f * HOP;
      for (let i = 0; i < N; i++) { re[i] = padded[o + i] * WIN[i]; im[i] = 0; }
      fft(re, im);
      for (let k = 0; k < BINS; k++) {
        const p = re[k] * re[k] + im[k] * im[k] + 1e-20;
        let g = Math.sqrt(Math.max(0, 1 - (alpha * smooth[k]) / p));
        if (g < floor) g = floor;
        g = g > prev[k] ? g : prev[k] * 0.6 + g * 0.4; // fast attack, slow release
        prev[k] = g;
      }
      for (let k = 0; k < BINS; k++) gain[k] = (prev[Math.max(0, k - 1)] + prev[k] * 2 + prev[Math.min(BINS - 1, k + 1)]) / 4;
      for (let k = 0; k < BINS; k++) {
        re[k] *= gain[k]; im[k] *= gain[k];
        if (k > 0 && k < N / 2) { re[N - k] = re[k]; im[N - k] = -im[k]; }
      }
      // Inverse FFT via the conjugate trick.
      for (let i = 0; i < N; i++) im[i] = -im[i];
      fft(re, im);
      for (let i = 0; i < N; i++) acc[o + i] += (re[i] / N) * WIN[i] / 2;
      if (f % 300 === 0) { onProgress?.((ch + f / frames) / input.numberOfChannels); await tick(); }
    }
    out.copyToChannel(acc.subarray(N, N + len), ch);
  }
  onProgress?.(1);
  return { buffer: out, noiseFloorDb: floorN ? 10 * Math.log10(Math.max(1e-12, floorPow / floorN)) : null };
}

/** 16-bit PCM WAV. */
export function encodeWav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels, len = buf.length, bytes = len * ch * 2;
  const view = new DataView(new ArrayBuffer(44 + bytes));
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, 36 + bytes, true); str(8, 'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, ch, true);
  view.setUint32(24, buf.sampleRate, true); view.setUint32(28, buf.sampleRate * ch * 2, true);
  view.setUint16(32, ch * 2, true); view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, bytes, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) {
    const v = Math.max(-1, Math.min(1, data[c][i]));
    view.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2;
  }
  return new Blob([view], { type: 'audio/wav' });
}
