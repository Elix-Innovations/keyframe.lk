import type { AnimationId } from '../types';

export interface AnimState {
  alpha: number;
  dx: number; // in em
  dy: number; // in em
  scale: number;
  reveal: number; // 0..1 horizontal clip (typewriter)
  rot: number; // radians
  sx: number; // extra horizontal scale (squash & stretch)
  sy: number; // extra vertical scale
  blur: number; // in em
}

export const IDENTITY: AnimState = { alpha: 1, dx: 0, dy: 0, scale: 1, reveal: 1, rot: 0, sx: 1, sy: 1, blur: 0 };

/** Seconds an entrance takes at speed 1×. */
export const BASE_DURATION: Record<AnimationId, number> = {
  none: 0, fade: 0.25, softRise: 0.35, slideUp: 0.3, slideDown: 0.3, glideLeft: 0.35, glideRight: 0.35,
  softZoom: 0.3, zoomIn: 0.25, pop: 0.28, springPop: 0.5, bounce: 0.55, floatIn: 0.45, typewriter: 0.35,
  focusIn: 0.4, slam: 0.32, drop: 0.5, stretch: 0.45, swing: 0.5, flipUp: 0.4, jolt: 0.4,
};

export const ANIMATION_LABELS: Record<AnimationId, string> = {
  none: 'None', fade: 'Fade In', softRise: 'Soft Rise', slideUp: 'Slide Up', slideDown: 'Slide Down',
  glideLeft: 'Glide Left', glideRight: 'Glide Right', softZoom: 'Soft Zoom', zoomIn: 'Zoom In', pop: 'Pop',
  springPop: 'Spring Pop', bounce: 'Bounce', floatIn: 'Float In', typewriter: 'Typewriter',
  focusIn: 'Focus In', slam: 'Slam', drop: 'Drop', stretch: 'Stretch', swing: 'Swing', flipUp: 'Flip Up', jolt: 'Jolt',
};

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeOutBack = (x: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
const spring = (x: number) => 1 - Math.exp(-6 * x) * Math.cos(12 * x);
const bounceOut = (x: number) => {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
};

/** Entrance animation state `elapsed` seconds after the element appeared. */
export function animate(id: AnimationId, elapsed: number, speed: number): AnimState {
  const dur = BASE_DURATION[id] / Math.max(0.1, speed);
  if (id === 'none' || dur <= 0 || elapsed >= dur) return IDENTITY;
  const p = clamp01(elapsed / dur);
  const e = easeOutCubic(p);
  const fadeIn = clamp01(p * 2.5);
  switch (id) {
    case 'fade': return { ...IDENTITY, alpha: e };
    case 'softRise': return { ...IDENTITY, alpha: fadeIn, dy: (1 - e) * 0.3 };
    case 'slideUp': return { ...IDENTITY, alpha: fadeIn, dy: (1 - e) * 0.7 };
    case 'slideDown': return { ...IDENTITY, alpha: fadeIn, dy: -(1 - e) * 0.7 };
    case 'glideLeft': return { ...IDENTITY, alpha: fadeIn, dx: (1 - e) * 1.2 };
    case 'glideRight': return { ...IDENTITY, alpha: fadeIn, dx: -(1 - e) * 1.2 };
    case 'softZoom': return { ...IDENTITY, alpha: fadeIn, scale: 0.88 + 0.12 * e };
    case 'zoomIn': return { ...IDENTITY, alpha: fadeIn, scale: 0.3 + 0.7 * e };
    case 'pop': return { ...IDENTITY, alpha: fadeIn, scale: 0.55 + 0.45 * easeOutBack(p) };
    case 'springPop': return { ...IDENTITY, alpha: fadeIn, scale: 0.4 + 0.6 * spring(p) };
    case 'bounce': return { ...IDENTITY, alpha: fadeIn, dy: -(1 - bounceOut(p)) * 0.9 };
    case 'floatIn': return { ...IDENTITY, alpha: e, dy: (1 - e) * 0.45, scale: 0.96 + 0.04 * e };
    case 'typewriter': return { ...IDENTITY, reveal: p };
    // Rack focus: sharpens and settles from slightly large.
    case 'focusIn': return { ...IDENTITY, alpha: e, blur: (1 - e) * 0.22, scale: 1.08 - 0.08 * e };
    // Hits the screen from big and blurred, like an impact.
    case 'slam': return { ...IDENTITY, alpha: clamp01(p * 4), scale: 1 + 0.9 * Math.pow(1 - p, 3), blur: Math.pow(1 - p, 2) * 0.12 };
    // Falls in, squashes on landing, then recovers.
    case 'drop': {
      if (p < 0.55) { const q = p / 0.55; return { ...IDENTITY, alpha: clamp01(q * 3), dy: -(1 - q * q) * 0.9, sy: 1.08, sx: 0.94 }; }
      const q = (p - 0.55) / 0.45, k = Math.sin(q * Math.PI) * (1 - q);
      return { ...IDENTITY, sy: 1 - 0.22 * k, sx: 1 + 0.16 * k };
    }
    // Grows vertically with an elastic overshoot.
    case 'stretch': { const v = spring(p); return { ...IDENTITY, alpha: fadeIn, sy: Math.max(0.01, v), sx: 1 + (1 - v) * 0.25 }; }
    // Swings in from a tilt, pivoting like a sign.
    case 'swing': return { ...IDENTITY, alpha: fadeIn, rot: -(1 - easeOutBack(p)) * 0.26, dy: (1 - e) * 0.15 };
    // Flips up from flat, like a card turning.
    case 'flipUp': return { ...IDENTITY, alpha: fadeIn, sy: Math.max(0.01, easeOutBack(p)), dy: (1 - e) * 0.2 };
    // Punches in with a decaying shake.
    case 'jolt': { const d = Math.exp(-5 * p); return { ...IDENTITY, alpha: clamp01(p * 4), scale: 1 + 0.18 * d, rot: Math.sin(p * 28) * 0.07 * d, dx: Math.sin(p * 34) * 0.05 * d }; }
  }
}

export function combine(a: AnimState, b: AnimState): AnimState {
  if (a === IDENTITY) return b;
  if (b === IDENTITY) return a;
  return {
    alpha: a.alpha * b.alpha, dx: a.dx + b.dx, dy: a.dy + b.dy, scale: a.scale * b.scale, reveal: Math.min(a.reveal, b.reveal),
    rot: a.rot + b.rot, sx: a.sx * b.sx, sy: a.sy * b.sy, blur: a.blur + b.blur,
  };
}
