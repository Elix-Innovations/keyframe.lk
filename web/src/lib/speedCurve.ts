import type { Clip, SpeedPt } from '../types';

/**
 * Variable speed. A curve is a list of points over the source file: at source second `x` the clip plays at
 * `s`× speed (eased between points, flat outside them). Timeline time is the integral of 1 / speed, so the
 * curve stays valid when the clip is trimmed or split: only `in` and `duration` change.
 */

export const CURVE_MIN = 0.1;
export const CURVE_MAX = 10;
const STEP = 0.02; // source seconds per table cell

export function speedAtSrc(pts: SpeedPt[], x: number): number {
  if (x <= pts[0].x) return pts[0].s;
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i].x) {
      const a = pts[i - 1], b = pts[i], u = b.x === a.x ? 1 : (x - a.x) / (b.x - a.x);
      return a.s + (b.s - a.s) * ((1 - Math.cos(Math.PI * u)) / 2); // eased, so the curve has no corners
    }
  }
  return pts[pts.length - 1].s;
}

/** Cumulative timeline seconds to reach each source cell, built once per curve and file length. */
const tables = new WeakMap<SpeedPt[], { len: number; cum: Float64Array }>();
function table(pts: SpeedPt[], sourceDuration: number) {
  const len = Math.max(1, Math.ceil(sourceDuration / STEP) + 2);
  const hit = tables.get(pts);
  if (hit && hit.len === len) return hit.cum;
  const cum = new Float64Array(len + 1);
  for (let i = 0; i < len; i++) cum[i + 1] = cum[i] + STEP / speedAtSrc(pts, (i + 0.5) * STEP);
  tables.set(pts, { len, cum });
  return cum;
}

/** Timeline seconds needed to play the source from 0 to x. */
function cumAt(cum: Float64Array, x: number): number {
  const f = Math.max(0, x) / STEP, i = Math.min(cum.length - 2, Math.floor(f));
  return cum[i] + (cum[i + 1] - cum[i]) * (f - i);
}

/** Source second reached after `t` timeline seconds of playing from the start of the file. */
function srcOf(cum: Float64Array, t: number): number {
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= t) lo = m; else hi = m; }
  const w = cum[hi] - cum[lo];
  return (lo + (w > 0 ? (t - cum[lo]) / w : 0)) * STEP;
}

type Curved = Pick<Clip, 'curve' | 'in' | 'sourceDuration'>;

/** Source second shown `tl` seconds after the clip's left edge. */
export function curveSrcAt(c: Curved & { curve: SpeedPt[] }, tl: number): number {
  const cum = table(c.curve, c.sourceDuration);
  return Math.min(c.sourceDuration, srcOf(cum, cumAt(cum, c.in) + tl));
}

/** Timeline seconds needed to play the source from `from` to `to`. */
export function curveDuration(c: Curved & { curve: SpeedPt[] }, from: number, to: number): number {
  const cum = table(c.curve, c.sourceDuration);
  return cumAt(cum, to) - cumAt(cum, from);
}

/** Timeline seconds between the start of the file and the clip's left edge. */
export const curveLead = (c: Curved & { curve: SpeedPt[] }) => cumAt(table(c.curve, c.sourceDuration), c.in);

/** Speed in effect `tl` seconds after the clip's left edge. */
export const curveSpeedAt = (c: Curved & { curve: SpeedPt[] }, tl: number) => speedAtSrc(c.curve, curveSrcAt(c, tl));

/** A preset shape (position 0..1 along the clip's source, speed) placed on the clip's source span. */
export interface CurvePreset { id: string; name: string; shape: [number, number][] }

export const CURVE_PRESETS: CurvePreset[] = [
  { id: 'montage', name: 'Montage', shape: [[0, 0.7], [0.25, 0.3], [0.5, 2.5], [0.75, 0.3], [1, 0.7]] },
  { id: 'hero', name: 'Hero', shape: [[0, 1], [0.25, 2.5], [0.45, 0.25], [0.65, 0.25], [0.8, 2.5], [1, 1]] },
  { id: 'bullet', name: 'Bullet', shape: [[0, 2.5], [0.35, 2.5], [0.5, 0.1], [0.65, 2.5], [1, 2.5]] },
  { id: 'jump', name: 'Jump cut', shape: [[0, 1], [0.3, 3], [0.6, 1], [0.8, 3], [1, 1]] },
  { id: 'in', name: 'Flash in', shape: [[0, 0.3], [0.5, 1], [1, 4]] },
  { id: 'out', name: 'Flash out', shape: [[0, 4], [0.5, 1], [1, 0.3]] },
];

export const placeShape = (shape: [number, number][], from: number, span: number): SpeedPt[] =>
  shape.map(([u, s]) => ({ x: from + u * span, s }));

/** Duration of the clip's source span under a curve. */
export const spanDuration = (c: Curved, pts: SpeedPt[], span: number) => curveDuration({ ...c, curve: pts }, c.in, c.in + span);
