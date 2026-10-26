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

export const MOTION_LIBRARY: LibraryEntry[] = [
  { id: 'lower-third', name: 'Lower third', role: 'graphic', note: 'Name and role on a sliding plate', build: lowerThird },
  { id: 'title-pop', name: 'Title pop', role: 'graphic', note: 'Big title that pops in with an underline', build: titleCard },
  { id: 'ring-burst', name: 'Ring burst', role: 'graphic', note: 'Expanding rings from the centre', build: burst },
  { id: 'colour-wipe', name: 'Colour wipe', role: 'transition', note: 'A colour sweeps across and away', build: wipe },
  { id: 'flash-cut', name: 'Flash cut', role: 'transition', note: 'A quick white flash', build: flash },
  { id: 'slat-wipe', name: 'Slat wipe', role: 'transition', note: 'Bars close and open', build: slats },
  { id: 'circle-reveal', name: 'Circle reveal', role: 'transition', note: 'A disc grows to cover, then shrinks away', build: circle },
  { id: 'glow-bg', name: 'Glow background', role: 'background', note: 'Drifting colour orbs on dark', build: glow },
];
