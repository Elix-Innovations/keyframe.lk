import type { CaptionStyle, CreativeLayout, CreativeLine, DeepPartial, SfxId, Template } from '../types';
import { grad, makeStyle, solid } from './style';

/**
 * Creative text templates: each caption chunk is split into short lines that differ in size, colour and effects,
 * stacked or bent on an arc and entering one by one. Looks follow the stacked-word and neon styles that are
 * trending on short-form Sinhala and international edits. Every template names the sound effect that suits it.
 */
const red = grad(180, '#FF6A5E', '#E3202F', '#9E0B1B');
const gold = grad(180, '#FFF3A8', '#FFC81E', '#D98A00');
const ice = grad(180, '#F2FDFF', '#5CE1FF', '#2A8CFF');
const lime = grad(180, '#F6FFB0', '#B6F23A', '#4FB800');
const violet = grad(180, '#F5D9FF', '#C06BFF', '#6A2BD9');
const white = solid('#FFFFFF');

const C = (id: string, name: string, sfx: SfxId | null, creative: CreativeLayout, patch: DeepPartial<CaptionStyle> = {}): Template => ({
  id, name, builtIn: true, createdAt: 0, sfx,
  style: makeStyle({
    displayMode: 'word-by-word', wordsPerChunk: 5, animation: 'none', animationSpeed: 1,
    text: { fontSize: 58, strokeWidth: 0, shadowPreset: 'soft', lineHeight: 1.12, ...(patch.text ?? {}) },
    layout: { y: 56, maxWidth: 88, align: 'center', ...(patch.layout ?? {}) },
    creative,
  }),
});

const L = (scale: number, extra: Partial<CreativeLine> = {}): CreativeLine => ({ scale, ...extra });

export const CREATIVE_TEMPLATES: Template[] = [
  // Small white lines around one huge glossy red keyword with a 3D edge.
  C('cr-red-hero', 'Red Hero', 'boom', {
    kind: 'stack', wordsPerLine: 2, lineAnim: 'springPop', stagger: 0.12,
    lines: [
      L(1.9, { hero: true, fill: { color: '#E3202F', gradient: red }, extrude: { color: '#7A0614', depth: 9 }, strokeWidth: 2, strokeColor: '#FFB3B3' }),
      L(0.72, { fill: white, shift: -20 }),
      L(0.82, { fill: white, shift: 18 }),
      L(0.66, { fill: white, shift: 4 }),
    ],
  }, { text: { sinhalaFont: 'noto-sans-sinhala-black', englishFont: 'archivo-black', english: { sizeScale: 1 }, bold: true } }),

  // Neon sign bent along an arc and tilted, red glow on the key word, white glow on the rest.
  C('cr-neon-arc', 'Neon Arc', 'whoosh', {
    kind: 'arc', arc: 75, tilt: -26, gap: 1.45, wordsPerLine: 2, lineAnim: 'softZoom', stagger: 0.16,
    lines: [
      L(1.45, { hero: true, fill: solid('#FF2A3A'), glow: { color: '#FF1E2D', strength: 1, radius: 22 }, strokeWidth: 2, strokeColor: '#FF9AA3' }),
      L(0.82, { fill: white, glow: { color: '#FFFFFF', strength: 0.9, radius: 16 }, shift: 12 }),
    ],
  }, { text: { sinhalaFont: 'noto-sans-sinhala-black', englishFont: 'montserrat', bold: true, shadowPreset: 'none' }, layout: { y: 52 } }),

  // Heavy white words stepping left and right in different sizes, like a quick jump-cut title.
  C('cr-stagger-white', 'Stagger Bold', 'pop', {
    kind: 'stack', wordsPerLine: 1, lineAnim: 'slam', stagger: 0.1,
    lines: [
      L(1.15, { hero: true, fill: white, shift: 14, strokeWidth: 0 }),
      L(0.9, { fill: white, shift: -16 }),
      L(0.7, { fill: white, shift: 20, rotate: -3 }),
      L(1.0, { fill: white, shift: -8, rotate: 2 }),
    ],
  }, { text: { sinhalaFont: 'noto-sans-sinhala-black', englishFont: 'archivo-black', bold: true, shadowPreset: 'strong' }, layout: { align: 'center', y: 54 } }),

  C('cr-gold-hero', 'Gold Hero', 'coin', {
    kind: 'stack', wordsPerLine: 2, lineAnim: 'drop', stagger: 0.14,
    lines: [
      L(1.8, { hero: true, fill: { color: '#FFC81E', gradient: gold }, extrude: { color: '#7A4A00', depth: 8 }, strokeWidth: 2, strokeColor: '#FFF0A0' }),
      L(0.7, { fill: white, shift: -14 }),
      L(0.76, { fill: white, shift: 14 }),
    ],
  }, { text: { sinhalaFont: 'noto-sans-sinhala-black', englishFont: 'playfair', bold: true, shadowPreset: 'darker' } }),

  C('cr-ice-hero', 'Ice Hero', 'sparkle', {
    kind: 'stack', wordsPerLine: 2, lineAnim: 'zoomIn', stagger: 0.12,
    lines: [
      L(1.8, { hero: true, fill: { color: '#5CE1FF', gradient: ice }, glow: { color: '#2A8CFF', strength: 0.9, radius: 18 }, extrude: { color: '#0B3C8A', depth: 7 } }),
      L(0.72, { fill: white, shift: 16 }),
      L(0.72, { fill: white, shift: -16 }),
    ],
  }, { text: { sinhalaFont: 'noto-sans-sinhala-black', englishFont: 'poppins', bold: true } }),

  C('cr-lime-pop', 'Lime Pop', 'click', {
    kind: 'stack', wordsPerLine: 2, lineAnim: 'pop', stagger: 0.1,
    lines: [
      L(1.7, { hero: true, fill: { color: '#B6F23A', gradient: lime }, strokeWidth: 8, strokeColor: '#102600', rotate: -4 }),
      L(0.8, { fill: white, strokeWidth: 6, strokeColor: '#102600', shift: 12, rotate: 3 }),
      L(0.7, { fill: white, strokeWidth: 6, strokeColor: '#102600', shift: -12, rotate: -2 }),
    ],
  }, { text: { sinhalaFont: 'noto-sans-sinhala-black', englishFont: 'bangers', bold: true, shadowPreset: 'strong' } }),

  C('cr-violet-neon', 'Violet Neon', 'laser', {
    kind: 'arc', arc: -60, tilt: 8, gap: 1.4, wordsPerLine: 2, lineAnim: 'floatIn', stagger: 0.15,
    lines: [
      L(1.4, { hero: true, fill: { color: '#C06BFF', gradient: violet }, glow: { color: '#A53DFF', strength: 1, radius: 24 } }),
      L(0.8, { fill: white, glow: { color: '#C06BFF', strength: 0.8, radius: 14 } }),
    ],
  }, { text: { sinhalaFont: 'noto-sans-sinhala-black', englishFont: 'montserrat', bold: true, shadowPreset: 'none' }, layout: { y: 50 } }),

  C('cr-glitch-hero', 'Glitch Hero', 'glitch', {
    kind: 'stack', wordsPerLine: 2, lineAnim: 'jolt', stagger: 0.09,
    lines: [
      L(1.75, { hero: true, fill: white, extrude: { color: '#FF2D8A', depth: 6 }, strokeWidth: 3, strokeColor: '#18D2FF' }),
      L(0.72, { fill: { color: '#18D2FF', gradient: null }, shift: -18 }),
      L(0.72, { fill: { color: '#FF2D8A', gradient: null }, shift: 18 }),
    ],
  }, { text: { sinhalaFont: 'noto-sans-sinhala-black', englishFont: 'anton', bold: true, shadowPreset: 'none' } }),

  C('cr-sticker', 'Sticker Stack', 'pop', {
    kind: 'stack', wordsPerLine: 1, lineAnim: 'springPop', stagger: 0.1,
    lines: [
      L(1.3, { hero: true, fill: { color: '#FFE14A', gradient: null }, strokeWidth: 10, strokeColor: '#111111', rotate: -3, shift: 6 }),
      L(0.9, { fill: white, strokeWidth: 8, strokeColor: '#111111', rotate: 2, shift: -10 }),
      L(0.8, { fill: white, strokeWidth: 8, strokeColor: '#111111', rotate: -2, shift: 12 }),
    ],
  }, { text: { sinhalaFont: 'noto-sans-sinhala-black', englishFont: 'archivo-black', bold: true, shadowPreset: 'strong' } }),

  C('cr-fire-hero', 'Fire Hero', 'riser', {
    kind: 'stack', wordsPerLine: 2, lineAnim: 'slideUp', stagger: 0.13,
    lines: [
      L(1.85, { hero: true, fill: { color: '#FF8A00', gradient: grad(180, '#FFE259', '#FF8A00', '#F84008') }, glow: { color: '#FF5A1F', strength: 0.9, radius: 16 }, extrude: { color: '#5A1200', depth: 8 } }),
      L(0.7, { fill: white, shift: 14 }),
      L(0.7, { fill: white, shift: -14 }),
    ],
  }, { text: { sinhalaFont: 'noto-sans-sinhala-black', englishFont: 'anton', bold: true, shadowPreset: 'wideBlur' } }),

  C('cr-clean-stack', 'Clean Stack', 'swoosh', {
    kind: 'stack', wordsPerLine: 2, lineAnim: 'softRise', stagger: 0.14,
    lines: [
      L(1.35, { hero: true, fill: white }),
      L(0.8, { fill: { color: '#E6E8EC', gradient: null }, shift: 10 }),
      L(0.7, { fill: { color: '#C9CED6', gradient: null }, shift: -10 }),
    ],
  }, { text: { sinhalaFont: 'noto-sans-sinhala-semibold', englishFont: 'poppins', bold: true, shadowPreset: 'soft' } }),

  C('cr-type-lines', 'Type Lines', 'type', {
    kind: 'stack', wordsPerLine: 2, lineAnim: 'typewriter', stagger: 0.28,
    lines: [
      L(1.2, { hero: true, fill: { color: '#FFD400', gradient: null } }),
      L(0.85, { fill: white, shift: -6 }),
      L(0.85, { fill: white, shift: 6 }),
    ],
  }, { text: { sinhalaFont: 'noto-sans-sinhala-semibold', englishFont: 'oswald', bold: true, shadowPreset: 'default' } }),
];

/**
 * Motion-title styles in the spirit of stock "text animation" packs: kinetic letters, glitch, neon flicker,
 * mask wipes, whips and elastic bounces. Every value here is editable in the template editor.
 */
export const MOTION_TEMPLATES: Template[] = [
  C('mo-kinetic', 'Kinetic Pop', 'pop', {
    kind: 'stack', wordsPerLine: 1, lineAnim: 'springPop', perLetter: 0.04, letterAnim: 'springPop', stagger: 0.14,
    lines: [
      L(1.5, { hero: true, fill: { color: '#FFD400', gradient: gold }, strokeWidth: 0 }),
      L(0.85, { fill: white, shift: -10 }),
      L(0.85, { fill: white, shift: 10 }),
    ],
  }, { text: { sinhalaFont: 'noto-sans-sinhala-black', englishFont: 'archivo-black', bold: true, shadowPreset: 'strong' } }),

  C('mo-glitch-rgb', 'Glitch RGB', 'glitch', {
    kind: 'stack', wordsPerLine: 2, lineAnim: 'glitch', stagger: 0.1, split: 0.05, splitHold: true, loop: 'shake',
    lines: [
      L(1.7, { hero: true, fill: white }),
      L(0.75, { fill: { color: '#E8F7FF', gradient: null }, shift: -12 }),
      L(0.75, { fill: white, shift: 12 }),
    ],
  }, { text: { sinhalaFont: 'noto-sans-sinhala-black', englishFont: 'anton', bold: true, shadowPreset: 'none' } }),

  C('mo-neon-flicker', 'Neon Flicker', 'laser', {
    kind: 'stack', wordsPerLine: 2, lineAnim: 'flicker', stagger: 0.2, loop: 'flicker',
    lines: [
      L(1.5, { hero: true, fill: solid('#FF4DDB'), glow: { color: '#FF1FC8', strength: 1, radius: 26 }, strokeWidth: 2, strokeColor: '#FFC2F3' }),
      L(0.8, { fill: white, glow: { color: '#18D2FF', strength: 0.9, radius: 16 }, shift: 8 }),
    ],
  }, { text: { sinhalaFont: 'noto-sans-sinhala-black', englishFont: 'montserrat', bold: true, shadowPreset: 'none' } }),

  C('mo-wave', 'Wave Letters', 'swoosh', {
    kind: 'stack', wordsPerLine: 2, lineAnim: 'fade', perLetter: 0.035, letterAnim: 'blurRise', stagger: 0.18, loop: 'wave',
    lines: [
      L(1.45, { hero: true, fill: { color: '#5CE1FF', gradient: ice } }),
      L(0.8, { fill: white, shift: -8 }),
      L(0.8, { fill: white, shift: 8 }),
    ],
  }, { text: { sinhalaFont: 'noto-sans-sinhala-black', englishFont: 'poppins', bold: true, shadowPreset: 'soft' } }),

  C('mo-wipe', 'Mask Wipe', 'swoosh', {
    kind: 'stack', wordsPerLine: 2, lineAnim: 'wipe', stagger: 0.18,
    lines: [
      L(1.4, { hero: true, fill: white, extrude: { color: '#B3202F', depth: 6 } }),
      L(0.8, { fill: { color: '#FFD400', gradient: null }, shift: 6 }),
      L(0.8, { fill: white, shift: -6 }),
    ],
  }, { text: { sinhalaFont: 'noto-sans-sinhala-black', englishFont: 'oswald', bold: true, shadowPreset: 'darker' } }),

  C('mo-whip', 'Whip Title', 'whoosh', {
    kind: 'stack', wordsPerLine: 1, lineAnim: 'whip', stagger: 0.08,
    lines: [
      L(1.6, { hero: true, fill: white, shift: 6, strokeWidth: 0 }),
      L(0.8, { fill: { color: '#FF5A5F', gradient: null }, shift: -14 }),
      L(0.8, { fill: white, shift: 14 }),
    ],
  }, { text: { sinhalaFont: 'noto-sans-sinhala-black', englishFont: 'anton', bold: true, shadowPreset: 'strong' } }),

  C('mo-spin', 'Spin Reveal', 'sparkle', {
    kind: 'arc', arc: 50, tilt: 0, gap: 1.3, wordsPerLine: 2, lineAnim: 'fade', perLetter: 0.05, letterAnim: 'spinIn', stagger: 0.22,
    lines: [
      L(1.4, { hero: true, fill: { color: '#C06BFF', gradient: violet }, glow: { color: '#A53DFF', strength: 0.8, radius: 18 } }),
      L(0.8, { fill: white }),
    ],
  }, { text: { sinhalaFont: 'noto-sans-sinhala-black', englishFont: 'montserrat', bold: true, shadowPreset: 'none' }, layout: { y: 52 } }),

  C('mo-elastic', 'Elastic Bounce', 'drop', {
    kind: 'stack', wordsPerLine: 1, lineAnim: 'elastic', perLetter: 0.05, letterAnim: 'elastic', stagger: 0.16, loop: 'pulse',
    lines: [
      L(1.45, { hero: true, fill: { color: '#B6F23A', gradient: lime }, strokeWidth: 8, strokeColor: '#102600' }),
      L(0.8, { fill: white, strokeWidth: 6, strokeColor: '#102600', shift: 10 }),
      L(0.8, { fill: white, strokeWidth: 6, strokeColor: '#102600', shift: -10 }),
    ],
  }, { text: { sinhalaFont: 'noto-sans-sinhala-black', englishFont: 'bangers', bold: true, shadowPreset: 'strong' } }),
];

/**
 * "Text Preset" family: clean rounded bold type with a soft outer glow on a single line, the way the Elfko preset pack
 * shows it. One preset per motion it demonstrates: slide, scale, bounce, typewriter, plus an accent-word variant.
 */
const presetGlow = { color: '#5CC8FF', strength: 0.7, radius: 14 };
const P = (id: string, name: string, sfx: SfxId | null, creative: Partial<CreativeLayout>, hero?: CreativeLine): Template =>
  C(id, name, sfx, {
    kind: 'stack', wordsPerLine: 6, singleLine: true, stagger: 0.12, lineAnim: 'softRise',
    ...creative,
    lines: [...(hero ? [hero] : []), L(1, { fill: white, glow: presetGlow })],
  } as CreativeLayout, { text: { sinhalaFont: 'noto-sans-sinhala-semibold', englishFont: 'poppins', bold: true, shadowPreset: 'none', fontSize: 60 }, layout: { y: 50, maxWidth: 92 } });

export const PRESET_TEMPLATES: Template[] = [
  P('pp-slide', 'Preset Slide', 'swoosh', { lineAnim: 'glideLeft', perLetter: 0.025, letterAnim: 'glideLeft' }),
  P('pp-scale', 'Preset Scale', 'pop', { lineAnim: 'zoomIn', perLetter: 0.03, letterAnim: 'zoomIn' }),
  P('pp-bounce', 'Preset Bounce', 'drop', { lineAnim: 'bounce', perLetter: 0.045, letterAnim: 'bounce' }),
  P('pp-type', 'Preset Type', 'type', { lineAnim: 'typewriter', stagger: 0.3 }),
  P('pp-accent', 'Preset Accent', 'sparkle', { lineAnim: 'springPop', perLetter: 0.03, letterAnim: 'springPop' },
    L(1, { hero: true, fill: solid('#18E0FF'), bold: true, glow: { color: '#18D2FF', strength: 1, radius: 20 } })),
];

/**
 * "Text Scene" family: a bold grotesque with a coloured neon glow, single row, words resolving out of a blur or sliding
 * in, with the letters shading from white to the glow colour. Each one is a look from the Elfko scene pack.
 */
const glow = (color: string, radius = 20, strength = 1) => ({ color, strength, radius });
const SCENE_TEXT = { sinhalaFont: 'noto-sans-sinhala-black', englishFont: 'inter', bold: true, shadowPreset: 'none' as const, fontSize: 66, letterSpacing: -2, lineHeight: 1.05 };
const SC = (id: string, name: string, sfx: SfxId | null, creative: Partial<CreativeLayout>, line: CreativeLine, hero?: CreativeLine, text: DeepPartial<CaptionStyle>['text'] = {}): Template =>
  C(id, name, sfx, {
    kind: 'stack', wordsPerLine: 6, singleLine: true, stagger: 0.1, lineAnim: 'blurIn', outAnim: 'blurIn',
    ...creative,
    lines: [...(hero ? [hero] : []), line],
  } as CreativeLayout, { text: { ...SCENE_TEXT, ...text }, layout: { y: 50, maxWidth: 92 } });

export const SCENE_TEMPLATES: Template[] = [
  // "IF you want to find me": white letters typing on under a yellow glow.
  SC('sc-yellow-type', 'Scene Yellow Type', 'type', { lineAnim: 'fade', perLetter: 0.04, letterAnim: 'fade', outAnim: 'blurIn' },
    L(1, { fill: white, glow: glow('#FFE600', 18) })),
  // "Professional": slides in from the right out of a heavy blur, letters shading white to cyan.
  SC('sc-cyan-slide', 'Scene Cyan Slide', 'whoosh', { lineAnim: 'blurSlide', outAnim: 'blurSlideL' },
    L(1, { fill: white, tint: ['#FFFFFF', '#19F3D6'], glow: glow('#19E8D0', 22) })),
  // "Animations": resolves out of a blur, letter by letter, white to cyan.
  SC('sc-cyan-blur', 'Scene Cyan Blur', 'sparkle', { lineAnim: 'fade', perLetter: 0.035, letterAnim: 'blurIn', outAnim: 'blurIn' },
    L(1, { fill: white, tint: ['#F4FFFF', '#00F5E0'], glow: glow('#00F0DA', 24) })),
  // "Thank You": rushes through the lens, huge and blurred, then settles.
  SC('sc-zoom-through', 'Scene Zoom Through', 'boom', { lineAnim: 'zoomThrough', outAnim: 'zoomThrough', stagger: 0.14 },
    L(1.15, { fill: white, tint: ['#E9FFE0', '#C6F25A'], glow: glow('#B6F23A', 20) })),
  // "what do you": dark letters on a bright cyan glow, typed on out of a blur.
  SC('sc-dark-glow', 'Scene Dark Glow', 'type', { lineAnim: 'fade', perLetter: 0.045, letterAnim: 'blurIn', outAnim: 'blurIn' },
    L(1, { fill: { color: '#031417', gradient: null }, glow: glow('#19F0DA', 30, 1.4) })),
  // "start right": the first words glow yellow, the key word glows mint.
  SC('sc-two-tone', 'Scene Two Tone', 'pop', { lineAnim: 'blurSlide', outAnim: 'blurSlideL' },
    L(1, { fill: white, glow: glow('#FFE600', 18) }),
    L(1, { hero: true, fill: { color: '#A8FFD9', gradient: null }, glow: glow('#4CFFB5', 22) }), { textCase: 'lower' }),
  // "continue.": lowercase, soft cyan bloom, resolves out of a blur.
  SC('sc-bloom', 'Scene Bloom', 'swoosh', { lineAnim: 'blurIn', outAnim: 'blurIn', stagger: 0.16 },
    L(1.05, { fill: white, glow: glow('#19F3D6', 28, 1.2) }), undefined, { textCase: 'lower' }),
];

/**
 * Apple-website styles: big SF-style type (Inter) with tight tracking, soft blur-rises, silver and Apple Intelligence
 * gradients, and the headline that brightens word by word as you read down the page.
 */
const AP_TEXT = { sinhalaFont: 'noto-sans-sinhala-black', englishFont: 'inter', bold: true, shadowPreset: 'none' as const, letterSpacing: -2.5, lineHeight: 1.04 };
const AP = (id: string, name: string, sfx: SfxId | null, creative: Partial<CreativeLayout>, lines: CreativeLine[], text: DeepPartial<CaptionStyle>['text'] = {}): Template =>
  C(id, name, sfx, { kind: 'stack', wordsPerLine: 2, lineAnim: 'blurRise', stagger: 0.14, outAnim: 'fade', ...creative, lines } as CreativeLayout,
    { text: { ...AP_TEXT, fontSize: 70, ...text }, layout: { y: 50, maxWidth: 90 } });

export const APPLE_TEMPLATES: Template[] = [
  // The Apple Intelligence gradient across a big headline.
  AP('ap-intelligence', 'Apple Intelligence', 'sparkle', { singleLine: true, wordsPerLine: 6, lineAnim: 'blurIn', outAnim: 'blurIn' },
    [L(1.05, { fill: white, tint: ['#FF9F0A', '#FF375F', '#BF5AF2', '#0A84FF'], glow: glow('#BF5AF2', 14, 0.45) })]),
  // Silver titanium headline, as on a product page.
  AP('ap-titanium', 'Apple Titanium', 'swoosh', { singleLine: true, wordsPerLine: 6, lineAnim: 'blurRise', outAnim: 'blurIn' },
    [L(1.1, { fill: white, tint: ['#FFFFFF', '#C9CBD1', '#8E9099'] })], { fontSize: 74 }),
  // Words brighten from dim grey one after another, like scrolling an Apple page.
  AP('ap-reveal', 'Apple Reveal', 'click', { wordsPerLine: 3, lineAnim: 'fade', perLetter: 0.028, letterAnim: 'dimIn', stagger: 0.12, outAnim: 'fade' },
    [L(1, { fill: { color: '#F5F5F7', gradient: null } })]),
  // A blue-to-violet gradient key word under white lines, big and centred.
  AP('ap-headline', 'Apple Headline', 'pop', { wordsPerLine: 2, lineAnim: 'blurRise', stagger: 0.16 },
    [L(1.35, { hero: true, fill: white, tint: ['#2997FF', '#7D7AFF', '#BF5AF2'] }), L(0.9, { fill: { color: '#F5F5F7', gradient: null } })]),
  // Pro keynote: white title that pushes in from a soft zoom.
  AP('ap-keynote', 'Apple Keynote', 'boom', { singleLine: true, wordsPerLine: 5, lineAnim: 'zoomThrough', outAnim: 'blurIn' },
    [L(1.15, { fill: white, glow: glow('#FFFFFF', 10, 0.25) })], { fontSize: 76 }),
];
