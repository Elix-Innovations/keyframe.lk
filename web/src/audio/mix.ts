import type { MusicTrack, Project, SfxId } from '@/types';

/**
 * The mix plan is the single description of the soundtrack. Both the live preview
 * (audio/preview.ts) and the exporter (audio/render.ts) schedule audio from it,
 * so what you hear while editing is what ends up in the MP4.
 */

export const dbToGain = (db: number) => Math.pow(10, db / 20);
export const gainToDb = (g: number) => (g > 0 ? 20 * Math.log10(g) : -Infinity);

/** Music beds sit this far below the loudness target so speech stays on top. */
export const MUSIC_BED_OFFSET_DB = -8;
const CURVE_RATE = 25; // gain automation points per second
const LOOP_XFADE = 0.04; // seconds of fade at each loop seam to avoid clicks

export interface Segment { when: number; offset: number; dur: number; fadeIn: number; fadeOut: number }
export interface GainPoint { t: number; g: number }
export interface TrackPlan { track: MusicTrack; segments: Segment[]; gain: GainPoint[] }
export interface SfxEvent { t: number; id: SfxId; gainDb: number }
export interface MixPlan { tracks: TrackPlan[]; sfx: SfxEvent[]; originalGain: number; duration: number }

/** Speech regions from word timings, padded and merged so ducking doesn't pump between words. */
export function speechRegions(project: Project, pad = 0.12, mergeGap = 0.45): [number, number][] {
  const words = project.captions.flatMap((c) => c.words).sort((a, b) => a.start - b.start);
  const out: [number, number][] = [];
  for (const w of words) {
    const s = Math.max(0, w.start - pad), e = w.end + pad;
    const last = out[out.length - 1];
    if (last && s - last[1] <= mergeGap) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/** Where each copy of the file plays on the timeline (loops restart from the file start). */
export function trackSegments(t: MusicTrack): Segment[] {
  const segs: Segment[] = [];
  const end = t.start + t.duration;
  let when = t.start, offset = Math.min(t.offset, Math.max(0, t.fileDuration - 0.05));
  while (when < end - 0.001) {
    const avail = t.fileDuration - offset;
    if (avail <= 0.01) break;
    const dur = Math.min(avail, end - when);
    const isFirst = segs.length === 0, isLast = when + dur >= end - 0.001;
    segs.push({ when, offset, dur, fadeIn: isFirst ? 0 : LOOP_XFADE, fadeOut: isLast ? 0 : LOOP_XFADE });
    if (!t.loop) break;
    when += dur;
    offset = 0;
  }
  return segs;
}

/** Gain that brings a file to the music bed level when normalization is on. */
export function normalizationGain(t: MusicTrack, project: Project): number {
  const n = project.audio.normalize;
  if (!n.enabled || t.analysis?.lufs == null || !Number.isFinite(t.analysis.lufs)) return 1;
  const want = n.targetLufs + MUSIC_BED_OFFSET_DB;
  return dbToGain(Math.max(-24, Math.min(12, want - t.analysis.lufs)));
}

/** Ducking envelope (1 = no ducking) with attack/release smoothing, sampled at CURVE_RATE. */
function duckEnvelope(project: Project, from: number, to: number): (t: number) => number {
  const d = project.audio.ducking;
  if (!d.enabled || project.captions.length === 0) return () => 1;
  const regions = speechRegions(project);
  const low = dbToGain(d.amountDb);
  const n = Math.max(2, Math.ceil((to - from) * CURVE_RATE) + 1);
  const env = new Float32Array(n);
  let g = 1, ri = 0;
  const dt = 1 / CURVE_RATE;
  const aCoef = Math.exp(-dt / Math.max(0.01, d.attack));
  const rCoef = Math.exp(-dt / Math.max(0.01, d.release));
  // Start a little early so the duck lands as speech begins (look-ahead = attack time).
  const look = d.attack;
  for (let i = 0; i < n; i++) {
    const t = from + i * dt + look;
    while (ri < regions.length && regions[ri][1] < t) ri++;
    const target = ri < regions.length && regions[ri][0] <= t ? low : 1;
    const c = target < g ? aCoef : rCoef;
    g = target + (g - target) * c;
    env[i] = g;
  }
  return (t: number) => env[Math.min(n - 1, Math.max(0, Math.round((t - from) * CURVE_RATE)))];
}

export function trackGainCurve(t: MusicTrack, project: Project): GainPoint[] {
  const base = dbToGain(t.volume) * normalizationGain(t, project);
  const start = t.start, end = t.start + t.duration;
  const duck = t.effect ? () => 1 : duckEnvelope(project, start, end);
  const pts: GainPoint[] = [];
  const n = Math.max(2, Math.ceil(t.duration * CURVE_RATE) + 1);
  for (let i = 0; i < n; i++) {
    const time = Math.min(end, start + i / CURVE_RATE);
    let fade = 1;
    if (t.fadeIn > 0 && time - start < t.fadeIn) fade = Math.min(fade, (time - start) / t.fadeIn);
    if (t.fadeOut > 0 && end - time < t.fadeOut) fade = Math.min(fade, (end - time) / t.fadeOut);
    pts.push({ t: time, g: base * Math.max(0, fade) * duck(time) });
  }
  return pts;
}

export function sfxEvents(project: Project): SfxEvent[] {
  const s = project.audio.sfx;
  if (!s.enabled) return [];
  const ev: SfxEvent[] = [];
  const seen = new Set<number>();
  const push = (t: number, id: SfxId | null, gainDb = 0) => {
    if (!id) return;
    const key = Math.round(t * 100);
    if (seen.has(key)) return; // one sound per moment
    seen.add(key);
    ev.push({ t, id, gainDb: s.volume + gainDb });
  };
  if (project.hook.enabled && project.hook.text.trim()) push(project.hook.start, s.onHook);
  for (const c of project.captions) {
    for (const w of c.words) if (w.emphasize) push(w.start, s.onEmphasis, 2);
    push(c.start, s.onCaption);
    for (const w of c.words) push(w.start, s.onWord, -4);
  }
  return ev.sort((a, b) => a.t - b.t);
}

export function buildMixPlan(project: Project): MixPlan {
  const a = project.audio;
  return {
    tracks: a.tracks.filter((track) => !track.muted).map((track) => ({ track, segments: trackSegments(track), gain: trackGainCurve(track, project) })),
    sfx: sfxEvents(project),
    originalGain: a.original.muted ? 0 : dbToGain(a.original.volume),
    duration: project.duration,
  };
}

/** Does exporting need a remixed soundtrack, or can the original audio pass through untouched? */
export function needsMix(project: Project): boolean {
  const a = project.audio;
  return a.tracks.length > 0 || sfxEvents(project).length > 0 || a.original.muted || a.original.volume !== 0 ||
    a.original.enhance || !!a.original.denoise || a.normalize.enabled;
}

/** Nearest beat on the timeline across all tracks (for snapping), or null. */
export function nearestBeat(project: Project, t: number, within = 0.25): number | null {
  let best: number | null = null;
  for (const tr of project.audio.tracks) {
    const beats = tr.analysis?.beats;
    if (!beats?.length) continue;
    for (const seg of trackSegments(tr)) {
      for (const b of beats) {
        if (b < seg.offset || b > seg.offset + seg.dur) continue;
        const tt = seg.when + (b - seg.offset);
        if (Math.abs(tt - t) <= within && (best === null || Math.abs(tt - t) < Math.abs(best - t))) best = tt;
      }
    }
  }
  return best;
}
