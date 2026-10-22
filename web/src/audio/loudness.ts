/**
 * Integrated loudness (ITU-R BS.1770-4 / EBU R128) and a look-ahead peak limiter,
 * used to master the exported soundtrack to social-media loudness (≈ −14 LUFS).
 */

function biquad(x: Float32Array, b: number[], a: number[]): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/** K-weighting filter coefficients for a given sample rate (BS.1770 pre-filter + RLB high-pass). */
function kWeights(fs: number) {
  // Stage 1: high-shelf (+4 dB above ~1.5 kHz)
  const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  const K = Math.tan((Math.PI * f0) / fs);
  const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  const a0 = 1 + K / Q + K * K;
  const shelf = {
    b: [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0],
    a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0],
  };
  // Stage 2: high-pass (~38 Hz)
  const f1 = 38.13547087602444, Q1 = 0.5003270373238773;
  const K1 = Math.tan((Math.PI * f1) / fs);
  const d = 1 + K1 / Q1 + K1 * K1;
  const hp = { b: [1, -2, 1], a: [1, (2 * (K1 * K1 - 1)) / d, (1 - K1 / Q1 + K1 * K1) / d] };
  return { shelf, hp };
}

/** Integrated loudness in LUFS, or null for silence / very short audio. */
export function measureLufs(buffer: AudioBuffer): number | null {
  const fs = buffer.sampleRate;
  const { shelf, hp } = kWeights(fs);
  const chans: Float32Array[] = [];
  for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) chans.push(biquad(biquad(buffer.getChannelData(c), shelf.b, shelf.a), hp.b, hp.a));
  const block = Math.round(0.4 * fs), step = Math.round(0.1 * fs);
  if (buffer.length < block) return null;
  const powers: number[] = [];
  for (let s = 0; s + block <= buffer.length; s += step) {
    let sum = 0;
    for (const ch of chans) { let e = 0; for (let i = s; i < s + block; i++) e += ch[i] * ch[i]; sum += e / block; }
    powers.push(sum);
  }
  const lk = (p: number) => -0.691 + 10 * Math.log10(p);
  const abs = powers.filter((p) => lk(p) > -70);
  if (!abs.length) return null;
  const relGate = lk(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter((p) => lk(p) > relGate);
  if (!gated.length) return null;
  return lk(gated.reduce((a, b) => a + b, 0) / gated.length);
}

export function peakOf(buffer: AudioBuffer): number {
  let p = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > p) p = v; }
  }
  return p;
}

/** Scale in place, then run a 5 ms look-ahead brick-wall limiter at `ceilingDb`. */
export function gainAndLimit(buffer: AudioBuffer, gain: number, ceilingDb = -1): void {
  const ceil = Math.pow(10, ceilingDb / 20);
  const fs = buffer.sampleRate, n = buffer.length;
  const look = Math.max(1, Math.round(0.005 * fs));
  const rel = Math.exp(-1 / (0.08 * fs));
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  // Required gain per sample (≤ 1) so the scaled peak stays under the ceiling.
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (const d of chans) { const v = Math.abs(d[i] * gain); if (v > p) p = v; }
    need[i] = p > ceil ? ceil / p : 1;
  }
  // Look-ahead: the gain must already be low `look` samples before a peak (sliding minimum), then release smoothly.
  const g = new Float32Array(n);
  const dq: number[] = [];
  for (let i = 0; i < n + look; i++) {
    if (i < n) { while (dq.length && need[dq[dq.length - 1]] >= need[i]) dq.pop(); dq.push(i); }
    const j = i - look;
    if (j < 0) continue;
    while (dq.length && dq[0] < j - look) dq.shift();
    g[j] = dq.length ? need[dq[0]] : 1;
  }
  let env = 1;
  for (let i = 0; i < n; i++) {
    env = g[i] < env ? g[i] : g[i] + (env - g[i]) * rel;
    const k = gain * env;
    for (const d of chans) d[i] = Math.max(-ceil, Math.min(ceil, d[i] * k));
  }
}

/** Downsampled peak envelope (normalized), `rate` values per second. */
export function waveformOf(buffer: AudioBuffer, rate = 50): number[] {
  const step = Math.max(1, Math.floor(buffer.sampleRate / rate));
  const n = Math.ceil(buffer.length / step);
  const out = new Array<number>(n).fill(0);
  let max = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) {
      let m = out[i];
      for (let j = i * step, e = Math.min(d.length, j + step); j < e; j += 2) { const v = Math.abs(d[j]); if (v > m) m = v; }
      out[i] = m;
    }
  }
  for (const v of out) if (v > max) max = v;
  return max > 0 ? out.map((v) => Math.round((v / max) * 1000) / 1000) : out;
}
