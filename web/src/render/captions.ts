import type {
  Caption, CaptionStyle, Fill, FontDef, Glow, Script, Shadow, TextCase, TextHook, TextLook, Word, WordStyle,
} from '../types';
import { cssFamily, getFont } from '../lib/fonts';
import { SHADOW_PRESETS, merge } from '../lib/style';
import { unicodeToFM } from '../lib/fm';
import { animate, combine, IDENTITY, type AnimState } from './animations';
import { fmPieces, type Piece } from './fmShape';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface Rect { x: number; y: number; w: number; h: number }

/** Resolved look for one script run of one word. */
interface RunLook {
  font: FontDef;
  cssFont: string;
  size: number;
  fill: Fill;
  strokeWidth: number;
  strokeColor: string;
  shadow: Shadow & { passes: number };
  glow: Glow;
  letterSpacing: number;
}

interface Run { text: string; look: RunLook; width: number; ascent: number; descent: number; pieces?: Piece[] | null }

interface WordBox {
  word: Word;
  index: number; // index within chunk
  runs: Run[];
  width: number;
  ascent: number;
  descent: number;
  size: number;
  emphasized: boolean;
  forceOwnLine: boolean;
  x: number; // left, device px
  baseline: number;
  line: number;
}

const SINHALA_RE = /[඀-෿‌‍]+|[^඀-෿‌‍]+/g;
const IS_SINHALA = /[඀-෿]/;

const measureCache = new Map<string, { width: number; ascent: number; descent: number }>();

function setLetterSpacing(ctx: Ctx2D, px: number) {
  const c = ctx as Ctx2D & { letterSpacing?: string };
  if ('letterSpacing' in c) c.letterSpacing = `${px}px`;
}

function measure(ctx: Ctx2D, cssFont: string, letterSpacing: number, text: string) {
  const key = `${cssFont}|${letterSpacing}|${text}`;
  let m = measureCache.get(key);
  if (!m) {
    ctx.font = cssFont;
    setLetterSpacing(ctx, letterSpacing);
    const tm = ctx.measureText(text);
    m = {
      width: tm.width,
      ascent: tm.fontBoundingBoxAscent ?? tm.actualBoundingBoxAscent,
      descent: tm.fontBoundingBoxDescent ?? tm.actualBoundingBoxDescent,
    };
    if (measureCache.size > 5000) measureCache.clear();
    measureCache.set(key, m);
  }
  return m;
}

/** Call when fonts finish loading so stale fallback metrics are dropped. */
export function clearMeasureCache() {
  measureCache.clear();
}

function weightFor(font: FontDef, bold: boolean) {
  // Black / ExtraBold catalog entries have no 400 face: use their own weight even when "bold" is off, or the sibling regular face would show.
  if (!bold) return font.weights && font.weights.length && !font.weights.includes(400) ? Math.min(...font.weights) : 400;
  if (font.boldWeight) return font.boldWeight;
  const ws = font.weights;
  if (!ws || ws.length === 0) return 700;
  return ws.includes(700) ? 700 : Math.max(...ws);
}

function resolveLook(
  text: TextLook,
  script: Script,
  refScale: number,
  sizeMul: number,
  opts: { emphasized: boolean; style: CaptionStyle; word?: WordStyle },
): RunLook {
  const o = script === 'sinhala' ? text.sinhala : text.english;
  const em = opts.emphasized && opts.style.emphasis.enabled ? opts.style.emphasis : null;
  const wf = opts.word?.font ? getFont(opts.word.font) : null;
  const wordFont = wf && wf.id === opts.word!.font && (wf.script === script || wf.script === 'both') ? wf.id : null;
  const fontId = wordFont || (em && (script === 'sinhala' ? em.sinhalaFont : em.englishFont)) || o.fontFamily ||
    (script === 'sinhala' ? text.sinhalaFont : text.englishFont);
  const font = getFont(fontId);
  const bold = opts.word?.bold ?? (em?.bold || (o.bold ?? text.bold));
  const italic = o.italic ?? text.italic;
  const size = text.fontSize * refScale * sizeMul * (o.sizeScale ?? 1);
  const presetName = o.shadowPreset ?? text.shadowPreset;
  const preset = SHADOW_PRESETS[presetName];
  const shadow = { ...preset, ...(o.shadow ?? {}), passes: preset.passes };
  return {
    font,
    cssFont: `${italic ? 'italic ' : ''}${weightFor(font, bold)} ${size.toFixed(2)}px ${cssFamily(font)}`,
    size,
    fill: opts.word?.color ? { color: opts.word.color, gradient: null } : em ? em.fill : o.fill ?? text.fill,
    strokeWidth: (o.strokeWidth ?? text.strokeWidth) * refScale,
    strokeColor: o.strokeColor ?? text.strokeColor,
    shadow,
    glow: o.glow ?? text.glow,
    letterSpacing: (o.letterSpacing ?? text.letterSpacing) * refScale,
  };
}

export function applyCase(raw: string, c: TextCase): string {
  if (c === 'upper') return raw.toUpperCase();
  if (c === 'lower') return raw.toLowerCase();
  if (c === 'title') return raw.toLowerCase().replace(/(^|[^A-Za-z'’])([a-z])/g, (_, a, b) => a + b.toUpperCase());
  return raw;
}

function displayText(raw: string, script: Script, look: RunLook, text: TextLook, word?: WordStyle) {
  if (script === 'sinhala') return look.font.legacy ? unicodeToFM(raw) : raw;
  return applyCase(raw, word?.textCase ?? text.textCase ?? (text.uppercaseEnglish ? 'upper' : 'none'));
}

function buildWord(ctx: Ctx2D, word: Word, index: number, style: CaptionStyle, refScale: number): WordBox {
  const emphasized = !!word.emphasize && style.emphasis.enabled;
  const sizeMul = (emphasized ? style.emphasis.scale : 1) * (word.style?.scale ?? 1);
  const runs: Run[] = [];
  let width = 0, ascent = 0, descent = 0;
  for (const part of word.text.match(SINHALA_RE) ?? []) {
    const script: Script = IS_SINHALA.test(part) ? 'sinhala' : 'english';
    const look = resolveLook(style.text, script, refScale, sizeMul, { emphasized, style, word: word.style });
    const text = displayText(part, script, look, style.text, word.style);
    const m = measure(ctx, look.cssFont, look.letterSpacing, text);
    runs.push({ text, look, width: m.width, ascent: m.ascent, descent: m.descent });
    width += m.width;
    ascent = Math.max(ascent, m.ascent);
    descent = Math.max(descent, m.descent);
  }
  const size = style.text.fontSize * refScale * sizeMul;
  return {
    word, index, runs, width, ascent, descent, size, emphasized,
    forceOwnLine: emphasized && style.displayMode === 'compact-emphasis',
    x: 0, baseline: 0, line: 0,
  };
}

// ---------- paint helpers ----------

function makePaint(ctx: Ctx2D, fill: Fill, box: Rect): string | CanvasGradient {
  if (!fill.gradient || fill.gradient.stops.length < 2) return fill.color;
  const a = (fill.gradient.angle * Math.PI) / 180;
  const dx = Math.sin(a), dy = -Math.cos(a);
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const L = Math.abs((box.w / 2) * dx) + Math.abs((box.h / 2) * dy);
  const g = ctx.createLinearGradient(cx - dx * L, cy - dy * L, cx + dx * L, cy + dy * L);
  for (const s of fill.gradient.stops) g.addColorStop(Math.min(1, Math.max(0, s.position)), s.color);
  return g;
}

function hexA(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function roundRect(ctx: Ctx2D, r: Rect, radius: number) {
  const rad = Math.max(0, Math.min(radius, r.w / 2, r.h / 2));
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, rad);
}

const FAR = 100000;

/** Draw one run at (x, baseline) in the current transform. `scale` is the current device scale factor. */
function drawRun(ctx: Ctx2D, run: Run, x: number, baseline: number, fillOverride: Fill | null, scale: number, alpha: number) {
  const L = run.look;
  ctx.font = L.cssFont;
  setLetterSpacing(ctx, L.letterSpacing);
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const box: Rect = { x, y: baseline - run.ascent, w: run.width, h: run.ascent + run.descent };
  const fill = fillOverride ?? L.fill;
  const paint = makePaint(ctx, fill, box);
  const stroke = L.strokeWidth > 0;
  // FM fonts can't position their own vowel signs; draw those as separate, repositioned pieces.
  if (L.font.legacy && run.pieces === undefined) run.pieces = fmPieces(ctx, cssFamily(L.font), run.text);
  const pieces = run.pieces;
  const draw = (op: 'fillText' | 'strokeText', px: number, py: number) => {
    if (!pieces) { ctx[op](run.text, px, py); return; }
    for (const p of pieces) ctx[op](p.text, px + p.dx, py + p.dy * L.size);
  };

  // Shadow: draw the glyphs far off-canvas and cast only their shadow back into place.
  if (L.shadow.passes > 0 && L.shadow.opacity > 0) {
    ctx.save();
    ctx.shadowColor = hexA(L.shadow.color, L.shadow.opacity * alpha);
    ctx.shadowBlur = L.shadow.blur * (L.size / 64) * scale;
    ctx.shadowOffsetX = FAR * scale + L.shadow.offsetX * (L.size / 64) * scale;
    ctx.shadowOffsetY = L.shadow.offsetY * (L.size / 64) * scale;
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = L.strokeWidth * 2;
    for (let i = 0; i < L.shadow.passes; i++) {
      if (stroke) draw('strokeText', x - FAR, baseline);
      draw('fillText', x - FAR, baseline);
    }
    ctx.restore();
  }

  if (L.glow.enabled && L.glow.strength > 0) {
    ctx.save();
    const glowColor = L.glow.matchText ? fill.gradient?.stops[Math.floor(fill.gradient.stops.length / 2)]?.color ?? fill.color : L.glow.color;
    ctx.shadowColor = hexA(glowColor, Math.min(1, L.glow.strength) * alpha);
    ctx.shadowBlur = L.glow.radius * (L.size / 64) * scale * 1.5;
    ctx.fillStyle = paint;
    const passes = L.glow.strength > 0.75 ? 2 : 1;
    for (let i = 0; i < passes; i++) draw('fillText', x, baseline);
    ctx.restore();
  }

  if (stroke) {
    ctx.strokeStyle = L.strokeColor;
    ctx.lineWidth = L.strokeWidth * 2;
    draw('strokeText', x, baseline);
  }
  ctx.fillStyle = paint;
  draw('fillText', x, baseline);
}

// ---------- chunking ----------

export function chunkWords(words: Word[], n: number): Word[][] {
  if (n <= 0 || words.length <= n) return [words];
  const out: Word[][] = [];
  for (let i = 0; i < words.length; i += n) out.push(words.slice(i, i + n));
  return out;
}

export function findCaptionAt(captions: Caption[], t: number): Caption | null {
  // captions are kept sorted; binary search for the last caption starting <= t
  let lo = 0, hi = captions.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (captions[mid].start <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (idx < 0) return null;
  const c = captions[idx];
  return t < c.end ? c : null;
}

export interface CaptionRenderResult { bbox: Rect | null; captionId: string | null }

/**
 * Draw the caption active at time `t`. Used by both the live preview and the exporter,
 * so the preview is pixel-identical to the exported video.
 */
export function renderCaptionAt(
  ctx: Ctx2D, W: number, H: number, captions: Caption[], baseStyle: CaptionStyle, t: number,
): CaptionRenderResult {
  const caption = findCaptionAt(captions, t);
  if (!caption || caption.words.length === 0) return { bbox: null, captionId: null };
  const style = caption.styleOverride ? merge(baseStyle, caption.styleOverride) : baseStyle;
  const refScale = Math.min(W, H) / 1080;
  const mode = style.displayMode;

  // Pick the chunk being spoken.
  const perChunk = mode === 'natural' ? 0 : style.wordsPerChunk;
  const chunks = chunkWords(caption.words, perChunk);
  let ci = 0;
  for (let i = 0; i < chunks.length; i++) if (chunks[i][0].start <= t) ci = i;
  const chunk = chunks[ci];
  const chunkStart = ci === 0 ? caption.start : chunk[0].start;
  const chunkAnim = animate(style.animation, t - chunkStart, style.animationSpeed);

  // Active word: last word that has started (stays lit through short gaps).
  let active = -1;
  for (let i = 0; i < chunk.length; i++) if (chunk[i].start <= t) active = i;

  const progressive = mode === 'word-appear' || mode === 'compact-emphasis';

  // ---- layout ----
  const boxes = chunk.map((w, i) => buildWord(ctx, w, i, style, refScale));
  const base = resolveLook(style.text, 'sinhala', refScale, 1, { emphasized: false, style });
  const spaceW = Math.max(measure(ctx, base.cssFont, 0, ' ').width * 1.1, base.size * 0.3) * (style.text.wordSpacing ?? 1) +
    (mode === 'box-highlight' ? style.highlight.boxPadding * 2 * refScale : 0);
  const maxW = (style.layout.maxWidth / 100) * W;

  const lines: WordBox[][] = [];
  let cur: WordBox[] = [], curW = 0;
  for (const b of boxes) {
    const need = cur.length ? curW + spaceW + b.width : b.width;
    if (cur.length && (b.forceOwnLine || cur[cur.length - 1].forceOwnLine || need > maxW)) {
      lines.push(cur);
      cur = [b];
      curW = b.width;
    } else {
      cur.push(b);
      curW = need;
    }
  }
  if (cur.length) lines.push(cur);

  const lineMetrics = lines.map((ln) => {
    const width = ln.reduce((s, b) => s + b.width, 0) + spaceW * (ln.length - 1);
    const ascent = Math.max(...ln.map((b) => b.ascent));
    const descent = Math.max(...ln.map((b) => b.descent));
    const size = Math.max(...ln.map((b) => b.size));
    return { width, ascent, descent, height: Math.max(ascent + descent, size * style.text.lineHeight) };
  });
  const blockW = Math.max(...lineMetrics.map((m) => m.width));
  const blockH = lineMetrics.reduce((s, m) => s + m.height, 0);

  // Keep the block inside a safe area even if the user dragged it near an edge.
  const margin = 0.03 * Math.min(W, H);
  let cx = (style.layout.x / 100) * W;
  let cy = (style.layout.y / 100) * H;
  cx = Math.min(Math.max(cx, margin + blockW / 2), W - margin - blockW / 2);
  cy = Math.min(Math.max(cy, margin + blockH / 2), H - margin - blockH / 2);
  const left = cx - blockW / 2;
  let y = cy - blockH / 2;
  lines.forEach((ln, li) => {
    const m = lineMetrics[li];
    const baseline = y + (m.height - (m.ascent + m.descent)) / 2 + m.ascent;
    let x = style.layout.align === 'left' ? left : style.layout.align === 'right' ? left + blockW - m.width : cx - m.width / 2;
    for (const b of ln) {
      b.x = x;
      b.baseline = baseline;
      b.line = li;
      x += b.width + spaceW;
    }
    y += m.height;
  });
  const bbox: Rect = { x: cx - blockW / 2, y: cy - blockH / 2, w: blockW, h: blockH };

  // ---- paint ----
  ctx.save();
  ctx.globalAlpha = style.text.opacity;
  const blockCx = bbox.x + bbox.w / 2, blockCy = bbox.y + bbox.h / 2;
  applyTransform(ctx, chunkAnim, blockCx, blockCy, base.size);

  const bg = style.text.background;
  if (bg.enabled) {
    ctx.save();
    ctx.globalAlpha *= bg.opacity * chunkAnim.alpha;
    ctx.fillStyle = bg.color;
    roundRect(ctx, {
      x: bbox.x - bg.padX * refScale, y: bbox.y - bg.padY * refScale,
      w: bbox.w + bg.padX * 2 * refScale, h: bbox.h + bg.padY * 2 * refScale,
    }, bg.radius * refScale);
    ctx.fill();
    ctx.restore();
  }

  // Box highlight slides from the previous word to the active one.
  if (mode === 'box-highlight' && active >= 0) {
    const pad = style.highlight.boxPadding * refScale;
    const rectOf = (b: WordBox): Rect => ({ x: b.x - pad, y: b.baseline - b.ascent * 0.92 - pad * 0.5, w: b.width + pad * 2, h: (b.ascent + b.descent) * 0.92 + pad });
    const curB = boxes[active];
    let r = rectOf(curB);
    const prev = active > 0 ? boxes[active - 1] : null;
    const p = Math.min(1, (t - curB.word.start) / (0.12 / style.animationSpeed));
    if (prev && prev.line === curB.line && p < 1) {
      const a = rectOf(prev), e = 1 - Math.pow(1 - p, 3);
      r = { x: a.x + (r.x - a.x) * e, y: a.y + (r.y - a.y) * e, w: a.w + (r.w - a.w) * e, h: a.h + (r.h - a.h) * e };
    }
    ctx.save();
    ctx.globalAlpha *= chunkAnim.alpha;
    ctx.fillStyle = style.highlight.boxColor;
    roundRect(ctx, r, style.highlight.boxRadius * refScale);
    ctx.fill();
    ctx.restore();
  }

  for (const b of boxes) {
    if (progressive && b.word.start > t) continue; // not spoken yet
    let anim: AnimState = IDENTITY;
    if (progressive) anim = animate(style.wordAnimation, t - b.word.start, style.animationSpeed);
    const isActive = b.index === active && (mode === 'highlight' || mode === 'box-highlight');
    if (isActive && style.highlight.scale !== 1) {
      const p = Math.min(1, (t - b.word.start) / 0.1);
      anim = combine(anim, { ...IDENTITY, scale: 1 + (style.highlight.scale - 1) * p });
    }
    const fillOverride = isActive ? style.highlight.fill : null;
    ctx.save();
    const wcx = b.x + b.width / 2, wcy = b.baseline - b.ascent / 2 + b.descent / 2;
    applyTransform(ctx, anim, wcx, wcy, b.size);
    const alpha = chunkAnim.alpha * anim.alpha;
    ctx.globalAlpha *= anim.alpha;
    if (anim.reveal < 1 || chunkAnim.reveal < 1) {
      const rv = Math.min(anim.reveal, chunkAnim.reveal);
      ctx.beginPath();
      ctx.rect(b.x - b.size, b.baseline - b.ascent - b.size, b.size + b.width * rv, b.ascent + b.descent + b.size * 2);
      ctx.clip();
    }
    const scale = ctx.getTransform().a;
    let x = b.x;
    for (const run of b.runs) {
      drawRun(ctx, run, x, b.baseline, fillOverride, scale, alpha);
      x += run.width;
    }
    ctx.restore();
  }
  ctx.restore();
  return { bbox, captionId: caption.id };
}

function applyTransform(ctx: Ctx2D, a: AnimState, cx: number, cy: number, em: number) {
  if (a === IDENTITY) return;
  ctx.globalAlpha *= a.alpha;
  ctx.translate(cx + a.dx * em, cy + a.dy * em);
  if (a.rot) ctx.rotate(a.rot);
  if (a.scale !== 1 || a.sx !== 1 || a.sy !== 1) ctx.scale(a.scale * a.sx, a.scale * a.sy);
  ctx.translate(-cx, -cy);
  if (a.blur > 0.002 && 'filter' in ctx) ctx.filter = `blur(${(a.blur * em).toFixed(2)}px)`;
}

// ---------- text hook ----------

export const HOOK_TEMPLATES: { id: TextHook['template']; label: string }[] = [
  { id: 'bold', label: 'Bold' },
  { id: 'pop', label: 'Pop' },
  { id: 'box', label: 'Box' },
  { id: 'outline', label: 'Outline' },
  { id: 'minimal', label: 'Minimal' },
];

export function renderHook(ctx: Ctx2D, W: number, H: number, hook: TextHook, style: CaptionStyle, t: number) {
  if (!hook.enabled || !hook.text.trim() || t < hook.start || t >= hook.end) return;
  const refScale = Math.min(W, H) / 1080;
  const tpl = hook.template;
  const size = (tpl === 'minimal' ? 52 : 70) * refScale;
  const sinFont = getFont(style.text.sinhalaFont);
  const enFont = getFont(style.text.englishFont);
  const family = `${cssFamily(enFont)}, ${cssFamily(sinFont)}`;
  const cssFont = `${tpl === 'minimal' ? 600 : 800} ${size}px ${family}`;
  ctx.save();
  ctx.font = cssFont;
  setLetterSpacing(ctx, 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  // wrap
  const maxW = W * 0.84;
  const words = hook.text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(test).width > maxW) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  const lh = size * 1.25;
  const cx = W / 2;
  const cy = (hook.y / 100) * H;
  const a = animate(tpl === 'minimal' ? 'fade' : 'springPop', t - hook.start, 1);
  const out = Math.min(1, Math.max(0, (hook.end - t) / 0.25));
  ctx.globalAlpha = a.alpha * out;
  ctx.translate(cx, cy);
  ctx.scale(a.scale, a.scale);
  ctx.translate(-cx, -cy);

  const top = cy - (lines.length * lh) / 2 + lh / 2;
  lines.forEach((ln, i) => {
    const y = top + i * lh;
    const w = ctx.measureText(ln).width;
    if (tpl === 'pop' || tpl === 'box') {
      ctx.fillStyle = tpl === 'pop' ? '#FFD400' : '#FFFFFF';
      roundRect(ctx, { x: cx - w / 2 - 22 * refScale, y: y - lh / 2 + 4 * refScale, w: w + 44 * refScale, h: lh - 8 * refScale }, 16 * refScale);
      ctx.fill();
      ctx.fillStyle = '#111111';
      ctx.fillText(ln, cx, y);
    } else if (tpl === 'outline') {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 5 * refScale;
      ctx.strokeText(ln, cx, y);
    } else {
      if (tpl === 'bold') {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 12 * refScale;
        ctx.strokeText(ln, cx, y);
      } else {
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 12 * refScale;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(ln, cx, y);
      ctx.shadowColor = 'transparent';
    }
  });
  ctx.restore();
}
