import type { AnimKey } from '../../types';
import type { Track } from './xmlKeyframes';

/** Reference frame and type size the pack's pixel values are converted against (1080p, 64px type). */
const FRAME_W = 1920, FRAME_H = 1080, FONT_PX = 64;

const at = (keys: Track['keys'], t: number): number[] => {
  if (t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v;
  let i = 0;
  while (keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[i + 1], f = (t - a.t) / (b.t - a.t || 1);
  return a.v.map((x, j) => x + ((b.v[j] ?? x) - x) * f);
};

const IDENT: Omit<AnimKey, 't' | 'ease'> = { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, sx: 1, sy: 1, blur: 0 };

/** Convert one stretch of Motion / Opacity / Blur tracks into entrance-shaped keys that end (or, for an exit, start) at the resting pose. */
function toKeys(tracks: Track[], times: number[], rest: 'end' | 'start', unitPx?: number): AnimKey[] {
  const by = (k: Track['kind']) => tracks.find((t) => t.kind === k);
  const restT = rest === 'end' ? times[times.length - 1] : times[0];
  const pos = by('position'), sc = by('scale'), rot = by('rotation'), op = by('opacity'), bl = by('blur');
  const pr = pos ? at(pos.keys, restT) : [0, 0];
  const pixels = pos ? Math.max(...pos.keys.flatMap((k) => k.v.map(Math.abs))) > 3 : false; // pixels, else a fraction of the frame
  // `unitPx` = the type size in the pack's own pixels (After Effects); otherwise assume 64px type in a 1080p frame.
  const ux = unitPx ? 1 / unitPx : pixels ? 1 / FONT_PX : FRAME_W / FONT_PX, uy = unitPx ? 1 / unitPx : pixels ? 1 / FONT_PX : FRAME_H / FONT_PX;
  const sr = sc ? at(sc.keys, restT)[0] || 1 : 1;
  const rr = rot ? at(rot.keys, restT)[0] : 0;
  const or = op ? at(op.keys, restT)[0] || (Math.max(...op.keys.map((k) => k.v[0])) > 1.5 ? 100 : 1) : 1;
  const t0 = times[0], t1 = times[times.length - 1];
  return times.map((tm): AnimKey => {
    const p = pos ? at(pos.keys, tm) : pr;
    return {
      ...IDENT,
      // Entrance-shaped time: exits are stored mirrored, so playing them backwards ends on the resting pose.
      t: Number((rest === 'end' ? tm - t0 : t1 - tm).toFixed(4)),
      dx: (p[0] - pr[0]) * ux, dy: (p[1] - pr[1]) * uy,
      scale: sc ? Math.max(0.01, at(sc.keys, tm)[0] / sr) : 1,
      rot: rot ? ((at(rot.keys, tm)[0] - rr) * Math.PI) / 180 : 0,
      alpha: op ? Math.min(1, Math.max(0, at(op.keys, tm)[0] / or)) : 1,
      blur: bl ? at(bl.keys, tm)[0] / FONT_PX : 0,
      ease: rest === 'end' ? 'easeOut' : 'easeIn',
    };
  }).sort((a, b) => a.t - b.t);
}

/**
 * Split a preset's tracks into an entrance and an exit and convert both to keyframes.
 * A long quiet gap in the keyframe times separates them; without one, the opacity direction decides.
 */
export function animFromTracks(tracks: Track[], unitPx?: number): { inKeys?: AnimKey[]; outKeys?: AnimKey[] } {
  const times = [...new Set(tracks.flatMap((t) => t.keys.map((k) => Number(k.t.toFixed(4)))))].sort((a, b) => a - b);
  if (times.length < 2) return {};
  const span = times[times.length - 1] - times[0];
  let gapAt = -1, gap = 0;
  for (let i = 0; i < times.length - 1; i++) if (times[i + 1] - times[i] > gap) { gap = times[i + 1] - times[i]; gapAt = i; }
  if (gap > span * 0.4 && gapAt >= 1 && times.length - gapAt - 1 >= 2) {
    return { inKeys: toKeys(tracks, times.slice(0, gapAt + 1), 'end', unitPx), outKeys: toKeys(tracks, times.slice(gapAt + 1), 'start', unitPx) };
  }
  const op = tracks.find((t) => t.kind === 'opacity');
  const leaving = op && at(op.keys, times[0])[0] > at(op.keys, times[times.length - 1])[0];
  return leaving ? { outKeys: toKeys(tracks, times, 'start', unitPx) } : { inKeys: toKeys(tracks, times, 'end', unitPx) };
}
