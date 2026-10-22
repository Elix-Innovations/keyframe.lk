import type { AudioAnalyzeResponse, SfxId, TrackAnalysis } from '@/types';
import { getBlob } from '@/lib/db';
import { measureLufs, peakOf, waveformOf } from './loudness';
import { getSfx } from './sfx';
import type { GainPoint, MixPlan } from './mix';

// ---------- decoding & analysis ----------

let decodeCtx: OfflineAudioContext | null = null;
const decoded = new Map<string, Promise<AudioBuffer>>();

/** Decode a stored audio asset once and cache it. */
export function loadAudioAsset(assetId: string): Promise<AudioBuffer> {
  let p = decoded.get(assetId);
  if (!p) {
    p = (async () => {
      const blob = await getBlob(assetId);
      if (!blob) throw new Error('Audio file is missing from storage.');
      decodeCtx ??= new OfflineAudioContext(2, 1, 48000);
      return decodeCtx.decodeAudioData(await blob.arrayBuffer());
    })();
    p.catch(() => decoded.delete(assetId));
    decoded.set(assetId, p);
  }
  return p;
}

/**
 * Loudness, peak and waveform are computed in the browser. Tempo and beat grid come from
 * the Python service when it is running (best quality); otherwise they are left empty.
 */
export async function analyzeTrack(file: Blob, buffer: AudioBuffer): Promise<TrackAnalysis> {
  const local: TrackAnalysis = { bpm: null, beats: [], lufs: measureLufs(buffer), peak: peakOf(buffer), waveform: waveformOf(buffer) };
  try {
    const form = new FormData();
    form.append('file', file, 'audio');
    const res = await fetch('/api/sinhala/audio/analyze', { method: 'POST', body: form });
    if (!res.ok) return local;
    const py = (await res.json()) as AudioAnalyzeResponse;
    return { ...local, bpm: py.bpm, beats: py.beats ?? [], lufs: py.lufs ?? local.lufs };
  } catch {
    return local;
  }
}

// ---------- graph building (shared by live preview and offline export) ----------

/** Voice chain for the original audio: clean-up high-pass, presence lift, gentle compression. */
export function voiceChain(ctx: BaseAudioContext, enhance: boolean): { input: AudioNode; output: AudioNode } {
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = enhance ? 85 : 10;
  const presence = ctx.createBiquadFilter(); presence.type = 'peaking'; presence.frequency.value = 3200; presence.Q.value = 0.9; presence.gain.value = enhance ? 3.5 : 0;
  const air = ctx.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 9000; air.gain.value = enhance ? 2 : 0;
  const comp = ctx.createDynamicsCompressor();
  if (enhance) { comp.threshold.value = -22; comp.ratio.value = 3.5; comp.knee.value = 8; comp.attack.value = 0.006; comp.release.value = 0.18; }
  else { comp.threshold.value = 0; comp.ratio.value = 1; }
  hp.connect(presence).connect(air).connect(comp);
  return { input: hp, output: comp };
}

export function masterLimiter(ctx: BaseAudioContext): DynamicsCompressorNode {
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -1.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
  return lim;
}

/** Apply a gain curve to an AudioParam, starting at timeline time `from` = context time `at`. */
export function scheduleCurve(param: AudioParam, pts: GainPoint[], from: number, at: number) {
  param.cancelScheduledValues(0);
  let first = true;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.t < from) {
      if (i + 1 < pts.length && pts[i + 1].t > from) {
        const n = pts[i + 1], k = (from - p.t) / (n.t - p.t || 1);
        param.setValueAtTime(p.g + (n.g - p.g) * k, at);
        first = false;
      }
      continue;
    }
    if (first) { param.setValueAtTime(p.g, at + (p.t - from)); first = false; }
    else param.linearRampToValueAtTime(p.g, at + (p.t - from));
  }
  if (first) param.setValueAtTime(pts.length ? pts[pts.length - 1].g : 0, at);
}

export interface ScheduledNodes { stop: () => void }

/**
 * Schedule music and effects from timeline time `from`, starting at context time `at`.
 * Returns a handle to stop everything (used on pause/seek in the live preview).
 */
export async function scheduleMix(
  ctx: BaseAudioContext, plan: MixPlan, dest: AudioNode, from: number, at: number, sfxLinear = true,
): Promise<ScheduledNodes> {
  const sources: AudioScheduledSourceNode[] = [];
  for (const tp of plan.tracks) {
    let buf: AudioBuffer;
    try { buf = await loadAudioAsset(tp.track.assetId); } catch { continue; }
    const trackGain = ctx.createGain();
    trackGain.connect(dest);
    scheduleCurve(trackGain.gain, tp.gain, from, at);
    for (const seg of tp.segments) {
      const segEnd = seg.when + seg.dur;
      if (segEnd <= from) continue;
      const skip = Math.max(0, from - seg.when);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      const t0 = at + Math.max(0, seg.when - from);
      const t1 = at + (segEnd - from);
      g.gain.setValueAtTime(seg.fadeIn > 0 && skip < seg.fadeIn ? 0.0001 : 1, t0);
      if (seg.fadeIn > 0 && skip < seg.fadeIn) g.gain.linearRampToValueAtTime(1, t0 + seg.fadeIn - skip);
      if (seg.fadeOut > 0) { g.gain.setValueAtTime(1, Math.max(t0, t1 - seg.fadeOut)); g.gain.linearRampToValueAtTime(0.0001, t1); }
      src.connect(g).connect(trackGain);
      src.start(t0, seg.offset + skip, seg.dur - skip);
      sources.push(src);
    }
  }
  if (plan.sfx.length) {
    const ids = [...new Set(plan.sfx.map((e) => e.id))] as SfxId[];
    const bufs = new Map(await Promise.all(ids.map(async (id) => [id, await getSfx(id)] as const)));
    for (const e of plan.sfx) {
      if (e.t < from - 0.01) continue;
      const src = ctx.createBufferSource();
      src.buffer = bufs.get(e.id)!;
      const g = ctx.createGain();
      g.gain.value = sfxLinear ? Math.pow(10, e.gainDb / 20) : 1;
      src.connect(g).connect(dest);
      src.start(at + (e.t - from));
      sources.push(src);
    }
  }
  return { stop: () => sources.forEach((s) => { try { s.stop(); } catch { /* not started */ } s.disconnect(); }) };
}
