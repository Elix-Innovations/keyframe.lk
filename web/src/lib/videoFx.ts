import { nanoid } from 'nanoid';
import type { Ease, EffectInstance, LaneState, MatteSettings, Project, PropKf, RegionBlur, TransitionId, VideoFilters, VideoKeyframe, VideoLayer } from '../types';

export const HSL_BANDS = ['Red', 'Orange', 'Yellow', 'Green', 'Aqua', 'Blue', 'Purple', 'Magenta'] as const;
const HSL_NEUTRAL = Object.fromEntries(HSL_BANDS.flatMap((b) => [`hue${b}`, `sat${b}`, `lum${b}`].map((k) => [k, 0])));

export const NEUTRAL_FILTERS: VideoFilters = {
  brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0, grayscale: 0, sepia: 0, vignette: 0,
  exposure: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, vibrance: 0, fade: 0, sharpen: 0, grain: 0, clarity: 0,
  lvInBlack: 0, lvInWhite: 255, lvGamma: 100, lvOutBlack: 0, lvOutWhite: 255,
  gainR: 0, gainG: 0, gainB: 0,
  curveShadows: 0, curveDarks: 0, curveLights: 0, curveHighlights: 0,
  shadowHue: 220, shadowAmt: 0, midHue: 40, midAmt: 0, highHue: 40, highAmt: 0,
  ...HSL_NEUTRAL,
} as VideoFilters;

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

/** Graded looks in the style of phone photo apps (Hypic, Lightroom mobile): each uses the full grade, not only the CSS sliders. */
export const GRADE_GROUPS = ['Portrait', 'Food', 'Scenery', 'Film', 'Retro', 'Black & white', 'Night', 'Aesthetic'] as const;
export type GradeGroup = (typeof GRADE_GROUPS)[number];
const G = (group: GradeGroup, id: string, label: string, filters: Partial<VideoFilters>) => ({ id, label, group, filters });
export const GRADE_LOOKS = [
  G('Portrait', 'hpGlow', 'Glow Skin', { exposure: 8, highlights: -15, shadows: 18, vibrance: 20, clarity: -12, temperature: 8, tint: 4, fade: 6, highAmt: 18, highHue: 30 }),
  G('Portrait', 'hpPorcelain', 'Porcelain', { exposure: 14, saturate: 92, shadows: 25, clarity: -18, temperature: -4, tint: 6, satOrange: -15, lumOrange: 12, fade: 8 }),
  G('Portrait', 'hpSunKiss', 'Sun Kissed', { exposure: 6, temperature: 28, saturate: 108, vibrance: 22, highlights: -10, highAmt: 22, highHue: 38, shadowAmt: 12, shadowHue: 15 }),
  G('Portrait', 'hpBlush', 'Blush', { exposure: 8, temperature: 8, tint: 14, vibrance: 18, saturate: 104, fade: 10, clarity: -10, satRed: 10, hueRed: -6, midAmt: 10, midHue: 345 }),
  G('Portrait', 'hpStudio', 'Studio Pop', { contrast: 112, clarity: 22, sharpen: 25, vibrance: 15, shadows: 10, highlights: -12, whites: 8, blacks: -8 }),
  G('Portrait', 'hpMoodyP', 'Moody Portrait', { exposure: -8, contrast: 115, saturate: 85, shadows: 8, blacks: -14, shadowAmt: 20, shadowHue: 200, highAmt: 12, highHue: 30, vignette: 25 }),
  G('Food', 'hpYummy', 'Yummy', { saturate: 118, vibrance: 28, contrast: 108, temperature: 14, clarity: 18, sharpen: 18, satOrange: 18, satRed: 10, lumYellow: 6 }),
  G('Food', 'hpFresh', 'Fresh', { exposure: 10, saturate: 112, vibrance: 24, temperature: -2, clarity: 14, satGreen: 22, lumGreen: 8, highlights: -10, sharpen: 15 }),
  G('Food', 'hpBakery', 'Bakery', { temperature: 24, tint: 4, contrast: 104, saturate: 106, fade: 8, satOrange: 14, lumOrange: 8, shadowAmt: 14, shadowHue: 25 }),
  G('Food', 'hpBrunch', 'Brunch', { exposure: 12, contrast: 94, saturate: 98, temperature: 10, fade: 12, clarity: -6, vibrance: 18 }),
  G('Scenery', 'hpVista', 'Vista', { saturate: 112, vibrance: 30, contrast: 108, clarity: 28, highlights: -22, shadows: 18, satBlue: 20, lumBlue: -10, satGreen: 14, sharpen: 20 }),
  G('Scenery', 'hpBlueHour', 'Blue Hour', { exposure: -4, temperature: -22, tint: 6, contrast: 110, saturate: 112, shadowAmt: 22, shadowHue: 230, highAmt: 14, highHue: 20, vibrance: 18 }),
  G('Scenery', 'hpGolden', 'Golden Hour+', { exposure: 4, temperature: 38, tint: 6, contrast: 108, saturate: 112, highlights: -14, highAmt: 30, highHue: 35, shadowAmt: 16, shadowHue: 300, vignette: 18 }),
  G('Scenery', 'hpTropic', 'Tropical', { saturate: 120, vibrance: 32, contrast: 106, temperature: 6, satAqua: 28, hueAqua: -10, satGreen: 14, lumAqua: 6, clarity: 12, exposure: 4 }),
  G('Scenery', 'hpMisty', 'Misty', { exposure: 8, contrast: 86, saturate: 88, fade: 22, clarity: -22, temperature: -6, shadows: 20, highlights: -8 }),
  G('Film', 'hpPortra', 'Portra 400', { temperature: 10, tint: 3, contrast: 96, saturate: 96, fade: 10, highlights: -12, shadows: 14, satOrange: 8, grain: 18, midAmt: 8, midHue: 35 }),
  G('Film', 'hpFuji', 'Fuji Velvia', { saturate: 128, vibrance: 14, contrast: 116, temperature: -4, satGreen: 22, satBlue: 14, hueGreen: 6, blacks: -10, grain: 14 }),
  G('Film', 'hpCine', 'Teal & Orange', { contrast: 114, saturate: 105, shadowAmt: 38, shadowHue: 195, highAmt: 32, highHue: 32, midAmt: 6, midHue: 30, blacks: -8, vignette: 22 }),
  G('Film', 'hpKodakVision', 'Vision 500T', { temperature: -6, contrast: 108, saturate: 100, shadowAmt: 28, shadowHue: 205, highAmt: 18, highHue: 40, grain: 26, fade: 6, clarity: 8 }),
  G('Film', 'hpExpired', 'Expired Film', { temperature: 14, tint: -8, contrast: 92, saturate: 92, fade: 28, grain: 34, shadowAmt: 30, shadowHue: 170, highAmt: 22, highHue: 50, vignette: 30 }),
  G('Retro', 'hpPolaroid', 'Polaroid 600', { temperature: 12, tint: 4, contrast: 92, saturate: 96, fade: 24, exposure: 8, vignette: 28, grain: 16, shadowAmt: 20, shadowHue: 190, highAmt: 14, highHue: 45 }),
  G('Retro', 'hpDisposable', 'Disposable', { exposure: 10, contrast: 118, saturate: 112, temperature: 8, highlights: 14, blacks: -4, grain: 30, sharpen: 14, vignette: 24, tint: -4 }),
  G('Retro', 'hp80s', '80s Neon', { contrast: 118, saturate: 120, shadowAmt: 36, shadowHue: 280, highAmt: 30, highHue: 330, fade: 10, grain: 12, vibrance: 14 }),
  G('Retro', 'hpSepiaTone', 'Old Photo', { sepia: 55, contrast: 92, fade: 30, grain: 26, vignette: 38, blacks: 6, saturate: 90 }),
  G('Black & white', 'hpMonoSoft', 'Soft Mono', { grayscale: 100, contrast: 94, fade: 14, exposure: 6, highlights: -10, shadows: 12, clarity: -8 }),
  G('Black & white', 'hpMonoPunch', 'Punch Mono', { grayscale: 100, contrast: 128, clarity: 30, blacks: -22, whites: 14, sharpen: 24, vignette: 22 }),
  G('Black & white', 'hpMonoGrain', 'Film Mono', { grayscale: 100, contrast: 112, grain: 40, fade: 8, vignette: 26, clarity: 10 }),
  G('Black & white', 'hpDuoBlue', 'Blue Duotone', { grayscale: 100, contrast: 112, shadowAmt: 70, shadowHue: 225, highAmt: 40, highHue: 195, midAmt: 24, midHue: 210 }),
  G('Night', 'hpNeonCity', 'Neon City', { exposure: -6, contrast: 120, saturate: 118, vibrance: 20, shadowAmt: 34, shadowHue: 255, highAmt: 28, highHue: 325, blacks: -12, clarity: 14, vignette: 22 }),
  G('Night', 'hpMoonlit', 'Moonlit', { exposure: -12, temperature: -30, contrast: 112, saturate: 88, shadowAmt: 34, shadowHue: 225, shadows: 14, vignette: 34 }),
  G('Night', 'hpClub', 'Club Lights', { exposure: -8, contrast: 122, saturate: 130, vibrance: 22, shadowAmt: 40, shadowHue: 285, highAmt: 26, highHue: 340, whites: 10, grain: 16, vignette: 28 }),
  G('Aesthetic', 'hpDreamPink', 'Dream Pink', { exposure: 10, temperature: 4, tint: 18, saturate: 104, vibrance: 22, fade: 14, clarity: -16, shadowAmt: 20, shadowHue: 330, highAmt: 18, highHue: 350 }),
  G('Aesthetic', 'hpMintFresh', 'Mint Fresh', { exposure: 8, temperature: -8, tint: -10, saturate: 96, vibrance: 20, fade: 10, satGreen: 14, hueGreen: -10, clarity: -6, highAmt: 14, highHue: 150 }),
  G('Aesthetic', 'hpCreamy', 'Creamy', { exposure: 10, temperature: 14, contrast: 90, saturate: 92, fade: 18, clarity: -14, shadowAmt: 14, shadowHue: 30, highAmt: 14, highHue: 45 }),
  G('Aesthetic', 'hpLilac', 'Lilac Haze', { exposure: 6, temperature: -6, tint: 14, contrast: 94, saturate: 98, fade: 18, shadowAmt: 26, shadowHue: 270, highAmt: 16, highHue: 300, clarity: -10 }),
  G('Aesthetic', 'hpSage', 'Sage', { exposure: 4, temperature: 4, tint: -8, contrast: 96, saturate: 82, fade: 16, satGreen: -10, hueGreen: 12, midAmt: 12, midHue: 100, vibrance: 10 }),
];
FILTER_PRESETS.push(...GRADE_LOOKS.map(({ id, label, filters }) => F(id, label, filters)));

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
  { id: 'fire', label: 'Fire' }, { id: 'lensFlare', label: 'Lens flare' }, { id: 'lightLeak', label: 'Light leak' }, { id: 'anamorphic', label: 'Anamorphic streak' },
  { id: 'sparkle', label: 'Sparkle' }, { id: 'lightning', label: 'Lightning' }, { id: 'prism', label: 'Prism' }, { id: 'sunrise', label: 'Sunrise' },
  { id: 'earthquake', label: 'Earthquake' }, { id: 'dizzy', label: 'Dizzy' }, { id: 'fastZoom', label: 'Fast zoom' }, { id: 'slam', label: 'Slam' },
  { id: 'stretch', label: 'Stretch' }, { id: 'fadeBlack', label: 'Dip to black' }, { id: 'vhsRewind', label: 'VHS rewind' }, { id: 'heartbeat', label: 'Heartbeat' },
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
    if (WHEEL_HUES.includes(key)) { out[key] = k > 0 ? to : NEUTRAL_FILTERS[key]; continue; }
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

/** Value of a keyframed number at time t: held before the first and after the last, eased between. */
export function propAt(kfs: PropKf[] | undefined, t: number, fallback: number): number {
  if (!kfs?.length) return fallback;
  const ks = [...kfs].sort((a, b) => a.t - b.t);
  if (t <= ks[0].t) return ks[0].v;
  const last = ks[ks.length - 1];
  if (t >= last.t) return last.v;
  let i = 0;
  while (ks[i + 1].t < t) i++;
  const a = ks[i], b = ks[i + 1];
  return a.v + (b.v - a.v) * applyEase(a.ease, (t - a.t) / Math.max(1e-6, b.t - a.t));
}

/** The layer's colour sliders at clip time t, with keyframed ones evaluated. */
export function liveFilters(layer: Pick<VideoLayer, 'filters' | 'fkf'>, t: number): VideoFilters {
  if (!layer.fkf) return layer.filters;
  const out = { ...layer.filters } as Record<string, unknown>;
  for (const [k, kfs] of Object.entries(layer.fkf)) if (kfs.length && typeof out[k] === 'number') out[k] = propAt(kfs, t, out[k] as number);
  return out as unknown as VideoFilters;
}

export const newKeyframe = (t: number, from: Transform): VideoKeyframe => ({ id: nanoid(8), t, ...from, ease: 'easeInOut' });
export const newEffect = (effectId: string): EffectInstance => ({ id: nanoid(8), effectId, intensity: 0.6 });

const WHEEL_HUES: (keyof VideoFilters)[] = ['shadowHue', 'midHue', 'highHue'];
const CSS_KEYS: (keyof VideoFilters)[] = ['brightness', 'contrast', 'saturate', 'hue', 'blur', 'grayscale', 'sepia', 'vignette'];
const GRADE_KEYS = (Object.keys(NEUTRAL_FILTERS) as (keyof VideoFilters)[]).filter((k) => !CSS_KEYS.includes(k) && !WHEEL_HUES.includes(k));

/** Does the grade shader have anything to do (anything beyond the CSS-filter sliders)? */
export const needsGrade = (f: VideoFilters) => GRADE_KEYS.some((k) => f[k] !== NEUTRAL_FILTERS[k]);

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

import type { LightKind } from '../render/transitionFx';

export interface TransitionState {
  alpha: number; scale: number; sx: number; dx: number; dy: number; rot: number; blur: number; flash: number;
  /** Flash colour as 'r,g,b' (default white). */
  flashColor: string;
  /** RGB-split strength, as an effect intensity. */
  split: number;
  /** Reveal region: wipe from an edge or a growing circle. p = 0..1 revealed. */
  clip: { kind: 'l' | 'r' | 'u' | 'd' | 'h' | 'circle'; p: number } | null;
  /** Light overlay painted on top (fire, lens flare...): q 1 at the cut, sweep 0..1 in time order. */
  light: { kind: LightKind; q: number; sweep: number } | null;
}

const easeOutBack = (u: number) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };

/** In/out transition at time t. dir: 1 = entering, -1 = leaving. */
export function transitionAt(v: VideoLayer, t: number, duration: number): TransitionState {
  const s: TransitionState = { alpha: 1, scale: 1, sx: 1, dx: 0, dy: 0, rot: 0, blur: 0, flash: 0, flashColor: '255,255,255', split: 0, clip: null, light: null };
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
      case 'fire': s.light = { kind: 'fire', q, sweep: dir > 0 ? p : 1 - p }; s.scale *= 1 + 0.08 * q; s.alpha *= 0.5 + 0.5 * p; break;
      case 'lensFlare': s.light = { kind: 'lensFlare', q, sweep: dir > 0 ? p : 1 - p }; s.flash = Math.max(s.flash, q * 0.35); s.blur = Math.max(s.blur, q * 4); break;
      case 'lightLeak': s.light = { kind: 'lightLeak', q, sweep: dir > 0 ? p : 1 - p }; s.alpha *= 0.6 + 0.4 * p; break;
      case 'anamorphic': s.light = { kind: 'anamorphic', q, sweep: dir > 0 ? p : 1 - p }; s.flash = Math.max(s.flash, q * 0.2); s.scale *= 1 + 0.06 * q; break;
      case 'sparkle': s.light = { kind: 'sparkle', q, sweep: dir > 0 ? p : 1 - p }; s.alpha *= 0.5 + 0.5 * p; s.scale *= 1 + 0.04 * q; break;
      case 'lightning': s.light = { kind: 'lightning', q, sweep: dir > 0 ? p : 1 - p }; s.alpha *= Math.sin(p * 40) > -0.3 ? 1 : 0.4; break;
      case 'prism': s.light = { kind: 'prism', q, sweep: dir > 0 ? p : 1 - p }; s.split = Math.max(s.split, q * 2); break;
      case 'sunrise': s.light = { kind: 'sunrise', q, sweep: dir > 0 ? p : 1 - p }; s.dy += dir * q * 0.08; s.alpha *= 0.4 + 0.6 * p; break;
      case 'earthquake': s.dx += Math.sin(p * 120) * 0.05 * q; s.dy += Math.cos(p * 97) * 0.04 * q; s.rot += Math.sin(p * 70) * 3 * q; s.scale *= 1 + 0.1 * q; break;
      case 'dizzy': s.rot += Math.sin(p * 12) * 14 * q; s.scale *= 1 + 0.15 * q; s.blur = Math.max(s.blur, q * 6); s.alpha *= 0.5 + 0.5 * p; break;
      case 'fastZoom': s.scale *= 1 + 3 * q * q; s.blur = Math.max(s.blur, q * 28); s.alpha *= Math.min(1, p * 3); break;
      case 'slam': s.scale *= 1 + 0.6 * q * q; s.alpha *= Math.min(1, p * 6); s.dy -= dir * q * q * 0.06; break;
      case 'stretch': s.sx *= 1 + 1.6 * q; s.blur = Math.max(s.blur, q * 14); s.alpha *= p; break;
      case 'fadeBlack': s.flash = Math.max(s.flash, Math.min(1, q * 1.3)); s.flashColor = '0,0,0'; s.alpha *= 0.6 + 0.4 * p; break;
      case 'vhsRewind': s.dy += Math.floor(p * 9) % 2 ? q * 0.04 : -q * 0.03; s.split = Math.max(s.split, q * 2.5); s.flash = Math.max(s.flash, q * 0.15); s.blur = Math.max(s.blur, q * 3); break;
      case 'heartbeat': s.scale *= 1 + 0.18 * q * Math.pow(Math.max(0, Math.sin(p * Math.PI * 5)), 2); s.flash = Math.max(s.flash, q * 0.12); break;
      case 'glitch': s.dx += (Math.sin(p * 90) > 0 ? 1 : -1) * 0.05 * q; s.flash = Math.max(s.flash, q * 0.25); s.alpha *= 0.5 + 0.5 * p; break;
    }
  };
  const ti = v.transitionIn, to = v.transitionOut;
  if (ti.id !== 'none' && ti.duration > 0 && t < ti.duration) apply(ti.id, Math.max(0, t / ti.duration), 1);
  if (to.id !== 'none' && to.duration > 0 && duration > 0 && t > duration - to.duration) apply(to.id, Math.max(0, (duration - t) / to.duration), -1);
  return s;
}

/** Looks that are most used on TikTok, Reels and Shorts, shown first in the panels. */
export const TRENDING_FILTERS = ['y2k', 'cleanGirl', 'vhs90s', 'kodak', 'ccd', 'dreamy', 'darkAcademia', 'cyberpunk', 'blockbuster', 'softPeach', 'lofi', 'summer', 'hpGlow', 'hpCine', 'hpPortra', 'hpDreamPink'];
export const TRENDING_TRANSITIONS: TransitionId[] = ['fire', 'lensFlare', 'lightLeak', 'sparkle', 'fastZoom', 'vhsRewind', 'whipLeft', 'whipRight', 'zoomBlur', 'rgbShift', 'pulse', 'swirl', 'filmBurn', 'whiteOut', 'jumpCut', 'glitch', 'tiltDrop', 'flash'];
