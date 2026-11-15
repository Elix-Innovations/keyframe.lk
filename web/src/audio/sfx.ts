import type { SfxId } from '@/types';

/**
 * Sound effects synthesized in the browser (no samples, so no licensing questions).
 * Each is rendered once with an OfflineAudioContext and cached as an AudioBuffer.
 */

export const SFX: { id: SfxId; label: string; length: number }[] = [
  { id: 'pop', label: 'Pop', length: 0.18 },
  { id: 'click', label: 'Click', length: 0.06 },
  { id: 'type', label: 'Typewriter', length: 0.08 },
  { id: 'whoosh', label: 'Whoosh', length: 0.55 },
  { id: 'swoosh', label: 'Swoosh', length: 0.3 },
  { id: 'ding', label: 'Ding', length: 1.2 },
  { id: 'bass', label: 'Bass hit', length: 0.6 },
  { id: 'riser', label: 'Riser', length: 1.4 },
  { id: 'airhorn', label: 'Air horn', length: 1.1 },
  { id: 'scratch', label: 'Record scratch', length: 0.5 },
  { id: 'shutter', label: 'Camera shutter', length: 0.25 },
  { id: 'laser', label: 'Laser', length: 0.35 },
  { id: 'coin', label: 'Coin', length: 0.5 },
  { id: 'notify', label: 'Notification', length: 0.6 },
  { id: 'boom', label: 'Impact boom', length: 1.6 },
  { id: 'glitch', label: 'Glitch', length: 0.4 },
  { id: 'sparkle', label: 'Sparkle', length: 1.0 },
  { id: 'drop', label: 'Bass drop', length: 1.5 },
];

const RATE = 48000;
const cache = new Map<SfxId, Promise<AudioBuffer>>();

function noiseBuffer(ctx: BaseAudioContext, seconds: number) {
  const b = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const d = b.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < d.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; d[i] = seed / 0x80000000 - 1; }
  return b;
}

function envelope(g: GainNode, t0: number, attack: number, peak: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

async function synth(id: SfxId): Promise<AudioBuffer> {
  const len = SFX.find((s) => s.id === id)!.length;
  const ctx = new OfflineAudioContext(1, Math.ceil(len * RATE), RATE);
  const out = ctx.createGain();
  out.connect(ctx.destination);
  const osc = (type: OscillatorType, f0: number, f1: number, dur: number, peak: number, attack = 0.004) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, 0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), dur);
    envelope(g, 0, attack, peak, dur);
    o.connect(g).connect(out);
    o.start(0); o.stop(dur + attack);
  };
  const noise = (dur: number, type: BiquadFilterType, f0: number, f1: number, peak: number, attack: number, q = 1) => {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, dur + attack);
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, 0); f.frequency.exponentialRampToValueAtTime(f1, attack + dur);
    const g = ctx.createGain(); envelope(g, 0, attack, peak, dur);
    src.connect(f).connect(g).connect(out);
    src.start(0);
  };
  switch (id) {
    case 'pop': osc('sine', 900, 280, 0.16, 0.9, 0.002); break;
    case 'click': noise(0.04, 'highpass', 3000, 5000, 0.8, 0.001); break;
    case 'type': noise(0.05, 'bandpass', 2200, 1800, 0.9, 0.001, 4); osc('square', 180, 120, 0.03, 0.08, 0.001); break;
    case 'whoosh': noise(0.3, 'bandpass', 400, 3500, 0.7, 0.22, 1.2); break;
    case 'swoosh': noise(0.2, 'bandpass', 3000, 600, 0.6, 0.08, 1.5); break;
    case 'ding': osc('sine', 1318.5, 1318, 1.1, 0.5); osc('sine', 2637, 2636, 0.7, 0.18); osc('sine', 3951, 3950, 0.4, 0.06); break;
    case 'bass': osc('sine', 120, 42, 0.55, 1, 0.003); noise(0.05, 'lowpass', 900, 300, 0.25, 0.002); break;
    case 'airhorn': for (const f of [440, 554, 660]) { osc('sawtooth', f, f * 0.98, 0.95, 0.22, 0.02); } noise(0.9, 'bandpass', 1500, 1500, 0.08, 0.02, 0.8); break;
    case 'scratch': noise(0.4, 'bandpass', 2500, 900, 0.7, 0.01, 6); osc('sawtooth', 700, 120, 0.4, 0.25, 0.005); break;
    case 'shutter': noise(0.03, 'highpass', 4000, 6000, 0.9, 0.001); noise(0.05, 'bandpass', 1800, 1200, 0.7, 0.001, 3); break;
    case 'laser': osc('sawtooth', 2400, 180, 0.3, 0.5, 0.002); osc('square', 1800, 150, 0.3, 0.12, 0.002); break;
    case 'coin': osc('square', 988, 988, 0.08, 0.35, 0.002); osc('square', 1319, 1319, 0.4, 0.35, 0.002); break;
    case 'notify': osc('sine', 880, 880, 0.18, 0.5, 0.004); osc('sine', 1175, 1175, 0.4, 0.5, 0.004); break;
    case 'boom': osc('sine', 90, 28, 1.4, 1, 0.003); noise(0.5, 'lowpass', 1200, 80, 0.8, 0.002); break;
    case 'glitch': noise(0.05, 'bandpass', 3000, 3000, 0.9, 0.001, 8); osc('square', 220, 3000, 0.06, 0.25, 0.001); noise(0.04, 'highpass', 6000, 6000, 0.7, 0.001); break;
    case 'sparkle': for (const f of [2093, 2637, 3136, 4186]) osc('sine', f, f, 0.8, 0.14, 0.004); noise(0.7, 'highpass', 7000, 9000, 0.1, 0.01); break;
    case 'drop': osc('sine', 180, 36, 1.4, 1, 0.003); noise(0.25, 'lowpass', 600, 120, 0.5, 0.002); break;
    case 'riser': noise(1.3, 'bandpass', 250, 6000, 0.45, 1.25, 2); osc('sawtooth', 110, 880, 1.35, 0.08, 1.2); break;
  }
  return ctx.startRendering();
}

export function getSfx(id: SfxId): Promise<AudioBuffer> {
  let p = cache.get(id);
  if (!p) { p = synth(id); cache.set(id, p); }
  return p;
}

/** Audition a sound (used by the Effects tab). */
let previewCtx: AudioContext | null = null;
export async function playSfx(id: SfxId, gainDb = 0) {
  previewCtx ??= new AudioContext();
  await previewCtx.resume();
  const src = previewCtx.createBufferSource();
  src.buffer = await getSfx(id);
  const g = previewCtx.createGain(); g.gain.value = Math.pow(10, gainDb / 20);
  src.connect(g).connect(previewCtx.destination);
  src.start();
}

/** A built-in sound as a WAV file, so it can sit on the timeline like any other audio. */
export async function sfxWav(id: SfxId): Promise<Blob> {
  const { encodeWav } = await import('./denoise');
  return encodeWav(await getSfx(id));
}
