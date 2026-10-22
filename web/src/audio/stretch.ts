/**
 * Pitch-preserving time stretch (WSOLA). rate > 1 plays faster and shorter, rate < 1 slower and longer.
 * Used for clip speed so a 2× clip keeps the speaker's pitch.
 */
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function stretchChannel(x: Float32Array, rate: number, sr: number): Float32Array {
  const N = Math.max(512, 2 * Math.round((sr * 0.04) / 2)); // ≈ 40 ms
  const Hs = N / 2;
  const Ha = Hs * rate;
  const tol = Math.round(N / 4);
  const outLen = Math.max(1, Math.floor(x.length / rate));
  const out = new Float32Array(outLen + N);
  const wsum = new Float32Array(outLen + N);
  const win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  let prev = 0;
  for (let k = 0; ; k++) {
    const o = k * Hs;
    if (o >= outLen) break;
    const nominal = Math.round(k * Ha);
    let pos = nominal;
    if (k > 0) {
      // Pick the offset whose start best continues the previous frame's tail.
      const target = prev + Hs;
      let best = -Infinity;
      for (let c = Math.max(0, nominal - tol); c <= nominal + tol; c += 2) {
        if (c + Hs >= x.length) break;
        let s = 0;
        for (let i = 0; i < Hs; i += 4) s += x[c + i] * (target + i < x.length ? x[target + i] : 0);
        if (s > best) { best = s; pos = c; }
      }
    }
    if (pos >= x.length) break;
    for (let i = 0; i < N; i++) {
      const v = pos + i < x.length ? x[pos + i] : 0;
      out[o + i] += v * win[i];
      wsum[o + i] += win[i];
    }
    prev = pos;
  }
  const res = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) res[i] = wsum[i] > 1e-3 ? out[i] / wsum[i] : 0;
  return res;
}

export async function timeStretch(buf: AudioBuffer, rate: number): Promise<AudioBuffer> {
  if (Math.abs(rate - 1) < 0.005) return buf;
  const chans: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) {
    chans.push(stretchChannel(buf.getChannelData(c), rate, buf.sampleRate));
    await tick();
  }
  const out = new AudioBuffer({ length: chans[0].length, numberOfChannels: chans.length, sampleRate: buf.sampleRate });
  chans.forEach((d, c) => out.copyToChannel(d as Float32Array<ArrayBuffer>, c));
  return out;
}
