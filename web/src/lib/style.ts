import type { CaptionStyle, DeepPartial, Fill, Gradient, Shadow, ShadowPreset, Template } from '../types';

export const SHADOW_PRESETS: Record<ShadowPreset, Shadow & { passes: number }> = {
  none: { color: '#000000', opacity: 0, blur: 0, offsetX: 0, offsetY: 0, passes: 0 },
  soft: { color: '#000000', opacity: 0.5, blur: 6, offsetX: 0, offsetY: 2, passes: 1 },
  default: { color: '#000000', opacity: 0.85, blur: 4, offsetX: 1, offsetY: 2, passes: 1 },
  strong: { color: '#000000', opacity: 0.95, blur: 7, offsetX: 2, offsetY: 4, passes: 1 },
  darker: { color: '#000000', opacity: 1, blur: 10, offsetX: 0, offsetY: 4, passes: 2 },
  wideBlur: { color: '#000000', opacity: 0.8, blur: 16, offsetX: 0, offsetY: 3, passes: 2 },
};

export const solid = (color: string): Fill => ({ color, gradient: null });
export const grad = (angle: number, ...colors: string[]): Gradient => ({
  angle,
  stops: colors.map((color, i) => ({ color, position: colors.length === 1 ? 0 : i / (colors.length - 1) })),
});

export const DEFAULT_STYLE: CaptionStyle = {
  text: {
    fontSize: 64,
    sinhalaFont: 'noto-sans-sinhala',
    englishFont: 'montserrat',
    fill: solid('#FFFFFF'),
    opacity: 1,
    bold: true,
    italic: false,
    uppercaseEnglish: false,
    letterSpacing: 0,
    lineHeight: 1.25,
    strokeWidth: 6,
    strokeColor: '#000000',
    shadowPreset: 'default',
    shadow: { ...SHADOW_PRESETS.default },
    glow: { enabled: false, matchText: true, color: '#F43F5E', strength: 0.65, radius: 12 },
    background: { enabled: false, color: '#000000', opacity: 0.6, radius: 18, padX: 28, padY: 14 },
    sinhala: {},
    english: {},
  },
  displayMode: 'highlight',
  wordsPerChunk: 3,
  animation: 'pop',
  wordAnimation: 'pop',
  animationSpeed: 1,
  highlight: { fill: solid('#FFD400'), boxColor: '#F43F5E', boxRadius: 14, boxPadding: 10, scale: 1.08 },
  emphasis: { enabled: true, fill: solid('#FFD400'), scale: 1.3, bold: true, sinhalaFont: null, englishFont: null },
  layout: { x: 50, y: 72, maxWidth: 84, align: 'center' },
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep merge; arrays and null replace rather than merge. */
export function merge<T>(base: T, patch: DeepPartial<T> | undefined): T {
  if (!patch) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (v === undefined) continue;
    const cur = out[k];
    out[k] = isObj(v) && isObj(cur) ? merge(cur, v as DeepPartial<typeof cur>) : v;
  }
  return out as T;
}

export const makeStyle = (patch: DeepPartial<CaptionStyle>): CaptionStyle => merge(DEFAULT_STYLE, patch);

const fire = grad(180, '#FFE259', '#FF8A00', '#F84008');
const gold = grad(180, '#FFF6B7', '#FFD400', '#E0A100');
const silver = grad(180, '#FFFFFF', '#D9DDE3', '#9AA3AE');
const ice = grad(180, '#E0FBFF', '#5CE1FF', '#2A8CFF');
const neon = grad(90, '#FF3CAC', '#784BA0', '#2B86C5');

const T = (id: string, name: string, patch: DeepPartial<CaptionStyle>): Template => ({
  id,
  name,
  builtIn: true,
  createdAt: 0,
  style: makeStyle(patch),
});

/** Built-in looks. Inspired by popular short-form caption styles, tuned for Sinhala glyph heights. */
/**
 * Script pairing: every template pairs a Unicode Sinhala font (real OpenType mark positioning, so vowel
 * signs always sit right) with a Latin font of the same character. English `sizeScale` makes its
 * x-height match the Sinhala letter body (measured: Noto Sinhala body = 1.12 × Noto Sans x-height);
 * font sizes are normalised to Noto Sans Sinhala's body height, so every template reads the same size.
 */
const en = (sizeScale: number) => ({ sizeScale });

/** Built-in looks. Inspired by popular short-form caption styles, tuned for Sinhala glyph heights. */
export const BUILTIN_TEMPLATES: Template[] = [
  // Facebook-reel look: heavy rounded white Sinhala, one yellow key word, soft drop shadow, 3 centered lines.
  T('reel-yellow', 'Reel Yellow', {
    displayMode: 'natural', wordsPerChunk: 0, animation: 'fade',
    text: { sinhalaFont: 'fm-emanee', englishFont: 'nunito', english: en(1.04), fontSize: 66, strokeWidth: 0, shadowPreset: 'soft' },
    emphasis: { fill: solid('#F5C518'), scale: 1 },
    layout: { y: 62, maxWidth: 82 },
  }),
  T('reel-yellow-live', 'Reel Yellow Live', {
    displayMode: 'highlight', wordsPerChunk: 4, animation: 'pop',
    text: { sinhalaFont: 'fm-emanee', englishFont: 'nunito', english: en(1.04), fontSize: 66, strokeWidth: 0, shadowPreset: 'soft' },
    highlight: { fill: solid('#F5C518'), scale: 1.04 },
    layout: { y: 62, maxWidth: 82 },
  }),
  // Facebook-reel look: white bold text, the spoken word sits on a rounded yellow box with dark text.
  T('reel-yellow-box', 'Reel Yellow Box', {
    displayMode: 'box-highlight', wordsPerChunk: 4, animation: 'pop',
    text: { sinhalaFont: 'fm-emanee', englishFont: 'poppins', english: en(0.98), fontSize: 62, strokeWidth: 0, shadowPreset: 'soft' },
    highlight: { boxColor: '#FFD83D', boxRadius: 12, boxPadding: 12, boxPadTop: 4, boxPadBottom: 4, boxPadLeft: 12, boxPadRight: 12, fill: solid('#1A1A1A'), scale: 1 },
    layout: { y: 69, maxWidth: 80 },
  }),
  T('clean-pop', 'Clean Pop', {
    text: { sinhalaFont: 'noto-sans-sinhala-semibold', englishFont: 'poppins', english: en(0.98) },
  }),
  T('fire-emphasis', 'Fire Emphasis', {
    displayMode: 'compact-emphasis', wordsPerChunk: 5, animation: 'slam', wordAnimation: 'slam', animationSpeed: 0.9,
    text: { sinhalaFont: 'fm-derana', englishFont: 'archivo-black', english: en(1.05), fontSize: 60, strokeWidth: 0, shadowPreset: 'wideBlur', glow: { enabled: true, color: '#5865FF', radius: 10, strength: 0.8 } },
    emphasis: { fill: { color: '#FF8A00', gradient: fire }, scale: 1.35 },
    highlight: { fill: { color: '#FF8A00', gradient: fire } },
  }),
  T('gold-block', 'Gold Block', {
    displayMode: 'compact-emphasis', wordsPerChunk: 4, animation: 'slideUp', wordAnimation: 'drop',
    text: { sinhalaFont: 'fm-malithi', englishFont: 'playfair', english: en(1.03), fontSize: 58, strokeWidth: 0, shadowPreset: 'darker' },
    emphasis: { fill: { color: '#FFD400', gradient: gold }, scale: 1.4 },
  }),
  T('box-rose', 'Box Rose', {
    displayMode: 'box-highlight', wordsPerChunk: 3, animation: 'flipUp',
    text: { sinhalaFont: 'fm-abhaya-bold', englishFont: 'barlow-condensed', english: en(0.86), fontSize: 74, strokeWidth: 0, shadowPreset: 'soft' },
    highlight: { boxColor: '#F43F5E', fill: solid('#FFFFFF'), scale: 1.05 },
  }),
  T('box-orange', 'Box Orange', {
    displayMode: 'box-highlight', wordsPerChunk: 3, animation: 'jolt',
    text: { sinhalaFont: 'fm-bindumathi', englishFont: 'bebas-neue', english: en(0.63), textCase: 'upper', fontSize: 72, strokeWidth: 0, shadowPreset: 'none' },
    highlight: { boxColor: '#FAC80C', fill: solid('#111111'), scale: 1.05 },
  }),
  T('karaoke-green', 'Karaoke Green', {
    displayMode: 'highlight', wordsPerChunk: 4, animation: 'fade',
    text: { sinhalaFont: 'fm-malithi', englishFont: 'lexend', english: en(1.14), fontSize: 54, strokeWidth: 0, shadowPreset: 'wideBlur' },
    highlight: { fill: solid('#39FF14'), scale: 1.06 },
  }),
  T('one-word', 'One Word', {
    displayMode: 'word-by-word', wordsPerChunk: 1, animation: 'stretch',
    text: { sinhalaFont: 'fm-derana', englishFont: 'inter', english: en(1.02), fontSize: 84, strokeWidth: 8, shadowPreset: 'strong' },
    layout: { y: 60 },
  }),
  T('two-word-clean', 'Two Words Clean', {
    displayMode: 'word-by-word', wordsPerChunk: 2, animation: 'pop',
    text: { sinhalaFont: 'noto-sans-sinhala-medium', englishFont: 'noto-sans', english: en(1), fontSize: 70, strokeWidth: 0, shadowPreset: 'wideBlur' },
  }),
  T('silver-screen', 'Silver Screen', {
    displayMode: 'highlight', wordsPerChunk: 3, animation: 'focusIn',
    text: { sinhalaFont: 'fm-abhaya-bold', englishFont: 'dm-serif-display', english: en(1.11), fontSize: 56, fill: { color: '#FFFFFF', gradient: silver }, strokeWidth: 0, shadowPreset: 'darker' },
    highlight: { fill: { color: '#FF3B3B', gradient: grad(180, '#FF8080', '#FF1F1F') } },
  }),
  T('neon-glow', 'Neon Glow', {
    displayMode: 'word-appear', wordsPerChunk: 4, animation: 'none', wordAnimation: 'focusIn',
    text: { sinhalaFont: 'fm-emanee', englishFont: 'rubik', english: en(1.16), fontSize: 56, strokeWidth: 0, shadowPreset: 'none', fill: { color: '#FF3CAC', gradient: neon }, glow: { enabled: true, matchText: true, radius: 18, strength: 1 } },
    emphasis: { fill: solid('#FFFFFF') },
  }),
  T('ice', 'Ice', {
    displayMode: 'highlight', wordsPerChunk: 3, animation: 'floatIn',
    text: { sinhalaFont: 'noto-sans-sinhala-semibold', englishFont: 'montserrat', english: en(1.01), fontSize: 60, strokeWidth: 5, strokeColor: '#06243D', shadowPreset: 'soft' },
    highlight: { fill: { color: '#5CE1FF', gradient: ice } },
  }),
  T('subtitle-plate', 'Subtitle Plate', {
    displayMode: 'natural', wordsPerChunk: 0, animation: 'fade',
    text: { sinhalaFont: 'noto-sans-sinhala-medium', englishFont: 'noto-sans', english: en(1), fontSize: 46, bold: false, strokeWidth: 0, shadowPreset: 'none', background: { enabled: true, opacity: 0.65 } },
    emphasis: { enabled: false },
    layout: { y: 86, maxWidth: 90 },
  }),
  T('typewriter', 'Typewriter', {
    displayMode: 'word-appear', wordsPerChunk: 6, animation: 'none', wordAnimation: 'typewriter',
    text: { sinhalaFont: 'fm-gemunu', englishFont: 'stick-no-bills-latin', english: en(0.9), fontSize: 58, strokeWidth: 4, shadowPreset: 'soft' },
    emphasis: { fill: solid('#7CFFB2') },
  }),
  T('cursive-bounce', 'Classic Swing', {
    displayMode: 'highlight', wordsPerChunk: 5, animation: 'swing',
    text: { sinhalaFont: 'fm-abhaya-bold', englishFont: 'abhaya-libre-latin', english: en(0.88), fontSize: 80, strokeWidth: 5, shadowPreset: 'none' },
    highlight: { fill: solid('#75FF01') },
  }),
];
