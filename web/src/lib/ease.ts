import type { SceneEase } from '../types';

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** CSS-style cubic bezier: the y for a given x progress. */
function bezier(x1: number, y1: number, x2: number, y2: number): (u: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t: number) => ((ax * t + bx) * t + cx) * t;
  const Y = (t: number) => ((ay * t + by) * t + cy) * t;
  const dX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (u) => {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    let t = u;
    for (let i = 0; i < 8; i++) { const e = X(t) - u; if (Math.abs(e) < 1e-5) break; const d = dX(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
    return Y(clamp01(t));
  };
}

const c1 = 1.70158, c3 = c1 + 1, c4 = (2 * Math.PI) / 3;
const outBounce = (x: number) => {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
};

const NAMED: Record<string, (u: number) => number> = {
  linear: (u) => u,
  in: (u) => u * u, out: (u) => 1 - (1 - u) * (1 - u), inOut: (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2),
  inCubic: (u) => u * u * u, outCubic: (u) => 1 - Math.pow(1 - u, 3), inOutCubic: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  inExpo: (u) => (u === 0 ? 0 : Math.pow(2, 10 * u - 10)), outExpo: (u) => (u === 1 ? 1 : 1 - Math.pow(2, -10 * u)),
  inOutExpo: (u) => (u === 0 ? 0 : u === 1 ? 1 : u < 0.5 ? Math.pow(2, 20 * u - 10) / 2 : (2 - Math.pow(2, -20 * u + 10)) / 2),
  outBack: (u) => 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2),
  inBack: (u) => c3 * u * u * u - c1 * u * u,
  outElastic: (u) => (u === 0 ? 0 : u === 1 ? 1 : Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * c4) + 1),
  outBounce,
  spring: (u) => 1 - Math.exp(-6 * u) * Math.cos(12 * u),
  hold: () => 0,
};

const cache = new Map<string, (u: number) => number>();

/** The easing function for a name such as "outExpo" or "bezier(0.2,0,0,1)". Unknown names ease linearly. */
export function easeFn(name?: SceneEase): (u: number) => number {
  if (!name) return NAMED.inOut;
  const hit = cache.get(name);
  if (hit) return hit;
  let fn = NAMED[name];
  if (!fn) {
    const m = /^bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/.exec(name);
    fn = m ? bezier(+m[1], +m[2], +m[3], +m[4]) : NAMED.linear;
  }
  cache.set(name, fn);
  return fn;
}

export const EASE_NAMES = Object.keys(NAMED);
