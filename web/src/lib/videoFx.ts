import { nanoid } from 'nanoid';
import type { Ease, EffectInstance, LaneState, MatteSettings, Project, RegionBlur, TransitionId, VideoFilters, VideoKeyframe, VideoLayer } from '../types';

export const NEUTRAL_FILTERS: VideoFilters = { brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0, grayscale: 0, sepia: 0, vignette: 0 };

export const DEFAULT_VIDEO: VideoLayer = {
  filters: NEUTRAL_FILTERS,
  presetId: null,
  transitionIn: { id: 'none', duration: 0.5 },
  transitionOut: { id: 'none', duration: 0.5 },
  keyframes: [],
  effects: [],
  speed: 1,
  hidden: false,
  presetStrength: 100,
  crop: { l: 0, t: 0, r: 0, b: 0 },
  flipH: false,
  flipV: false,
  rot90: 0,
  base: { scale: 1, x: 0, y: 0, rotation: 0, opacity: 1 },
};

const F = (id: string, label: string, filters: Partial<VideoFilters>) => ({ id, label, filters });
export const FILTER_PRESETS = [
  F('none', 'Original', {}),
  F('vivid', 'Vivid', { saturate: 140, contrast: 110 }),
  F('vividWarm', 'Vivid Warm', { saturate: 135, contrast: 108, sepia: 15, brightness: 103 }),
  F('warm', 'Warm', { sepia: 25, saturate: 115, brightness: 104 }),
  F('goldenHour', 'Golden Hour', { sepia: 40, saturate: 130, brightness: 106, contrast: 105, hue: 345 }),
  F('sunset', 'Sunset', { sepia: 35, saturate: 150, hue: 330, contrast: 108, vignette: 20 }),
  F('sunrise', 'Sunrise', { sepia: 20, saturate: 125, hue: 350, brightness: 108 }),
  F('cool', 'Cool', { hue: 190, saturate: 90, brightness: 102, sepia: 12 }),
  F('arctic', 'Arctic', { hue: 200, saturate: 80, brightness: 110, contrast: 105, sepia: 8 }),
  F('teal', 'Teal', { hue: 170, saturate: 120, contrast: 110, sepia: 20 }),
  F('ocean', 'Ocean', { hue: 185, saturate: 130, brightness: 98, contrast: 108 }),
  F('cinema', 'Cinema', { contrast: 125, saturate: 85, brightness: 94, vignette: 45 }),
  F('cinemaTeal', 'Cinema Teal', { contrast: 120, saturate: 95, hue: 175, sepia: 18, brightness: 95, vignette: 40 }),
  F('drama', 'Drama', { contrast: 140, saturate: 90, brightness: 92, vignette: 55 }),
  F('moody', 'Moody', { contrast: 115, saturate: 70, brightness: 90, vignette: 40 }),
  F('darkMoody', 'Dark Moody', { contrast: 125, saturate: 60, brightness: 80, vignette: 55 }),
  F('fade', 'Faded', { contrast: 85, brightness: 108, saturate: 80 }),
  F('matte', 'Matte', { contrast: 88, brightness: 106, saturate: 85, sepia: 8 }),
  F('washed', 'Washed', { contrast: 80, brightness: 115, saturate: 60 }),
  F('noir', 'Noir', { grayscale: 100, contrast: 135, vignette: 35 }),
  F('silver', 'Silver', { grayscale: 100, contrast: 110, brightness: 108 }),
  F('filmGray', 'Film Gray', { grayscale: 90, contrast: 118, brightness: 98, vignette: 25 }),
  F('vintage', 'Vintage', { sepia: 55, contrast: 95, saturate: 90, vignette: 30 }),
  F('retro70', 'Retro 70s', { sepia: 45, saturate: 140, hue: 340, contrast: 95, brightness: 105 }),
  F('polaroid', 'Polaroid', { sepia: 25, contrast: 90, saturate: 110, brightness: 108, vignette: 20 }),
  F('sepia', 'Sepia', { sepia: 100 }),
  F('coffee', 'Coffee', { sepia: 70, brightness: 92, contrast: 112 }),
  F('dream', 'Dream', { blur: 2, brightness: 110, saturate: 120 }),
  F('softGlow', 'Soft Glow', { blur: 1, brightness: 108, contrast: 92, saturate: 110 }),
  F('pop', 'Pop', { saturate: 170, contrast: 115, brightness: 104 }),
  F('pastel', 'Pastel', { saturate: 75, brightness: 114, contrast: 88 }),
  F('airy', 'Bright & Airy', { brightness: 118, contrast: 90, saturate: 95 }),
  F('highContrast', 'High Contrast', { contrast: 150, saturate: 110 }),
  F('lowContrast', 'Low Contrast', { contrast: 75, brightness: 105 }),
  F('hdr', 'HDR', { contrast: 135, saturate: 130, brightness: 98, vignette: 10 }),
  F('chrome', 'Chrome', { contrast: 130, saturate: 70, brightness: 104, grayscale: 25 }),
  F('cyber', 'Cyber', { hue: 280, saturate: 160, contrast: 120, brightness: 96 }),
  F('neonNight', 'Neon Night', { hue: 300, saturate: 190, contrast: 130, brightness: 88, vignette: 35 }),
  F('forest', 'Forest', { hue: 70, saturate: 125, contrast: 108, brightness: 96, sepia: 10 }),
  F('spring', 'Spring', { hue: 20, saturate: 125, brightness: 110, contrast: 95 }),
  F('autumn', 'Autumn', { sepia: 45, hue: 335, saturate: 145, contrast: 105 }),
  F('rose', 'Rose', { hue: 335, saturate: 110, brightness: 108, sepia: 15 }),
  F('lavender', 'Lavender', { hue: 255, saturate: 95, brightness: 108, sepia: 10 }),
  F('mint', 'Mint', { hue: 130, saturate: 90, brightness: 110, contrast: 92 }),
  F('sakura', 'Sakura', { hue: 340, saturate: 85, brightness: 115, contrast: 90, blur: 1 }),
  F('cleanGirl', 'Clean Girl', { brightness: 108, contrast: 92, saturate: 90, sepia: 8 }),
  F('y2k', 'Y2K', { hue: 330, saturate: 150, contrast: 118, brightness: 105, blur: 0.6 }),
  F('vhs90s', '90s VHS', { sepia: 25, saturate: 130, contrast: 110, hue: 350, blur: 0.8, vignette: 25 }),
  F('kodak', 'Kodak Gold', { sepia: 22, saturate: 125, contrast: 108, brightness: 104, hue: 352 }),
  F('ccd', 'CCD Camera', { contrast: 112, saturate: 115, brightness: 106, sepia: 12, hue: 8 }),
  F('dreamy', 'Dreamy', { blur: 1.5, brightness: 112, saturate: 115, contrast: 90 }),
  F('bleach', 'Bleach Bypass', { contrast: 135, saturate: 55 }),
  F('blockbuster', 'Blockbuster', { contrast: 125, saturate: 120, hue: 355, sepia: 15, vignette: 30 }),
  F('softPeach', 'Soft Peach', { hue: 355, saturate: 105, brightness: 110, sepia: 18, contrast: 92 }),
  F('cottagecore', 'Cottagecore', { sepia: 20, hue: 15, saturate: 95, brightness: 110, contrast: 90 }),
  F('darkAcademia', 'Dark Academia', { sepia: 40, contrast: 118, saturate: 70, brightness: 88, vignette: 45 }),
  F('nightCity', 'Night City', { hue: 215, saturate: 130, contrast: 125, brightness: 88, vignette: 35 }),
  F('summer', 'Summer Vibes', { saturate: 150, brightness: 108, hue: 5, contrast: 108 }),
  F('iceBlue', 'Ice Blue', { hue: 205, saturate: 110, brightness: 108, contrast: 105 }),
  F('inkBW', 'Ink B&W', { grayscale: 100, contrast: 160, brightness: 95 }),
  F('cyberpunk', 'Cyberpunk', { hue: 285, saturate: 200, contrast: 125, brightness: 92, vignette: 30 }),
  F('pinkPop', 'Pink Pop', { hue: 320, saturate: 160, brightness: 108 }),
  F('matcha', 'Matcha', { hue: 85, saturate: 90, brightness: 106, contrast: 95, sepia: 15 }),
  F('lofi', 'Lo-fi', { contrast: 90, saturate: 80, sepia: 20, blur: 0.5, vignette: 25 }),
];

export const TRANSITIONS: { id: TransitionId; label: string }[] = [
  { id: 'none', label: 'None' }, { id: 'fade', label: 'Fade' }, { id: 'flash', label: 'Flash' },
  { id: 'zoomIn', label: 'Zoom in' }, { id: 'zoomOut', label: 'Zoom out' },
  { id: 'slideLeft', label: 'Slide left' }, { id: 'slideRight', label: 'Slide right' }, { id: 'slideUp', label: 'Slide up' }, { id: 'slideDown', label: 'Slide down' },
  { id: 'blur', label: 'Blur' }, { id: 'spin', label: 'Spin' }, { id: 'spinZoom', label: 'Spin zoom' }, { id: 'bounce', label: 'Bounce' }, { id: 'shake', label: 'Shake' },
  { id: 'whipLeft', label: 'Whip pan left' }, { id: 'whipRight', label: 'Whip pan right' }, { id: 'whipUp', label: 'Whip pan up' }, { id: 'whipDown', label: 'Whip pan down' },
  { id: 'zoomBlur', label: 'Zoom blur' }, { id: 'pushZoom', label: 'Push zoom' }, { id: 'dolly', label: 'Dolly' }, { id: 'swirl', label: 'Swirl' },
  { id: 'rollLeft', label: 'Roll left' }, { id: 'rollRight', label: 'Roll right' }, { id: 'tiltDrop', label: 'Tilt drop' },
  { id: 'rgbShift', label: 'RGB shift' }, { id: 'pulse', label: 'Beat pulse' }, { id: 'strobe', label: 'Strobe' }, { id: 'jumpCut', label: 'Jump cut' },
  { id: 'filmBurn', label: 'Film burn' }, { id: 'whiteOut', label: 'White out' }, { id: 'blackOut', label: 'Black out' },
  { id: 'irisOpen', label: 'Iris open' }, { id: 'barnDoor', label: 'Barn door' },
  { id: 'wipeLeft', label: 'Wipe left' }, { id: 'wipeRight', label: 'Wipe right' }, { id: 'wipeUp', label: 'Wipe up' }, { id: 'wipeDown', label: 'Wipe down' },
  { id: 'circle', label: 'Circle' }, { id: 'flip', label: 'Flip' }, { id: 'glitch', label: 'Glitch' },
];

export const EASES: { id: Ease; label: string }[] = [
  { id: 'linear', label: 'Linear' }, { id: 'easeIn', label: 'Ease in' }, { id: 'easeOut', label: 'Ease out' },
  { id: 'easeInOut', label: 'Ease in-out' }, { id: 'hold', label: 'Hold' },
];

export const DEFAULT_MATTE: MatteSettings = {
  mode: 'none', keyColor: '#00FF00', similarity: 40, smoothness: 12, spill: 50,
  edge: 1, shift: -2, threshold: 50, invert: false, background: 'transparent', bgColor: '#000000', bgBlur: 24,
};

export const newRegionBlur = (): RegionBlur => ({ id: nanoid(6), shape: 'ellipse', look: 'blur', x: 50, y: 40, w: 30, h: 22, amount: 28, feather: 30, invert: false });

export const hasMatte = (l?: Pick<VideoLayer, 'matte'>) => !!l?.matte && l.matte.mode !== 'none';

export const migrateVideo = (v?: Partial<VideoLayer>): VideoLayer => ({
  ...DEFAULT_VIDEO, ...v,
  filters: { ...NEUTRAL_FILTERS, ...v?.filters },
  transitionIn: { ...DEFAULT_VIDEO.transitionIn, ...v?.transitionIn },
  transitionOut: { ...DEFAULT_VIDEO.transitionOut, ...v?.transitionOut },
  keyframes: v?.keyframes ?? [],
  effects: v?.effects ?? [],
  crop: { ...DEFAULT_VIDEO.crop!, ...v?.crop },
  base: { ...DEFAULT_VIDEO.base!, ...v?.base },
  matte: v?.matte ? { ...DEFAULT_MATTE, ...v.matte } : undefined,
  regionBlurs: v?.regionBlurs ?? undefined,
});

/** A preset applied at `strength` (0..100): each slider moves that far from neutral toward the preset. */
export function blendFilters(preset: Partial<VideoFilters>, strength: number): VideoFilters {
  const k = Math.max(0, Math.min(1, strength / 100));
  const out = { ...NEUTRAL_FILTERS };
  for (const key of Object.keys(NEUTRAL_FILTERS) as (keyof VideoFilters)[]) {
    const to = preset[key] ?? NEUTRAL_FILTERS[key];
    out[key] = Math.round((NEUTRAL_FILTERS[key] + (to - NEUTRAL_FILTERS[key]) * k) * 10) / 10;
  }
  return out;
}

/** Does the clip carry its own filter, effect, transition, crop or transform? */
export function hasClipFx(fx?: VideoLayer): boolean {
  if (!fx) return false;
  const l = migrateVideo(fx);
  return l.effects.length > 0 || !isNeutral(l.filters) || l.transitionIn.id !== 'none' || l.transitionOut.id !== 'none' || hasCrop(l.crop) || !!l.rot90 || !!l.flipH || !!l.flipV || hasMatte(l) || !!l.regionBlurs?.length;
}

export const hasCrop = (c?: { l: number; t: number; r: number; b: number }) => !!c && (c.l > 0 || c.t > 0 || c.r > 0 || c.b > 0);

/** Symmetric crop that gives the visible region the aspect w:h, for a source of vw x vh. */
export function cropForAspect(vw: number, vh: number, w: number, h: number) {
  const want = w / h, have = vw / vh;
  if (Math.abs(want - have) < 1e-3) return { l: 0, t: 0, r: 0, b: 0 };
  if (want < have) { const side = ((1 - want / have) / 2) * 100; return { l: side, r: side, t: 0, b: 0 }; }
  const side = ((1 - have / want) / 2) * 100;
  return { l: 0, r: 0, t: side, b: side };
}

const NO_LANE: LaneState = {};
export const laneOf = (p: Pick<Project, 'lanes'>, key: string): LaneState => p.lanes?.[key] ?? NO_LANE;

export function applyEase(e: Ease, u: number): number {
  switch (e) {
    case 'easeIn': return u * u;
    case 'easeOut': return 1 - (1 - u) * (1 - u);
    case 'easeInOut': return u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
    case 'hold': return 0;
    default: return u;
  }
}

export interface Transform { scale: number; x: number; y: number; rotation: number; opacity: number }
export const IDENTITY: Transform = { scale: 1, x: 0, y: 0, rotation: 0, opacity: 1 };

/** Keyframed transform at time t. Before the first / after the last keyframe the value holds. */
export function transformAt(kfs: VideoKeyframe[], t: number, base: Transform = IDENTITY): Transform {
  if (!kfs.length) return base;
  const ks = [...kfs].sort((a, b) => a.t - b.t);
  if (t <= ks[0].t) return ks[0];
  const last = ks[ks.length - 1];
  if (t >= last.t) return last;
  let i = 0;
  while (ks[i + 1].t < t) i++;
  const a = ks[i], b = ks[i + 1];
  const u = applyEase(a.ease, (t - a.t) / Math.max(1e-6, b.t - a.t));
  const mix = (p: number, q: number) => p + (q - p) * u;
  return { scale: mix(a.scale, b.scale), x: mix(a.x, b.x), y: mix(a.y, b.y), rotation: mix(a.rotation, b.rotation), opacity: mix(a.opacity, b.opacity) };
}

export const newKeyframe = (t: number, from: Transform): VideoKeyframe => ({ id: nanoid(8), t, ...from, ease: 'easeInOut' });
export const newEffect = (effectId: string): EffectInstance => ({ id: nanoid(8), effectId, intensity: 0.6 });

export const isNeutral = (f: VideoFilters) => (Object.keys(NEUTRAL_FILTERS) as (keyof VideoFilters)[]).every((k) => f[k] === NEUTRAL_FILTERS[k]);

/** CSS filter string for ctx.filter and for tile thumbnails. `scale` converts the 1080-wide blur radius to the output width. */
export function cssFilter(f: VideoFilters, scale: number): string {
  const parts: string[] = [];
  if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
  if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
  if (f.saturate !== 100) parts.push(`saturate(${f.saturate}%)`);
  if (f.hue) parts.push(`hue-rotate(${f.hue}deg)`);
  if (f.grayscale) parts.push(`grayscale(${f.grayscale}%)`);
  if (f.sepia) parts.push(`sepia(${f.sepia}%)`);
  if (f.blur) parts.push(`blur(${(f.blur * scale).toFixed(2)}px)`);
  return parts.join(' ') || 'none';
}

export interface TransitionState {
  alpha: number; scale: number; sx: number; dx: number; dy: number; rot: number; blur: number; flash: number;
  /** Flash colour as 'r,g,b' (default white). */
  flashColor: string;
  /** RGB-split strength, as an effect intensity. */
  split: number;
  /** Reveal region: wipe from an edge or a growing circle. p = 0..1 revealed. */
  clip: { kind: 'l' | 'r' | 'u' | 'd' | 'h' | 'circle'; p: number } | null;
}

const easeOutBack = (u: number) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };

/** In/out transition at time t. dir: 1 = entering, -1 = leaving. */
export function transitionAt(v: VideoLayer, t: number, duration: number): TransitionState {
  const s: TransitionState = { alpha: 1, scale: 1, sx: 1, dx: 0, dy: 0, rot: 0, blur: 0, flash: 0, flashColor: '255,255,255', split: 0, clip: null };
  const apply = (id: TransitionId, p: number, dir: 1 | -1) => { // p: 0 = at the cut (hidden), 1 = settled
    const q = 1 - p;
    switch (id) {
      case 'fade': s.alpha *= p; break;
      case 'flash': s.flash = Math.max(s.flash, q); s.alpha *= 1 - q * 0.3; break;
      case 'zoomIn': s.scale *= 1 + 0.5 * q; s.alpha *= p; break;
      case 'zoomOut': s.scale *= 1 - 0.5 * q; s.alpha *= p; break;
      case 'slideLeft': s.dx += dir * q; break;
      case 'slideRight': s.dx -= dir * q; break;
      case 'slideUp': s.dy += dir * q; break;
      case 'slideDown': s.dy -= dir * q; break;
      case 'blur': s.blur = Math.max(s.blur, q * 24); s.alpha *= 0.4 + 0.6 * p; break;
      case 'spin': s.rot += dir * q * 180; s.alpha *= p; break;
      case 'spinZoom': s.rot += dir * q * 120; s.scale *= p; s.alpha *= p; break;
      case 'bounce': s.scale *= Math.max(0, easeOutBack(p)); break;
      case 'shake': s.dx += Math.sin(p * 60) * 0.04 * q; s.dy += Math.cos(p * 47) * 0.02 * q; s.alpha *= 0.3 + 0.7 * p; break;
      case 'whipLeft': s.dx += dir * q * 0.85; s.blur = Math.max(s.blur, q * 22); s.alpha *= 0.5 + 0.5 * p; break;
      case 'whipRight': s.dx -= dir * q * 0.85; s.blur = Math.max(s.blur, q * 22); s.alpha *= 0.5 + 0.5 * p; break;
      case 'whipUp': s.dy += dir * q * 0.85; s.blur = Math.max(s.blur, q * 22); s.alpha *= 0.5 + 0.5 * p; break;
      case 'whipDown': s.dy -= dir * q * 0.85; s.blur = Math.max(s.blur, q * 22); s.alpha *= 0.5 + 0.5 * p; break;
      case 'zoomBlur': s.scale *= 1 + 1.2 * q; s.blur = Math.max(s.blur, q * 18); s.alpha *= Math.sqrt(p); break;
      case 'pushZoom': s.scale *= 0.7 + 0.3 * p; s.blur = Math.max(s.blur, q * 8); s.alpha *= p; break;
      case 'dolly': s.scale *= 1.35 - 0.35 * p; s.dy += dir * q * 0.05; s.alpha *= p; break;
      case 'swirl': s.rot += dir * q * 540; s.scale *= p; s.blur = Math.max(s.blur, q * 10); s.alpha *= p; break;
      case 'rollLeft': s.rot += dir * q * 45; s.dx += dir * q * 0.5; s.alpha *= p; break;
      case 'rollRight': s.rot -= dir * q * 45; s.dx -= dir * q * 0.5; s.alpha *= p; break;
      case 'tiltDrop': { const pp = easeOutBack(p); s.dy -= dir * (1 - pp) * 0.5; s.rot -= dir * (1 - pp) * 12; s.alpha *= Math.min(1, p * 3); break; }
      case 'rgbShift': s.split = Math.max(s.split, q * 3); s.dx += Math.sin(p * 55) * 0.02 * q; s.alpha *= 0.5 + 0.5 * p; break;
      case 'pulse': s.scale *= 1 + 0.2 * q * Math.abs(Math.sin(p * 14)); s.flash = Math.max(s.flash, q * 0.25); break;
      case 'strobe': s.alpha *= q > 0 && Math.sin(p * 80) <= 0 ? 0.15 : 1; s.flash = Math.max(s.flash, q * 0.3); break;
      case 'jumpCut': s.scale *= 1 + Math.ceil(q * 3) / 3 * 0.15; break;
      case 'filmBurn': s.flash = Math.max(s.flash, q); s.flashColor = '255,120,30'; s.alpha *= 0.4 + 0.6 * p; s.scale *= 1 + 0.05 * q; break;
      case 'whiteOut': s.flash = Math.max(s.flash, Math.min(1, q * 1.6)); break;
      case 'blackOut': s.flash = Math.max(s.flash, Math.min(1, q * 1.6)); s.flashColor = '0,0,0'; break;
      case 'irisOpen': s.clip = { kind: 'circle', p: Math.pow(p, 0.8) }; s.scale *= 1 + 0.2 * q; break;
      case 'barnDoor': s.clip = { kind: 'h', p }; break;
      case 'wipeLeft': s.clip = { kind: 'l', p }; break;
      case 'wipeRight': s.clip = { kind: 'r', p }; break;
      case 'wipeUp': s.clip = { kind: 'u', p }; break;
      case 'wipeDown': s.clip = { kind: 'd', p }; break;
      case 'circle': s.clip = { kind: 'circle', p }; break;
      case 'flip': s.sx *= Math.max(0.001, Math.abs(Math.cos((1 - p) * Math.PI / 2))); break;
      case 'glitch': s.dx += (Math.sin(p * 90) > 0 ? 1 : -1) * 0.05 * q; s.flash = Math.max(s.flash, q * 0.25); s.alpha *= 0.5 + 0.5 * p; break;
    }
  };
  const ti = v.transitionIn, to = v.transitionOut;
  if (ti.id !== 'none' && ti.duration > 0 && t < ti.duration) apply(ti.id, Math.max(0, t / ti.duration), 1);
  if (to.id !== 'none' && to.duration > 0 && duration > 0 && t > duration - to.duration) apply(to.id, Math.max(0, (duration - t) / to.duration), -1);
  return s;
}

/** Looks that are most used on TikTok, Reels and Shorts, shown first in the panels. */
export const TRENDING_FILTERS = ['y2k', 'cleanGirl', 'vhs90s', 'kodak', 'ccd', 'dreamy', 'darkAcademia', 'cyberpunk', 'blockbuster', 'softPeach', 'lofi', 'summer'];
export const TRENDING_TRANSITIONS: TransitionId[] = ['whipLeft', 'whipRight', 'zoomBlur', 'rgbShift', 'pulse', 'swirl', 'filmBurn', 'whiteOut', 'jumpCut', 'glitch', 'tiltDrop', 'flash'];
