import type { MotionScene, SceneEase, SceneKey, SceneNode, SceneProp } from '../types';

/**
 * Ready-made motion graphics, transitions and backgrounds. Each entry builds a scene for the project's frame (1080 wide
 * and `h` tall), so the same entry fits a 9:16 and a 16:9 project. They also show Claude the scene format by example.
 */

export interface LibraryEntry {
  id: string;
  name: string;
  role: MotionScene['role'];
  note: string;
  build: (frame: { w: number; h: number }, accent?: string) => MotionScene;
}

const k = <T,>(t: number, v: T, ease?: SceneEase): SceneKey<T> => ({ t, v, ease });
const keys = <T,>(...ks: SceneKey<T>[]): SceneProp<T> => ({ keys: ks });
const scene = (name: string, duration: number, role: MotionScene['role'], frame: { w: number; h: number }, layers: SceneNode[], bg?: string): MotionScene => ({ v: 1, name, duration, role, frame, layers, ...(bg ? { bg } : {}) });

const lowerThird: LibraryEntry['build'] = (f, accent = '#18D2FF') => {
  const y = f.h * 0.78, D = 4;
  return scene('Lower third', D, 'graphic', f, [
    { type: 'rect', name: 'plate', x: 60, y, w: keys(k(0, 0, 'outExpo'), k(0.7, 700), k(D - 0.6, 700, 'inExpo'), k(D, 0)), h: 150, ax: 0, radius: 14, fill: 'rgba(12,14,20,0.82)' },
    { type: 'rect', name: 'accent', x: 60, y, w: 14, h: keys(k(0, 0, 'outExpo'), k(0.5, 150), k(D - 0.6, 150, 'inExpo'), k(D, 0)), ax: 0, radius: 7, fill: accent },
    { type: 'text', name: 'name', text: 'Your Name', x: 110, y: y - 28, size: 54, align: 'left', weight: 800, fill: '#fff', opacity: keys(k(0.3, 0), k(0.7, 1), k(D - 0.6, 1), k(D - 0.3, 0)), reveal: keys(k(0.3, 0, 'out'), k(1.0, 1)) },
    { type: 'text', name: 'role', text: 'Title / Role', x: 110, y: y + 32, size: 32, align: 'left', weight: 600, fill: accent, opacity: keys(k(0.55, 0), k(0.95, 1), k(D - 0.6, 1), k(D - 0.3, 0)) },
  ]);
};

const titleCard: LibraryEntry['build'] = (f, accent = '#FFD400') => scene('Title pop', 3, 'graphic', f, [
  { type: 'text', name: 'title', text: 'BIG TITLE', x: f.w / 2, y: f.h * 0.45, size: 150, weight: 900, fill: '#fff', shadow: { color: 'rgba(0,0,0,0.5)', blur: 24, y: 8 },
    scale: keys(k(0, 0.4, 'outBack'), k(0.6, 1), k(2.6, 1, 'inCubic'), k(3, 0.9)), opacity: keys(k(0, 0), k(0.2, 1), k(2.6, 1), k(3, 0)) },
  { type: 'line', name: 'underline', x: f.w / 2 - 260, y: f.h * 0.45 + 110, x2: f.w / 2 + 260, y2: f.h * 0.45 + 110, strokeWidth: 12, stroke: accent, trim: keys(k(0.4, 0, 'outExpo'), k(1.1, 1)), opacity: keys(k(2.5, 1), k(2.9, 0)) },
]);

const burst: LibraryEntry['build'] = (f, accent = '#FF3CAC') => {
  const rings: SceneNode[] = Array.from({ length: 5 }, (_, i) => ({
    type: 'ellipse' as const, name: `ring ${i + 1}`, x: f.w / 2, y: f.h / 2, w: 300, h: 300, stroke: i % 2 ? '#fff' : accent, strokeWidth: keys(k(i * 0.12, 18), k(i * 0.12 + 1.1, 2)),
    scale: keys(k(i * 0.12, 0.1, 'outExpo'), k(i * 0.12 + 1.1, 4.5)), opacity: keys(k(i * 0.12, 1), k(i * 0.12 + 1.1, 0)), start: i * 0.12,
  }));
  return scene('Ring burst', 1.9, 'graphic', f, rings);
};

const wipe: LibraryEntry['build'] = (f, accent = '#18D2FF') => scene('Colour wipe', 0.9, 'transition', f, [
  { type: 'rect', name: 'wipe', x: keys(k(0, -f.w * 1.2, 'inOutExpo'), k(0.4, 0), k(0.5, 0, 'inOutExpo'), k(0.9, f.w * 1.2)), y: f.h / 2, w: f.w * 1.2, h: f.h, ax: 0, ay: 0.5, fill: accent },
  { type: 'rect', name: 'shade', x: keys(k(0.05, -f.w * 1.2, 'inOutExpo'), k(0.45, 0), k(0.55, 0, 'inOutExpo'), k(0.9, f.w * 1.2)), y: f.h / 2, w: f.w * 1.2, h: f.h, ax: 0, ay: 0.5, fill: 'rgba(0,0,0,0.55)', opacity: 0.6 },
]);

const flash: LibraryEntry['build'] = (f) => scene('Flash cut', 0.45, 'transition', f, [
  { type: 'rect', name: 'flash', x: f.w / 2, y: f.h / 2, w: f.w, h: f.h, fill: '#fff', opacity: keys(k(0, 0, 'out'), k(0.12, 1), k(0.45, 0, 'inOut')) },
]);

const slats: LibraryEntry['build'] = (f, accent = '#111111') => {
  const n = 6, w = f.w / n;
  const bars: SceneNode[] = Array.from({ length: n }, (_, i) => ({
    type: 'rect' as const, name: `slat ${i + 1}`, x: i * w + w / 2, y: f.h / 2, w: w + 2, h: f.h, fill: accent,
    scaleY: keys(k(i * 0.05, 0, 'inOutExpo'), k(i * 0.05 + 0.35, 1), k(0.5 + i * 0.05, 1, 'inOutExpo'), k(0.85 + i * 0.05, 0)),
  }));
  return scene('Slat wipe', 1.15, 'transition', f, bars);
};

const circle: LibraryEntry['build'] = (f, accent = '#FFD400') => {
  const d = Math.hypot(f.w, f.h) * 1.15;
  return scene('Circle reveal', 1, 'transition', f, [
    { type: 'ellipse', name: 'disc', x: f.w / 2, y: f.h / 2, w: d, h: d, fill: accent, scale: keys(k(0, 0, 'inOutExpo'), k(0.45, 1), k(0.55, 1, 'inOutExpo'), k(1, 0)) },
  ]);
};

const glow: LibraryEntry['build'] = (f, accent = '#7C3AED') => scene('Glow background', 8, 'background', f, [
  { type: 'ellipse', name: 'orb a', x: keys(k(0, f.w * 0.2, 'inOut'), k(4, f.w * 0.8, 'inOut'), k(8, f.w * 0.2)), y: keys(k(0, f.h * 0.25, 'inOut'), k(4, f.h * 0.45, 'inOut'), k(8, f.h * 0.25)), w: 900, h: 900, fill: accent, blur: 140, opacity: 0.8 },
  { type: 'ellipse', name: 'orb b', x: keys(k(0, f.w * 0.85, 'inOut'), k(4, f.w * 0.15, 'inOut'), k(8, f.w * 0.85)), y: keys(k(0, f.h * 0.75, 'inOut'), k(4, f.h * 0.55, 'inOut'), k(8, f.h * 0.75)), w: 800, h: 800, fill: '#18D2FF', blur: 150, opacity: 0.7 },
], '#0B0B14');


// ---- More transitions: fire, light, glitch and shape wipes. Each peaks (covers the frame) at the middle of its length. ----

const rnd = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
/** 0 -> 1 -> 0 around the middle of the scene: the "cover" amount most transitions follow. */
const peak = (D: number, hold = 0.1, ease: SceneEase = 'inOut'): SceneProp<number> => keys(k(0, 0, ease), k(D / 2 - hold, 1), k(D / 2 + hold, 1, ease), k(D, 0));
const full = (f: { w: number; h: number }, name: string, fill: string, opacity: SceneProp<number>, extra: Partial<SceneNode> = {}): SceneNode => ({ type: 'rect', name, x: f.w / 2, y: f.h / 2, w: f.w + 4, h: f.h + 4, fill, opacity, ...extra });

const fireWipe: LibraryEntry['build'] = (f) => {
  const D = 1.3, n = 9, w = f.w / n;
  const flames: SceneNode[] = Array.from({ length: n * 2 }, (_, i) => {
    const col = i % n, tall = i >= n, d = rnd(i + 1) * 0.18;
    const x = col * w + w / 2 + (rnd(i + 20) - 0.5) * w * 0.6;
    return {
      type: 'ellipse' as const, name: `flame ${i + 1}`, x, w: w * (tall ? 2.1 : 1.7), h: f.h * (tall ? 0.8 : 0.55), blur: 46, blend: 'lighter' as const,
      fill: ['#ff4a00', '#ffb000', '#ff2200', '#ffd45e'][i % 4],
      y: keys(k(d, f.h * 1.25, 'inOut'), k(D * 0.5 + d * 0.3, f.h * (tall ? 0.45 : 0.55)), k(D * 0.62, f.h * (tall ? 0.45 : 0.55), 'inOut'), k(D, -f.h * 0.35)),
      scaleY: keys(k(0, 0.7), k(D * 0.5, 1.15), k(D, 0.6)), opacity: keys(k(d, 0), k(d + 0.2, 1), k(D * 0.75, 1), k(D, 0)),
    };
  });
  return scene('Fire wipe', D, 'transition', f, [
    full(f, 'heat', '#ff3d00', keys(k(0, 0), k(D * 0.42, 0.75, 'out'), k(D * 0.6, 0.75), k(D, 0, 'in')), { blend: 'screen' }),
    ...flames,
    full(f, 'embers', '#fff2b0', keys(k(D * 0.4, 0), k(D * 0.5, 0.55), k(D * 0.62, 0)), { blend: 'lighter' }),
  ]);
};

const lensFlare: LibraryEntry['build'] = (f) => {
  const D = 1.2, hy = f.h * 0.42;
  const ghosts: SceneNode[] = ['#ff7a45', '#6ad0ff', '#ffe27a', '#b98bff'].map((c, i) => ({
    type: 'ellipse' as const, name: `ghost ${i + 1}`, w: 90 + i * 55, h: 90 + i * 55, fill: c, blur: 16, blend: 'lighter' as const,
    x: keys(k(0, f.w * (1.05 - i * 0.08), 'inOut'), k(D, f.w * (-0.05 + i * 0.06))), y: keys(k(0, f.h / 2 + (hy - f.h / 2) * (-0.6 - i * 0.4)), k(D, f.h / 2 - (hy - f.h / 2) * (-0.6 - i * 0.4))),
    opacity: keys(k(0.1, 0), k(D / 2, 0.55), k(D - 0.1, 0)),
  }));
  return scene('Lens flare', D, 'transition', f, [
    { type: 'ellipse', name: 'orb', y: keys(k(0, hy), k(D, f.h * 0.5)), x: keys(k(0, -f.w * 0.1, 'inOut'), k(D, f.w * 1.1)), w: 520, h: 520, fill: '#fff1c2', blur: 70, blend: 'lighter', scale: keys(k(0, 0.3), k(D / 2, 1.8, 'inOut'), k(D, 0.3)) },
    { type: 'ellipse', name: 'core', y: keys(k(0, hy), k(D, f.h * 0.5)), x: keys(k(0, -f.w * 0.1, 'inOut'), k(D, f.w * 1.1)), w: 150, h: 150, fill: '#ffffff', blur: 20, blend: 'lighter', opacity: peak(D, 0.05) },
    { type: 'rect', name: 'streak', x: f.w / 2, y: keys(k(0, hy), k(D, f.h * 0.5)), w: f.w * 1.6, h: 14, fill: '#ffe7a8', blur: 6, blend: 'lighter', scaleX: keys(k(0, 0.1, 'out'), k(D / 2, 1), k(D, 0.1, 'in')), opacity: peak(D, 0.1) },
    ...ghosts,
    full(f, 'bloom', '#fff6dd', keys(k(D * 0.35, 0), k(D / 2, 0.85, 'out'), k(D * 0.68, 0, 'in')), { blend: 'lighter' }),
  ]);
};

const lightLeak: LibraryEntry['build'] = (f) => {
  const D = 1.4;
  return scene('Light leak', D, 'transition', f, [
    { type: 'ellipse', name: 'amber', x: keys(k(0, f.w * 1.3, 'inOut'), k(D, -f.w * 0.3)), y: f.h * 0.35, w: f.w * 1.6, h: f.h * 1.2, fill: '#ff9a2e', blur: 120, blend: 'screen', opacity: peak(D, 0.2) },
    { type: 'ellipse', name: 'rose', x: keys(k(0, f.w * 1.5, 'inOut'), k(D, -f.w * 0.1)), y: f.h * 0.7, w: f.w * 1.3, h: f.h * 0.9, fill: '#ff3d7a', blur: 130, blend: 'screen', opacity: peak(D, 0.1) },
    { type: 'ellipse', name: 'gold', x: keys(k(0.1, f.w * 1.2, 'inOut'), k(D, -f.w * 0.2)), y: f.h * 0.2, w: f.w, h: f.h * 0.6, fill: '#ffe08a', blur: 100, blend: 'screen', opacity: peak(D, 0.1) },
    full(f, 'wash', '#ffb25a', keys(k(D * 0.3, 0), k(D / 2, 0.7), k(D * 0.75, 0)), { blend: 'screen' }),
  ]);
};

const sparkBurst: LibraryEntry['build'] = (f) => {
  const D = 0.9, n = 16, R = Math.hypot(f.w, f.h) * 0.6;
  const rays: SceneNode[] = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + rnd(i) * 0.3, r0 = R * (0.08 + rnd(i + 5) * 0.1), r1 = R * (0.5 + rnd(i + 9) * 0.5);
    return {
      type: 'line' as const, name: `ray ${i + 1}`, x: f.w / 2 + Math.cos(a) * r0, y: f.h / 2 + Math.sin(a) * r0, x2: f.w / 2 + Math.cos(a) * r1, y2: f.h / 2 + Math.sin(a) * r1,
      stroke: i % 3 ? '#fff4c2' : '#ffb347', strokeWidth: 6 + rnd(i + 2) * 8, trim: keys(k(0.05, 0, 'outExpo'), k(0.45, 1)), opacity: keys(k(0.05, 0), k(0.15, 1), k(0.7, 0)), blend: 'lighter' as const,
    };
  });
  return scene('Spark burst', D, 'transition', f, [
    { type: 'ellipse', name: 'core', x: f.w / 2, y: f.h / 2, w: 360, h: 360, fill: '#fff', blur: 60, blend: 'lighter', scale: keys(k(0, 0.2, 'outExpo'), k(0.45, 5)), opacity: keys(k(0, 0), k(0.15, 1), k(0.6, 0)) },
    ...rays,
    full(f, 'flash', '#ffffff', keys(k(0.1, 0), k(0.25, 0.9, 'out'), k(0.7, 0, 'in'))),
  ]);
};

const glitchSlices: LibraryEntry['build'] = (f) => {
  const D = 0.8, n = 10, h = f.h / n;
  const bars: SceneNode[] = Array.from({ length: n * 2 }, (_, i) => {
    const row = i % n, cyan = i < n, d = rnd(i + 3) * 0.2;
    const jit = (o: number) => (rnd(i * 7 + o) - 0.5) * f.w * 0.5;
    return {
      type: 'rect' as const, name: `slice ${i + 1}`, y: row * h + h / 2, w: f.w * (0.6 + rnd(i + 11) * 0.6), h: h + 1, fill: cyan ? '#00f0ff' : '#ff2bd6', blend: 'lighter' as const,
      x: keys(k(0, f.w / 2 + jit(1)), k(0.15, f.w / 2 + jit(2)), k(0.3, f.w / 2 + jit(3)), k(0.45, f.w / 2 + jit(4)), k(0.6, f.w / 2 + jit(5)), k(D, f.w / 2 + jit(6))),
      opacity: keys(k(d, 0), k(d + 0.05, 0.9), k(d + 0.2, 0.15), k(d + 0.3, 0.8), k(d + 0.45, 0)),
    };
  });
  return scene('Glitch slices', D, 'transition', f, [
    full(f, 'dark', '#05060a', keys(k(0.12, 0), k(0.2, 0.9), k(0.55, 0.9), k(0.65, 0))),
    ...bars,
    full(f, 'tear', '#ffffff', keys(k(0.3, 0), k(0.33, 0.5), k(0.36, 0), k(0.5, 0), k(0.52, 0.4), k(0.55, 0)), { blend: 'difference' }),
  ]);
};

const shutter: LibraryEntry['build'] = (f) => {
  const D = 0.7;
  return scene('Camera shutter', D, 'transition', f, [
    { type: 'rect', name: 'top', x: f.w / 2, y: 0, w: f.w + 4, h: keys(k(0, 0, 'inExpo'), k(D * 0.4, f.h * 0.52), k(D * 0.55, f.h * 0.52, 'outExpo'), k(D, 0)), ax: 0.5, ay: 0, fill: '#08090d' },
    { type: 'rect', name: 'bottom', x: f.w / 2, y: f.h, w: f.w + 4, h: keys(k(0, 0, 'inExpo'), k(D * 0.4, f.h * 0.52), k(D * 0.55, f.h * 0.52, 'outExpo'), k(D, 0)), ax: 0.5, ay: 1, fill: '#08090d' },
    full(f, 'click', '#ffffff', keys(k(D * 0.4, 0), k(D * 0.45, 0.8), k(D * 0.62, 0, 'out'))),
  ]);
};

const diamond: LibraryEntry['build'] = (f, accent = '#ff3cac') => {
  const d = Math.hypot(f.w, f.h) * 1.1, D = 1;
  return scene('Diamond wipe', D, 'transition', f, [
    { type: 'rect', name: 'diamond', x: f.w / 2, y: f.h / 2, w: d, h: d, rotation: 45, fill: accent, scale: keys(k(0, 0, 'inOutExpo'), k(D * 0.45, 1), k(D * 0.55, 1, 'inOutExpo'), k(D, 0)) },
    { type: 'rect', name: 'diamond edge', x: f.w / 2, y: f.h / 2, w: d, h: d, rotation: 45, stroke: '#fff', strokeWidth: 10, scale: keys(k(0.06, 0, 'inOutExpo'), k(D * 0.5, 1.04), k(D * 0.6, 1.04, 'inOutExpo'), k(D, 0)), opacity: 0.9 },
  ]);
};

const inkDrop: LibraryEntry['build'] = (f) => {
  const D = 1.3, n = 9, R = Math.hypot(f.w, f.h) * 0.45;
  const drops: SceneNode[] = Array.from({ length: n }, (_, i) => {
    const d = rnd(i + 31) * 0.3;
    return { type: 'ellipse' as const, name: `ink ${i + 1}`, x: rnd(i + 40) * f.w, y: rnd(i + 60) * f.h, w: R, h: R, fill: '#0a0a12', blur: 18, scale: keys(k(d, 0, 'out'), k(d + 0.55, 1.2), k(D * 0.6 + d * 0.3, 1.2, 'inOut'), k(D, 0)) };
  });
  return scene('Ink drop', D, 'transition', f, drops);
};

const speedStreaks: LibraryEntry['build'] = (f) => {
  const D = 0.8, n = 22;
  const lines: SceneNode[] = Array.from({ length: n }, (_, i) => {
    const y = rnd(i + 70) * f.h, d = rnd(i + 90) * 0.25, len = f.w * (0.5 + rnd(i + 4) * 0.7);
    return { type: 'rect' as const, name: `streak ${i + 1}`, y, w: len, h: 3 + rnd(i + 8) * 8, ax: 0.5, fill: i % 4 ? '#ffffff' : '#7ae7ff', blend: 'lighter' as const, blur: 2,
      x: keys(k(d, -len * 0.5, 'inExpo'), k(d + 0.5, f.w + len * 0.5)), opacity: keys(k(d, 0), k(d + 0.1, 0.95), k(d + 0.45, 0.95), k(d + 0.5, 0)) };
  });
  return scene('Speed streaks', D, 'transition', f, [
    full(f, 'whip', '#0b1220', keys(k(0.1, 0), k(0.3, 0.8), k(0.5, 0.8), k(0.7, 0))),
    ...lines,
  ]);
};

const neonSweep: LibraryEntry['build'] = (f) => {
  const D = 1, d = Math.hypot(f.w, f.h) * 1.4;
  return scene('Neon sweep', D, 'transition', f, [
    { type: 'rect', name: 'beam', x: keys(k(0, -d * 0.6, 'inOutExpo'), k(D, f.w + d * 0.6)), y: f.h / 2, w: f.w * 0.9, h: d, rotation: 20, gradient: { angle: 90, stops: [{ p: 0, c: 'rgba(255,40,200,0)' }, { p: 0.35, c: '#ff2bd6' }, { p: 0.65, c: '#22d3ee' }, { p: 1, c: 'rgba(34,211,238,0)' }] }, blend: 'lighter', opacity: 0.95 },
    { type: 'rect', name: 'glow', x: keys(k(0, -d * 0.6, 'inOutExpo'), k(D, f.w + d * 0.6)), y: f.h / 2, w: f.w * 1.3, h: d, rotation: 20, fill: '#8b5cf6', blur: 90, blend: 'screen', opacity: 0.6 },
    full(f, 'tint', '#120a2a', keys(k(0.25, 0), k(D / 2, 0.55), k(0.75, 0))),
  ]);
};

const filmBurn: LibraryEntry['build'] = (f) => {
  const D = 1.2;
  return scene('Film burn', D, 'transition', f, [
    { type: 'ellipse', name: 'burn a', x: keys(k(0, f.w * 0.95), k(D, f.w * 0.1, 'inOut')), y: keys(k(0, f.h * 0.2), k(D, f.h * 0.8)), w: f.w * 1.5, h: f.h * 0.8, fill: '#ff6a00', blur: 110, blend: 'screen', opacity: peak(D, 0.15) },
    { type: 'ellipse', name: 'burn b', x: keys(k(0, f.w * 0.1), k(D, f.w * 0.9, 'inOut')), y: keys(k(0, f.h * 0.9), k(D, f.h * 0.15)), w: f.w * 1.2, h: f.h * 0.7, fill: '#ffcf4a', blur: 100, blend: 'screen', opacity: peak(D, 0.1) },
    { type: 'ellipse', name: 'burn c', x: f.w * 0.5, y: f.h * 0.5, w: f.w * 1.4, h: f.h * 1.2, fill: '#fff0c0', blur: 140, blend: 'screen', opacity: keys(k(D * 0.38, 0), k(D / 2, 0.95, 'out'), k(D * 0.66, 0, 'in')) },
    full(f, 'grain', '#ff7a1a', keys(k(0, 0), k(D / 2, 0.5), k(D, 0)), { blend: 'overlay' }),
  ]);
};

const pixelDissolve: LibraryEntry['build'] = (f, accent = '#0b0b14') => {
  const cols = 7, cell = f.w / cols, rows = Math.ceil(f.h / cell), D = 1.1;
  const cells: SceneNode[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const d = rnd(r * 13 + c * 7 + 2) * 0.32;
    cells.push({ type: 'rect', name: `px ${r}-${c}`, x: c * cell + cell / 2, y: r * cell + cell / 2, w: cell + 1, h: cell + 1, fill: accent, scale: keys(k(d, 0, 'out'), k(d + 0.22, 1.02), k(D * 0.62 + d * 0.35, 1.02), k(D * 0.62 + d * 0.35 + 0.2, 0, 'in')) });
  }
  return scene('Pixel dissolve', D, 'transition', f, cells);
};

const shockwave: LibraryEntry['build'] = (f) => {
  const D = 0.9;
  const rings: SceneNode[] = [0, 1, 2].map((i) => ({
    type: 'ellipse' as const, name: `wave ${i + 1}`, x: f.w / 2, y: f.h / 2, w: 400, h: 400, stroke: i === 1 ? '#7ae7ff' : '#ffffff', strokeWidth: keys(k(i * 0.08, 40), k(i * 0.08 + 0.7, 3)), blend: 'lighter' as const, blur: 3,
    scale: keys(k(i * 0.08, 0.1, 'outExpo'), k(i * 0.08 + 0.7, Math.hypot(f.w, f.h) / 330)), opacity: keys(k(i * 0.08, 1), k(i * 0.08 + 0.7, 0)),
  }));
  return scene('Shockwave', D, 'transition', f, [...rings, full(f, 'flash', '#ffffff', keys(k(0, 0), k(0.08, 0.7, 'out'), k(0.4, 0, 'in')))]);
};

const stripes: LibraryEntry['build'] = (f) => {
  const D = 1.1, n = 5, cols = ['#ff3cac', '#784ba0', '#2b86c5', '#18d2ff', '#ffd400'], band = Math.hypot(f.w, f.h) / n * 1.3, L = Math.hypot(f.w, f.h) * 1.4;
  const bars: SceneNode[] = cols.map((c, i) => ({
    type: 'rect' as const, name: `band ${i + 1}`, x: f.w / 2 + (i - (n - 1) / 2) * band * 0.75, y: f.h / 2, w: band, h: L, rotation: 24, fill: c,
    scaleY: keys(k(i * 0.06, 0, 'inOutExpo'), k(i * 0.06 + 0.35, 1), k(0.55 + i * 0.04, 1, 'inOutExpo'), k(0.9 + i * 0.04, 0)),
  }));
  return scene('Diagonal bands', D, 'transition', f, bars);
};

const zoomPunch: LibraryEntry['build'] = (f) => {
  const D = 0.7;
  return scene('Zoom punch', D, 'transition', f, [
    { type: 'ellipse', name: 'vortex', x: f.w / 2, y: f.h / 2, w: Math.hypot(f.w, f.h), h: Math.hypot(f.w, f.h), gradient: { angle: 0, stops: [{ p: 0, c: 'rgba(0,0,0,0)' }, { p: 1, c: 'rgba(0,0,0,0.95)' }] }, scale: keys(k(0, 0.2, 'inExpo'), k(D * 0.5, 1.2), k(D, 0.2, 'outExpo')), opacity: peak(D, 0.05) },
    full(f, 'white', '#ffffff', keys(k(D * 0.42, 0), k(D * 0.5, 1), k(D * 0.68, 0, 'out'))),
  ]);
};

// ---- Trending graphics ----

const confetti: LibraryEntry['build'] = (f) => {
  const D = 3, n = 36, cols = ['#ff3cac', '#ffd400', '#18d2ff', '#7cf29c', '#ffffff', '#ff7a45'];
  const bits: SceneNode[] = Array.from({ length: n }, (_, i) => {
    const x0 = f.w / 2 + (rnd(i) - 0.5) * 160, x1 = f.w * (0.05 + rnd(i + 8) * 0.9), top = f.h * (0.15 + rnd(i + 2) * 0.2), d = rnd(i + 50) * 0.25;
    return {
      type: 'rect' as const, name: `bit ${i + 1}`, w: 14 + rnd(i + 3) * 12, h: 22 + rnd(i + 6) * 18, radius: 2, fill: cols[i % cols.length],
      x: keys(k(d, x0, 'out'), k(D, x1)), y: keys(k(d, f.h * 0.62, 'out'), k(d + 0.55, top, 'in'), k(D, f.h * 1.1)),
      rotation: keys(k(d, 0), k(D, (rnd(i + 9) - 0.5) * 1400)), scaleY: keys(k(d, 1), k(d + 0.7, -1), k(d + 1.4, 1), k(D, -1)), opacity: keys(k(d, 0), k(d + 0.05, 1), k(D - 0.4, 1), k(D, 0)),
    };
  });
  return scene('Confetti pop', D, 'graphic', f, bits);
};

const sparkleShower: LibraryEntry['build'] = (f) => {
  const D = 2.6, n = 18;
  const stars: SceneNode[] = Array.from({ length: n }, (_, i) => {
    const x = rnd(i + 3) * f.w, y = rnd(i + 30) * f.h, d = rnd(i + 70) * 1.2, sz = 40 + rnd(i + 5) * 60;
    return {
      type: 'group' as const, name: `star ${i + 1}`, x, y, scale: keys(k(d, 0, 'outBack'), k(d + 0.4, 1), k(d + 0.9, 0, 'in')), rotation: keys(k(d, 0), k(d + 0.9, 90)), opacity: keys(k(d, 0), k(d + 0.1, 1), k(d + 0.8, 0)),
      children: [
        { type: 'rect' as const, w: sz, h: 5, fill: '#fff7c2', blend: 'lighter' as const, blur: 1.5 },
        { type: 'rect' as const, w: 5, h: sz, fill: '#fff7c2', blend: 'lighter' as const, blur: 1.5 },
        { type: 'ellipse' as const, w: sz * 0.7, h: sz * 0.7, fill: '#ffe9a0', blur: 14, blend: 'lighter' as const },
      ],
    };
  });
  return scene('Sparkle shower', D, 'graphic', f, stars);
};

const speedLines: LibraryEntry['build'] = (f) => {
  const D = 2, n = 28, R = Math.hypot(f.w, f.h) * 0.75;
  const rays: SceneNode[] = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + rnd(i) * 0.2, r0 = R * (0.38 + rnd(i + 4) * 0.12), r1 = R * (0.9 + rnd(i + 9) * 0.1), d = rnd(i + 90) * 0.4;
    return { type: 'line' as const, name: `line ${i + 1}`, x: f.w / 2 + Math.cos(a) * r0, y: f.h / 2 + Math.sin(a) * r0, x2: f.w / 2 + Math.cos(a) * r1, y2: f.h / 2 + Math.sin(a) * r1,
      stroke: '#ffffff', strokeWidth: 3 + rnd(i + 2) * 7, trim: keys(k(d, 0, 'out'), k(d + 0.25, 1)), opacity: keys(k(d, 0), k(d + 0.1, 0.9), k(D - 0.3, 0.9), k(D, 0)) };
  });
  return scene('Speed lines', D, 'graphic', f, rays);
};

const countdown: LibraryEntry['build'] = (f, accent = '#FFD400') => {
  const D = 3.2;
  const digits: SceneNode[] = ['3', '2', '1'].map((t, i) => ({
    type: 'text' as const, name: `n${t}`, text: t, x: f.w / 2, y: f.h * 0.45, size: 360, weight: 900, fill: i === 2 ? accent : '#fff', start: i, end: i + 1, shadow: { color: 'rgba(0,0,0,0.5)', blur: 30, y: 10 },
    scale: keys(k(i, 1.8, 'outBack'), k(i + 0.35, 1), k(i + 0.9, 0.8, 'in')), opacity: keys(k(i, 0), k(i + 0.15, 1), k(i + 0.75, 1), k(i + 1, 0)),
  }));
  return scene('Countdown 3-2-1', D, 'graphic', f, [
    { type: 'ellipse', name: 'ring', x: f.w / 2, y: f.h * 0.45, w: 560, h: 560, stroke: 'rgba(255,255,255,0.7)', strokeWidth: 10, scale: keys(k(0, 1), k(3, 1.15)), opacity: keys(k(0, 0), k(0.2, 1), k(2.8, 1), k(3, 0)) },
    ...digits,
  ]);
};

// ---- More light leaks: each is a few blurred 'screen' blobs that drift across and peak at the cut. ----

type Blob = { c: string; x0: number; x1: number; y0: number; y1: number; w: number; h: number; blur?: number; hold?: number; delay?: number };
/** Build a light-leak transition from blobs given in frame fractions. */
const leak = (name: string, D: number, blobs: Blob[], wash?: { c: string; a: number; blend?: SceneNode['blend'] }): LibraryEntry['build'] => (f) => scene(name, D, 'transition', f, [
  ...blobs.map((b, i): SceneNode => {
    const d = b.delay ?? 0;
    return {
      type: 'ellipse', name: `leak ${i + 1}`, w: b.w * f.w, h: b.h * f.h, fill: b.c, blur: b.blur ?? 110, blend: 'screen',
      x: keys(k(d, b.x0 * f.w, 'inOut'), k(D, b.x1 * f.w)), y: keys(k(d, b.y0 * f.h, 'inOut'), k(D, b.y1 * f.h)),
      opacity: keys(k(d, 0, 'inOut'), k(D / 2, 1), k(D / 2 + (b.hold ?? 0.05), 1, 'inOut'), k(D, 0)),
    };
  }),
  ...(wash ? [full(f, 'wash', wash.c, keys(k(D * 0.32, 0), k(D / 2, wash.a, 'out'), k(D * 0.72, 0, 'in')), { blend: wash.blend ?? 'screen' })] : []),
]);

const leakSunset = leak('Sunset leak', 1.5, [
  { c: '#ff5e3a', x0: -0.2, x1: 0.8, y0: 1.1, y1: 0.5, w: 1.6, h: 1.1 },
  { c: '#ffb347', x0: 0.1, x1: 1.1, y0: 0.9, y1: 0.2, w: 1.2, h: 0.8, delay: 0.1 },
  { c: '#ff2d7a', x0: 1.2, x1: 0.2, y0: 0.2, y1: 0.8, w: 1.1, h: 0.9, delay: 0.15 },
], { c: '#ff8a3d', a: 0.55 });
const leakGolden = leak('Golden hour', 1.4, [
  { c: '#ffd36a', x0: 0.5, x1: 0.5, y0: -0.3, y1: 0.4, w: 1.8, h: 0.9, blur: 130 },
  { c: '#ff9d2e', x0: 0.2, x1: 0.9, y0: 0.1, y1: 0.5, w: 1.1, h: 0.7, delay: 0.1 },
], { c: '#ffe7a8', a: 0.75 });
const leakCandy = leak('Candy leak', 1.3, [
  { c: '#ff4fd8', x0: -0.3, x1: 0.9, y0: 0.2, y1: 0.7, w: 1.3, h: 1 },
  { c: '#7a5cff', x0: 1.3, x1: 0.1, y0: 0.8, y1: 0.3, w: 1.3, h: 1, delay: 0.05 },
  { c: '#3ad6ff', x0: 0.5, x1: 0.5, y0: 1.3, y1: 0.1, w: 1.5, h: 0.8, delay: 0.1 },
]);
const leakEmber = leak('Ember glow', 1.4, [
  { c: '#ff3d00', x0: 0.5, x1: 0.5, y0: 1.3, y1: 0.5, w: 2, h: 1.1, blur: 140 },
  { c: '#ffae00', x0: 0.3, x1: 0.7, y0: 1.2, y1: 0.7, w: 1.2, h: 0.7, delay: 0.12 },
], { c: '#ff6a1a', a: 0.5 });
const leakIce = leak('Ice leak', 1.3, [
  { c: '#9be7ff', x0: -0.3, x1: 1.0, y0: 0.3, y1: 0.6, w: 1.4, h: 1 },
  { c: '#6a8dff', x0: 1.3, x1: 0.2, y0: 0.7, y1: 0.4, w: 1.2, h: 0.9, delay: 0.08 },
], { c: '#e6f8ff', a: 0.6 });
const leakEdge = leak('Edge flare', 1.2, [
  { c: '#ffb070', x0: -0.25, x1: -0.05, y0: 0.5, y1: 0.5, w: 0.9, h: 1.6, blur: 90 },
  { c: '#ff6a8a', x0: 1.25, x1: 1.05, y0: 0.4, y1: 0.4, w: 0.9, h: 1.6, blur: 90, delay: 0.1 },
], { c: '#ffd9b0', a: 0.5 });
const leakRainbow = leak('Rainbow leak', 1.5, [
  { c: '#ff4d4d', x0: -0.2, x1: 0.9, y0: 0.5, y1: 0.5, w: 0.9, h: 1.5, blur: 100 },
  { c: '#ffd24d', x0: -0.1, x1: 1.0, y0: 0.5, y1: 0.5, w: 0.9, h: 1.5, blur: 100, delay: 0.08 },
  { c: '#4dff9a', x0: 0, x1: 1.1, y0: 0.5, y1: 0.5, w: 0.9, h: 1.5, blur: 100, delay: 0.16 },
  { c: '#4db8ff', x0: 0.1, x1: 1.2, y0: 0.5, y1: 0.5, w: 0.9, h: 1.5, blur: 100, delay: 0.24 },
  { c: '#b84dff', x0: 0.2, x1: 1.3, y0: 0.5, y1: 0.5, w: 0.9, h: 1.5, blur: 100, delay: 0.32 },
]);
const leakStrobe: LibraryEntry['build'] = (f) => {
  const D = 1;
  return scene('Flicker leak', D, 'transition', f, [
    { type: 'ellipse', name: 'orange', x: f.w * 0.8, y: f.h * 0.3, w: f.w * 1.6, h: f.h, fill: '#ff8a2a', blur: 120, blend: 'screen', opacity: keys(k(0, 0), k(0.15, 0.9), k(0.22, 0.2), k(0.32, 1), k(0.4, 0.4), k(0.5, 1), k(0.62, 0.5), k(0.8, 0.9), k(D, 0)) },
    { type: 'ellipse', name: 'pink', x: f.w * 0.2, y: f.h * 0.7, w: f.w * 1.4, h: f.h * 0.9, fill: '#ff4f9a', blur: 120, blend: 'screen', opacity: keys(k(0.05, 0), k(0.2, 0.7), k(0.3, 0.1), k(0.42, 0.9), k(0.55, 0.3), k(0.7, 0.8), k(D, 0)) },
    full(f, 'pop', '#fff1d6', keys(k(0.3, 0), k(0.36, 0.6), k(0.44, 0), k(0.5, 0.7), k(0.6, 0)), { blend: 'screen' }),
  ]);
};

// ---- Backgrounds: solid colours (each its own layer), colour changes and trending animated looks. ----

const BG_LEN = 8;
const solid = (name: string, c: string): LibraryEntry['build'] => (f) => scene(name, BG_LEN, 'background', f, [], c);
const grad = (name: string, a: number, stops: [number, string][]): LibraryEntry['build'] => (f) => scene(name, BG_LEN, 'background', f, [
  full(f, 'gradient', '#000', 1, { fill: undefined, gradient: { angle: a, stops: stops.map(([p, c]) => ({ p, c })) } }),
]);
/** A full-frame colour that cross-fades through `cols`. */
const cycle = (name: string, cols: string[], D = 8): LibraryEntry['build'] => (f) => scene(name, D, 'background', f, [
  { type: 'rect', name: 'colour', x: f.w / 2, y: f.h / 2, w: f.w + 4, h: f.h + 4, fill: keys(...[...cols, cols[0]].map((c, i) => k((i / cols.length) * D, c, 'inOut'))) as SceneProp<string> },
]);

const aurora: LibraryEntry['build'] = (f) => scene('Aurora', 10, 'background', f, ['#34f5a5', '#3aa0ff', '#a855f7', '#22d3ee'].map((c, i): SceneNode => ({
  type: 'ellipse', name: `ribbon ${i + 1}`, w: f.w * 1.6, h: f.h * 0.35, rotation: keys(k(0, -25 + i * 12, 'inOut'), k(5, 20 - i * 10, 'inOut'), k(10, -25 + i * 12)), fill: c, blur: 120, blend: 'screen', opacity: 0.75,
  x: keys(k(0, f.w * (0.2 + i * 0.2), 'inOut'), k(5, f.w * (0.8 - i * 0.2), 'inOut'), k(10, f.w * (0.2 + i * 0.2))), y: keys(k(0, f.h * (0.2 + i * 0.18), 'inOut'), k(5, f.h * (0.7 - i * 0.14), 'inOut'), k(10, f.h * (0.2 + i * 0.18))),
})), '#050816');

const mesh: LibraryEntry['build'] = (f) => scene('Mesh gradient', 12, 'background', f, [['#ff5f8f', 0.2, 0.2], ['#ffb86b', 0.8, 0.25], ['#6a7bff', 0.3, 0.8], ['#4de3c1', 0.85, 0.8]].map(([c, x, y], i): SceneNode => ({
  type: 'ellipse', name: `blob ${i + 1}`, w: f.w * 1.1, h: f.w * 1.1, fill: c as string, blur: 150,
  x: keys(k(0, f.w * (x as number), 'inOut'), k(6, f.w * (1 - (x as number)), 'inOut'), k(12, f.w * (x as number))), y: keys(k(0, f.h * (y as number), 'inOut'), k(6, f.h * (1 - (y as number)), 'inOut'), k(12, f.h * (y as number))),
})), '#ffd1dc');

const lavaLamp: LibraryEntry['build'] = (f) => scene('Lava lamp', 10, 'background', f, Array.from({ length: 6 }, (_, i): SceneNode => {
  const x = f.w * (0.2 + rnd(i + 3) * 0.6), r = f.w * (0.35 + rnd(i + 8) * 0.25);
  return { type: 'ellipse', name: `blob ${i + 1}`, w: r, h: r, fill: ['#ff3d6e', '#ff9a3d', '#ffd23d'][i % 3], blur: 40, x: keys(k(0, x, 'inOut'), k(5, x + (rnd(i + 20) - 0.5) * f.w * 0.5, 'inOut'), k(10, x)), y: keys(k(0, f.h * (1.1 - (i % 3) * 0.2), 'inOut'), k(5, f.h * (0.1 + (i % 4) * 0.25), 'inOut'), k(10, f.h * (1.1 - (i % 3) * 0.2))), scaleY: keys(k(0, 1, 'inOut'), k(2.5 + i * 0.2, 1.35, 'inOut'), k(5, 0.85, 'inOut'), k(10, 1)) };
}), '#2a0a24');

const synthGrid: LibraryEntry['build'] = (f) => {
  const D = 4, hz = f.h * 0.55, vl = 9, hl = 10;
  const v: SceneNode[] = Array.from({ length: vl * 2 + 1 }, (_, i) => ({ type: 'line' as const, name: `v${i}`, x: f.w / 2, y: hz, x2: f.w / 2 + (i - vl) * f.w * 0.28, y2: f.h, stroke: '#ff3cf0', strokeWidth: 3, blend: 'lighter' as const, opacity: 0.8 }));
  const h: SceneNode[] = Array.from({ length: hl }, (_, i) => {
    const y0 = (i / hl) ** 2.2;
    return { type: 'line' as const, name: `h${i}`, x: 0, x2: f.w, y: keys(k(0, hz + (f.h - hz) * y0), k(D, hz + (f.h - hz) * (((i + 1) / hl) ** 2.2))), y2: keys(k(0, hz + (f.h - hz) * y0), k(D, hz + (f.h - hz) * (((i + 1) / hl) ** 2.2))), stroke: '#22d3ee', strokeWidth: 3, blend: 'lighter' as const, opacity: keys(k(0, y0 * 0.9), k(D, (((i + 1) / hl) ** 2.2) * 0.9)) };
  });
  return scene('Synthwave grid', D, 'background', f, [
    { type: 'rect', name: 'sky', x: f.w / 2, y: hz / 2, w: f.w + 4, h: hz, gradient: { angle: 180, stops: [{ p: 0, c: '#1b0a3a' }, { p: 1, c: '#ff3c8a' }] } },
    { type: 'ellipse', name: 'sun', x: f.w / 2, y: hz - 60, w: f.w * 0.55, h: f.w * 0.55, gradient: { angle: 180, stops: [{ p: 0, c: '#ffe14d' }, { p: 1, c: '#ff3c8a' }] }, blur: 2 },
    { type: 'rect', name: 'ground', x: f.w / 2, y: hz + (f.h - hz) / 2, w: f.w + 4, h: f.h - hz + 2, fill: '#0c0518' },
    ...v, ...h,
  ]);
};

const bokeh: LibraryEntry['build'] = (f) => scene('Bokeh', 12, 'background', f, Array.from({ length: 16 }, (_, i): SceneNode => {
  const r = 120 + rnd(i + 2) * 240, x = rnd(i + 30) * f.w;
  return { type: 'ellipse', name: `bokeh ${i + 1}`, w: r, h: r, fill: ['#ffd6a5', '#ffadad', '#bdb2ff', '#9bf6ff', '#fdffb6'][i % 5], blur: 22, blend: 'screen', x: keys(k(0, x, 'inOut'), k(6, x + (rnd(i + 50) - 0.5) * 260, 'inOut'), k(12, x)), y: keys(k(0, f.h * (0.1 + rnd(i + 70) * 0.9)), k(12, f.h * (rnd(i + 70) - 0.2))), opacity: keys(k(0, 0.25), k(3 + rnd(i) * 4, 0.7, 'inOut'), k(12, 0.25)) };
}), '#10122a');

const stars: LibraryEntry['build'] = (f) => scene('Starfield', 10, 'background', f, [
  ...Array.from({ length: 40 }, (_, i): SceneNode => {
    const s = 3 + rnd(i + 4) * 7;
    return { type: 'ellipse', name: `star ${i + 1}`, x: rnd(i + 1) * f.w, y: keys(k(0, rnd(i + 2) * f.h), k(10, rnd(i + 2) * f.h + 60 + s * 8)), w: s, h: s, fill: '#fff', blur: s > 7 ? 2 : 0, opacity: keys(k(0, 0.3), k(1 + rnd(i) * 3, 1, 'inOut'), k(5, 0.3, 'inOut'), k(7 + rnd(i) * 2, 1, 'inOut'), k(10, 0.3)) };
  }),
], '#050714');

const rings: LibraryEntry['build'] = (f, accent = '#7C3AED') => scene('Pulse rings', 4, 'background', f, [0, 1, 2, 3].map((i): SceneNode => ({
  type: 'ellipse', name: `ring ${i + 1}`, x: f.w / 2, y: f.h / 2, w: f.w * 0.5, h: f.w * 0.5, stroke: accent, strokeWidth: 8, blend: 'screen', scale: keys(k(i, 0.2, 'out'), k(i + 4, 3.4)), opacity: keys(k(i, 0.9), k(i + 4, 0)),
})), '#0b0716');

const waves: LibraryEntry['build'] = (f) => scene('Soft waves', 8, 'background', f, [['#7dd3fc', 0.55, 0], ['#38bdf8', 0.65, 1], ['#2563eb', 0.78, 2]].map(([c, y, i], j): SceneNode => ({
  type: 'ellipse', name: `wave ${j + 1}`, w: f.w * 2.2, h: f.h * 0.5, fill: c as string, opacity: 0.85, x: keys(k(0, f.w * (0.2 + (i as number) * 0.3), 'inOut'), k(4, f.w * (0.8 - (i as number) * 0.3), 'inOut'), k(8, f.w * (0.2 + (i as number) * 0.3))), y: keys(k(0, f.h * (y as number), 'inOut'), k(4, f.h * ((y as number) + 0.04), 'inOut'), k(8, f.h * (y as number))),
})), '#e0f2fe');

const halftone: LibraryEntry['build'] = (f, accent = '#ff3c8a') => {
  const cols = 9, cell = f.w / cols, rows = Math.ceil(f.h / cell) + 1, nodes: SceneNode[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const d = (r + c) * 0.12;
    nodes.push({ type: 'ellipse', name: `dot ${r}-${c}`, x: c * cell + cell / 2, y: r * cell + cell / 2, w: cell * 0.9, h: cell * 0.9, fill: accent, scale: keys(k(0, 0.15 + (r / rows) * 0.2, 'inOut'), k(1.5 + d * 0.3, 1, 'inOut'), k(3, 0.15 + (r / rows) * 0.2)) });
  }
  return scene('Halftone pop', 3, 'background', f, nodes, '#fff3f8');
};

const checker: LibraryEntry['build'] = (f, accent = '#18D2FF') => {
  const n = 6, cell = f.w / n, rows = Math.ceil(f.h / cell) + 2, D = 2, nodes: SceneNode[] = [];
  for (let r = -1; r < rows; r++) for (let c = 0; c < n; c++) {
    if ((r + c) % 2) continue;
    nodes.push({ type: 'rect', name: `tile ${r}-${c}`, x: c * cell + cell / 2, y: keys(k(0, r * cell + cell / 2), k(D, (r + 1) * cell + cell / 2)), w: cell, h: cell, fill: accent, opacity: 0.9 });
  }
  return scene('Scrolling checker', D, 'background', f, nodes, '#0b1f2a');
};

const spotlight: LibraryEntry['build'] = (f) => scene('Spotlight', 6, 'background', f, [
  { type: 'ellipse', name: 'beam', x: keys(k(0, f.w * 0.3, 'inOut'), k(3, f.w * 0.7, 'inOut'), k(6, f.w * 0.3)), y: f.h * 0.5, w: f.w * 0.9, h: f.h * 1.3, fill: '#ffffff', blur: 140, opacity: 0.35, blend: 'screen' },
  { type: 'ellipse', name: 'beam 2', x: keys(k(0, f.w * 0.75, 'inOut'), k(3, f.w * 0.25, 'inOut'), k(6, f.w * 0.75)), y: f.h * 0.55, w: f.w * 0.7, h: f.h * 1.1, fill: '#7c8cff', blur: 150, opacity: 0.3, blend: 'screen' },
], '#06070d');

const ripple: LibraryEntry['build'] = (f) => scene('Liquid ripple', 8, 'background', f, [['#ff6ec7', 0.3], ['#7873f5', 0.55], ['#4adede', 0.8]].map(([c, y], i): SceneNode => ({
  type: 'rect', name: `layer ${i + 1}`, x: f.w / 2, y: f.h * (y as number), w: f.w * 1.3, h: f.h * 0.6, fill: c as string, radius: 400, rotation: keys(k(0, -6 + i * 5, 'inOut'), k(4, 6 - i * 5, 'inOut'), k(8, -6 + i * 5)), scaleY: keys(k(0, 1, 'inOut'), k(4, 1.25, 'inOut'), k(8, 1)), blur: 14, opacity: 0.9,
})), '#1a1030');

const vignetteWarm: LibraryEntry['build'] = (f) => scene('Film vignette', 6, 'background', f, [
  full(f, 'tone', '#2b1d16', 1),
  { type: 'ellipse', name: 'light', x: f.w / 2, y: f.h * 0.45, w: f.w * 1.3, h: f.h * 0.9, fill: '#ffb066', blur: 160, opacity: keys(k(0, 0.5), k(3, 0.75, 'inOut'), k(6, 0.5)), blend: 'screen' },
]);

const SOLIDS: [string, string][] = [['Black', '#000000'], ['White', '#ffffff'], ['Charcoal', '#1c1c1f'], ['Red', '#ef4444'], ['Orange', '#f97316'], ['Yellow', '#facc15'], ['Green', '#22c55e'], ['Teal', '#14b8a6'], ['Blue', '#3b82f6'], ['Indigo', '#6366f1'], ['Purple', '#a855f7'], ['Pink', '#ec4899'], ['Cream', '#fff4e0'], ['Sky', '#bae6fd'], ['Mint', '#bbf7d0'], ['Lavender', '#ddd6fe']];
const BG_ENTRIES: LibraryEntry[] = [
  ...SOLIDS.map(([n, c]): LibraryEntry => ({ id: `solid-${n.toLowerCase()}`, name: n, role: 'background', note: 'Solid colour', build: solid(n, c) })),
  { id: 'bg-cycle-pop', name: 'Colour change', role: 'background', note: 'Solid colour that changes', build: cycle('Colour change', ['#ff5f8f', '#ffb86b', '#4de3c1', '#6a7bff']) },
  { id: 'bg-cycle-pastel', name: 'Pastel change', role: 'background', note: 'Soft colour change', build: cycle('Pastel change', ['#ffd1dc', '#c7f0d8', '#cfe3ff', '#fff3b0'], 10) },
  { id: 'bg-cycle-neon', name: 'Neon change', role: 'background', note: 'Neon colour change', build: cycle('Neon change', ['#ff2bd6', '#22d3ee', '#7cff4d', '#ffe14d'], 6) },
  { id: 'bg-cycle-beat', name: 'Beat flash', role: 'background', note: 'Hard colour cuts', build: (f) => scene('Beat flash', 4, 'background', f, [{ type: 'rect', name: 'colour', x: f.w / 2, y: f.h / 2, w: f.w + 4, h: f.h + 4, fill: keys(k(0, '#ff3d6e', 'linear'), k(0.99, '#ff3d6e', 'linear'), k(1, '#ffd23d', 'linear'), k(1.99, '#ffd23d', 'linear'), k(2, '#3dd6ff', 'linear'), k(2.99, '#3dd6ff', 'linear'), k(3, '#8b5cf6', 'linear'), k(4, '#8b5cf6', 'linear')) as SceneProp<string> }]) },
  { id: 'bg-sunset', name: 'Sunset gradient', role: 'background', note: 'Peach to violet', build: grad('Sunset gradient', 160, [[0, '#ffb26b'], [0.5, '#ff5f8f'], [1, '#5b3df5']]) },
  { id: 'bg-ocean', name: 'Ocean gradient', role: 'background', note: 'Teal to deep blue', build: grad('Ocean gradient', 160, [[0, '#2dd4bf'], [1, '#1e3a8a']]) },
  { id: 'bg-peach', name: 'Peach gradient', role: 'background', note: 'Soft warm blend', build: grad('Peach gradient', 135, [[0, '#ffecd2'], [1, '#fcb69f']]) },
  { id: 'bg-night', name: 'Night gradient', role: 'background', note: 'Dark blue to black', build: grad('Night gradient', 180, [[0, '#1b2a5a'], [1, '#05060d']]) },
  { id: 'bg-aurora', name: 'Aurora', role: 'background', note: 'Northern lights ribbons', build: aurora },
  { id: 'bg-mesh', name: 'Mesh gradient', role: 'background', note: 'Soft moving colour mesh', build: mesh },
  { id: 'bg-lava', name: 'Lava lamp', role: 'background', note: 'Rising warm blobs', build: lavaLamp },
  { id: 'bg-synth', name: 'Synthwave grid', role: 'background', note: 'Retro sun and neon grid', build: synthGrid },
  { id: 'bg-bokeh', name: 'Bokeh', role: 'background', note: 'Floating soft lights', build: bokeh },
  { id: 'bg-stars', name: 'Starfield', role: 'background', note: 'Twinkling night sky', build: stars },
  { id: 'bg-rings', name: 'Pulse rings', role: 'background', note: 'Rings pulse outward', build: rings },
  { id: 'bg-waves', name: 'Soft waves', role: 'background', note: 'Layered blue waves', build: waves },
  { id: 'bg-halftone', name: 'Halftone pop', role: 'background', note: 'Pulsing dot grid', build: halftone },
  { id: 'bg-checker', name: 'Scrolling checker', role: 'background', note: 'Moving checkerboard', build: checker },
  { id: 'bg-spotlight', name: 'Spotlight', role: 'background', note: 'Sweeping stage lights', build: spotlight },
  { id: 'bg-ripple', name: 'Liquid ripple', role: 'background', note: 'Wobbling colour layers', build: ripple },
  { id: 'bg-film', name: 'Film vignette', role: 'background', note: 'Warm cinematic glow', build: vignetteWarm },
];

export const MOTION_LIBRARY: LibraryEntry[] = [
  { id: 'lower-third', name: 'Lower third', role: 'graphic', note: 'Name and role on a sliding plate', build: lowerThird },
  { id: 'title-pop', name: 'Title pop', role: 'graphic', note: 'Big title that pops in with an underline', build: titleCard },
  { id: 'ring-burst', name: 'Ring burst', role: 'graphic', note: 'Expanding rings from the centre', build: burst },
  { id: 'colour-wipe', name: 'Colour wipe', role: 'transition', note: 'A colour sweeps across and away', build: wipe },
  { id: 'flash-cut', name: 'Flash cut', role: 'transition', note: 'A quick white flash', build: flash },
  { id: 'slat-wipe', name: 'Slat wipe', role: 'transition', note: 'Bars close and open', build: slats },
  { id: 'circle-reveal', name: 'Circle reveal', role: 'transition', note: 'A disc grows to cover, then shrinks away', build: circle },
  { id: 'fire-wipe', name: 'Fire wipe', role: 'transition', note: 'Flames sweep up and burn the cut', build: fireWipe },
  { id: 'lens-flare', name: 'Lens flare', role: 'transition', note: 'A flare crosses the frame', build: lensFlare },
  { id: 'light-leak', name: 'Light leak', role: 'transition', note: 'Warm film light washes over', build: lightLeak },
  { id: 'leak-sunset', name: 'Sunset leak', role: 'transition', note: 'Red and amber sunset light', build: leakSunset },
  { id: 'leak-golden', name: 'Golden hour', role: 'transition', note: 'Warm light from above', build: leakGolden },
  { id: 'leak-candy', name: 'Candy leak', role: 'transition', note: 'Pink, violet and cyan', build: leakCandy },
  { id: 'leak-ember', name: 'Ember glow', role: 'transition', note: 'Heat rising from below', build: leakEmber },
  { id: 'leak-ice', name: 'Ice leak', role: 'transition', note: 'Cool blue light', build: leakIce },
  { id: 'leak-edge', name: 'Edge flare', role: 'transition', note: 'Light bleeds from both edges', build: leakEdge },
  { id: 'leak-rainbow', name: 'Rainbow leak', role: 'transition', note: 'Spectrum sweeps across', build: leakRainbow },
  { id: 'leak-flicker', name: 'Flicker leak', role: 'transition', note: 'Flickering film light', build: leakStrobe },
  { id: 'film-burn', name: 'Film burn', role: 'transition', note: 'Orange film burn', build: filmBurn },
  { id: 'spark-burst', name: 'Spark burst', role: 'transition', note: 'Sparks fly from the centre', build: sparkBurst },
  { id: 'glitch-slices', name: 'Glitch slices', role: 'transition', note: 'Cyan and magenta tearing', build: glitchSlices },
  { id: 'camera-shutter', name: 'Camera shutter', role: 'transition', note: 'Shutter snaps with a flash', build: shutter },
  { id: 'diamond-wipe', name: 'Diamond wipe', role: 'transition', note: 'A diamond grows and shrinks', build: diamond },
  { id: 'ink-drop', name: 'Ink drop', role: 'transition', note: 'Ink blots cover the frame', build: inkDrop },
  { id: 'speed-streaks', name: 'Speed streaks', role: 'transition', note: 'Fast light streaks', build: speedStreaks },
  { id: 'neon-sweep', name: 'Neon sweep', role: 'transition', note: 'Pink and cyan neon beam', build: neonSweep },
  { id: 'pixel-dissolve', name: 'Pixel dissolve', role: 'transition', note: 'Blocks pop in and out', build: pixelDissolve },
  { id: 'shockwave', name: 'Shockwave', role: 'transition', note: 'Rings blast outward', build: shockwave },
  { id: 'diagonal-bands', name: 'Diagonal bands', role: 'transition', note: 'Colour bands sweep', build: stripes },
  { id: 'zoom-punch', name: 'Zoom punch', role: 'transition', note: 'Tunnel zoom with a white pop', build: zoomPunch },
  { id: 'confetti-pop', name: 'Confetti pop', role: 'graphic', note: 'Confetti bursts and falls', build: confetti },
  { id: 'sparkle-shower', name: 'Sparkle shower', role: 'graphic', note: 'Twinkling stars', build: sparkleShower },
  { id: 'speed-lines', name: 'Speed lines', role: 'graphic', note: 'Anime-style focus lines', build: speedLines },
  { id: 'countdown', name: 'Countdown 3-2-1', role: 'graphic', note: 'Big 3, 2, 1', build: countdown },
  { id: 'glow-bg', name: 'Glow background', role: 'background', note: 'Drifting colour orbs on dark', build: glow },
  ...BG_ENTRIES,
];
