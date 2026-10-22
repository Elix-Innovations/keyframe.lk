import { nanoid } from 'nanoid';
import type { Caption, CaptionStyle, Fill, Word } from '../types';
import { fmToUnicode, unicodeToFM } from './fm';
import { distributeTokens } from './segment';

export interface Cue { start: number; end: number; text: string }

// ---- Time helpers ----------------------------------------------------------

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

function splitTime(seconds: number) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  return {
    h: Math.floor(ms / 3_600_000),
    m: Math.floor(ms / 60_000) % 60,
    s: Math.floor(ms / 1000) % 60,
    ms: ms % 1000,
  };
}

/** 3725.5 -> "01:02:05,500" */
export function formatSRTTime(seconds: number): string {
  const t = splitTime(seconds);
  return `${pad(t.h)}:${pad(t.m)}:${pad(t.s)},${pad(t.ms, 3)}`;
}

function formatVTTTime(seconds: number): string {
  return formatSRTTime(seconds).replace(',', '.');
}

/** ASS uses centiseconds: "0:01:02.50" */
function formatASSTime(seconds: number): string {
  const cs = Math.max(0, Math.round(seconds * 100));
  const h = Math.floor(cs / 360_000);
  const m = Math.floor(cs / 6000) % 60;
  const s = Math.floor(cs / 100) % 60;
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs % 100)}`;
}

/** Human clock: "1:05", "1:05.3", "1:02:05". */
export function formatClock(seconds: number, withTenths = false): string {
  const v = Math.max(0, seconds);
  const tenthsTotal = Math.floor(v * 10 + 1e-6);
  const whole = Math.floor(tenthsTotal / 10);
  const h = Math.floor(whole / 3600);
  const m = Math.floor(whole / 60) % 60;
  const s = whole % 60;
  const base = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  return withTenths ? `${base}.${tenthsTotal % 10}` : base;
}

/** Parse "hh:mm:ss,mmm", "mm:ss.mmm", "h:mm:ss.cc" etc. Returns NaN on failure. */
function parseTime(str: string): number {
  const m = /^\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?\s*$/.exec(str);
  if (!m) return NaN;
  const frac = m[4] ? Number(m[4]) / 10 ** m[4].length : 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + frac;
}

// ---- Parsing ---------------------------------------------------------------

function cleanText(lines: string[]): string {
  return lines
    .join(' ')
    .replace(/\{\\[^}]*\}/g, '') // ASS override blocks
    .replace(/<[^>]+>/g, '') // HTML / VTT tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeInput(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

const ARROW_RE = /^\s*([\d:.,]+)\s*-->\s*([\d:.,]+)/;

/** Parse SRT (also tolerates WebVTT). */
export function parseSRT(text: string): Cue[] {
  const lines = normalizeInput(text).split('\n');
  const cues: Cue[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = ARROW_RE.exec(lines[i]);
    if (!m) { i++; continue; }
    const start = parseTime(m[1]);
    const end = parseTime(m[2]);
    i++;
    const body: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !ARROW_RE.test(lines[i])) {
      body.push(lines[i]);
      i++;
    }
    // A bare index line right before the next arrow line belongs to the next cue.
    if (i < lines.length && ARROW_RE.test(lines[i]) && body.length && /^\d+$/.test(body[body.length - 1].trim())) {
      body.pop();
    }
    const t = cleanText(body);
    if (Number.isFinite(start) && Number.isFinite(end) && t) {
      cues.push({ start, end: Math.max(start, end), text: t });
    }
  }
  return cues;
}

export const parseVTT = parseSRT;

/** Parse ASS/SSA "Dialogue:" lines using the [Events] Format line. */
export function parseASS(text: string): Cue[] {
  const lines = normalizeInput(text).split('\n');
  let fields = ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
  let inEvents = false;
  const cues: Cue[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (/^\[.*\]$/.test(line)) { inEvents = /^\[events\]$/i.test(line); continue; }
    if (inEvents && /^format\s*:/i.test(line)) {
      fields = line.replace(/^format\s*:/i, '').split(',').map((f) => f.trim().toLowerCase());
      continue;
    }
    if (!/^dialogue\s*:/i.test(line)) continue;
    const parts = line.replace(/^dialogue\s*:/i, '').split(',');
    const textIdx = fields.indexOf('text');
    const head = parts.slice(0, textIdx);
    const body = parts.slice(textIdx).join(',');
    const start = parseTime(head[fields.indexOf('start')] ?? '');
    const end = parseTime(head[fields.indexOf('end')] ?? '');
    const t = cleanText([body.replace(/\\[Nn]/g, ' ').replace(/\\h/g, ' ')]);
    if (Number.isFinite(start) && Number.isFinite(end) && t) cues.push({ start, end: Math.max(start, end), text: t });
  }
  return cues.sort((a, b) => a.start - b.start);
}

/** Detect the format (SRT / VTT / ASS / SSA) and parse. */
export function parseSubtitles(text: string): Cue[] {
  const t = normalizeInput(text);
  if (/^\s*\[script info\]/im.test(t) || /^dialogue\s*:/im.test(t)) return parseASS(t);
  return parseSRT(t);
}

/**
 * Convert cues to words + captions. Word timings are distributed across each
 * cue proportionally to grapheme length.
 */
export function cuesToCaptions(cues: Cue[], opts: { legacyFM?: boolean } = {}): { words: Word[]; captions: Caption[] } {
  const words: Word[] = [];
  const captions: Caption[] = [];
  for (const cue of cues) {
    const text = opts.legacyFM ? fmToUnicode(cue.text) : cue.text;
    const tokens = text.split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const cw: Word[] = distributeTokens(tokens, cue.start, cue.end).map((d) => ({ id: nanoid(), ...d }));
    words.push(...cw);
    captions.push({ id: nanoid(), start: cue.start, end: cue.end, words: cw });
  }
  return { words, captions };
}

// ---- Export ----------------------------------------------------------------

function captionText(c: Caption): string {
  return c.words.map((w) => w.text).join(' ');
}

export function wordsToPlainText(captions: Caption[]): string {
  return captions.map(captionText).join('\n');
}

export function captionsToSRT(captions: Caption[], opts: { legacyFM?: boolean } = {}): string {
  return captions
    .map((c, i) => {
      const t = captionText(c);
      return `${i + 1}\n${formatSRTTime(c.start)} --> ${formatSRTTime(c.end)}\n${opts.legacyFM ? unicodeToFM(t) : t}\n`;
    })
    .join('\n');
}

export function captionsToVTT(captions: Caption[]): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return (
    'WEBVTT\n\n' +
    captions.map((c) => `${formatVTTTime(c.start)} --> ${formatVTTTime(c.end)}\n${esc(captionText(c))}\n`).join('\n')
  );
}

/** CSS hex (#rgb, #rrggbb, #rrggbbaa) + opacity 0..1 -> ASS "&HAABBGGRR". */
export function toASSColor(hex: string, opacity = 1): string {
  let h = hex.replace('#', '').trim();
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  const a = h.length >= 8 ? (parseInt(h.slice(6, 8), 16) / 255) * opacity : opacity;
  const alpha = 255 - Math.round(Math.min(1, Math.max(0, a)) * 255);
  const x = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');
  return `&H${x(alpha)}${x(b)}${x(g)}${x(r)}`;
}

/** Inline colour override needs "&HBBGGRR&". */
function inlineColor(hex: string): string {
  return `&H${toASSColor(hex).slice(4)}&`;
}

function fillColor(fill: Fill): string {
  return fill.gradient?.stops[0]?.color ?? fill.color;
}

function escapeASS(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\{/g, '(').replace(/\}/g, ')');
}

/**
 * Export ASS. Font/colour/outline/shadow/position come from the style.
 * Display modes are baked so the look survives in players:
 *  - natural: one event per caption
 *  - highlight / box-highlight: one event per word with the active word recoloured
 *  - word-by-word / compact-emphasis: one event per chunk of `wordsPerChunk` words
 *  - word-appear: one event per word showing the words so far
 * `fontFamily` overrides the font name (style fonts are catalog ids).
 */
export function captionsToASS(
  captions: Caption[],
  style: CaptionStyle,
  size: { width: number; height: number },
  opts: { fontFamily?: string } = {},
): string {
  const t = style.text;
  const scale = size.width / 1080;
  const L = style.layout;

  const vBand = L.y < 33 ? 7 : L.y < 67 ? 4 : 1;
  const hOff = L.align === 'left' ? 0 : L.align === 'center' ? 1 : 2;
  const an = vBand + hOff;
  const px =
    L.align === 'left' ? L.x - L.maxWidth / 2 : L.align === 'right' ? L.x + L.maxWidth / 2 : L.x;
  const posX = Math.round((px / 100) * size.width);
  const posY = Math.round((L.y / 100) * size.height);
  const margin = Math.max(0, Math.round((((100 - L.maxWidth) / 2) / 100) * size.width));

  const bg = t.background;
  const hasShadow = t.shadowPreset !== 'none';
  const primary = toASSColor(fillColor(t.fill), t.opacity);
  const outlineCol = bg.enabled ? toASSColor(bg.color, bg.opacity) : toASSColor(t.strokeColor, t.opacity);
  const backCol = toASSColor(t.shadow.color, hasShadow ? t.shadow.opacity : 0);
  const outline = bg.enabled ? Math.round(Math.max(bg.padX, bg.padY) * scale) : +(t.strokeWidth * scale).toFixed(1);
  const shadow = hasShadow ? +Math.max(1, Math.hypot(t.shadow.offsetX, t.shadow.offsetY) * scale).toFixed(1) : 0;
  const fontName = (opts.fontFamily ?? t.sinhalaFont).replace(/,/g, ' ');

  const styleLine = [
    'Default', fontName, Math.round(t.fontSize * scale), primary, primary, outlineCol, backCol,
    t.bold ? -1 : 0, t.italic ? -1 : 0, 0, 0, 100, 100, +(t.letterSpacing * scale).toFixed(1), 0,
    bg.enabled ? 3 : 1, outline, shadow, an, margin, margin, 0, 1,
  ].join(',');

  const header = [
    '[Script Info]',
    '; Generated by Keyframe.lk',
    'ScriptType: v4.00+',
    `PlayResX: ${size.width}`,
    `PlayResY: ${size.height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: None',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: ${styleLine}`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  // layout.x/y is the caption centre, so anchor events at the vertical middle.
  const pos = `{\\an${4 + hOff}\\pos(${posX},${posY})}`;
  const emph = style.emphasis;
  const wordText = (w: Word) => escapeASS(t.uppercaseEnglish ? w.text.toUpperCase() : w.text);
  const plainWord = (w: Word) =>
    emph.enabled && w.emphasize
      ? `{\\c${inlineColor(fillColor(emph.fill))}${emph.bold ? '\\b1' : ''}${emph.scale !== 1 ? `\\fscx${Math.round(emph.scale * 100)}\\fscy${Math.round(emph.scale * 100)}` : ''}}${wordText(w)}{\\r}`
      : wordText(w);
  const activeWord = (w: Word) => {
    const hl = style.highlight;
    const sc = hl.scale !== 1 ? `\\fscx${Math.round(hl.scale * 100)}\\fscy${Math.round(hl.scale * 100)}` : '';
    const box =
      style.displayMode === 'box-highlight'
        ? `\\3c${inlineColor(hl.boxColor)}\\3a&H00&\\bord${Math.max(2, Math.round(hl.boxPadding * scale))}`
        : '';
    return `{\\c${inlineColor(fillColor(hl.fill))}${box}${sc}}${wordText(w)}{\\r}`;
  };

  const events: string[] = [];
  const push = (start: number, end: number, text: string) => {
    if (end - start <= 0 || !text) return;
    events.push(`Dialogue: 0,${formatASSTime(start)},${formatASSTime(end)},Default,,0,0,0,,${pos}${text}`);
  };

  for (const c of captions) {
    const ws = [...c.words].sort((a, b) => a.start - b.start);
    if (!ws.length) continue;
    // Each word is "active" until the next word starts (last one until caption end).
    const until = (i: number) => (i + 1 < ws.length ? ws[i + 1].start : c.end);
    const firstStart = c.start;

    switch (style.displayMode) {
      case 'highlight':
      case 'box-highlight': {
        const n = style.wordsPerChunk > 0 ? style.wordsPerChunk : ws.length;
        for (let i = 0; i < ws.length; i++) {
          const chunkStart = Math.floor(i / n) * n;
          const chunk = ws.slice(chunkStart, chunkStart + n);
          const s = i === 0 ? firstStart : ws[i].start;
          push(s, until(i), chunk.map((w) => (w === ws[i] ? activeWord(w) : plainWord(w))).join(' '));
        }
        break;
      }
      case 'word-by-word':
      case 'compact-emphasis': {
        const n = style.wordsPerChunk > 0 ? style.wordsPerChunk : ws.length;
        for (let i = 0; i < ws.length; i += n) {
          const s = i === 0 ? firstStart : ws[i].start;
          push(s, until(Math.min(ws.length, i + n) - 1), ws.slice(i, i + n).map(plainWord).join(' '));
        }
        break;
      }
      case 'word-appear': {
        for (let i = 0; i < ws.length; i++) {
          const s = i === 0 ? firstStart : ws[i].start;
          push(s, until(i), ws.slice(0, i + 1).map(plainWord).join(' '));
        }
        break;
      }
      default:
        push(c.start, c.end, ws.map(plainWord).join(' '));
    }
  }

  return header.join('\n') + '\n' + events.join('\n') + '\n';
}
