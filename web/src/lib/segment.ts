import { nanoid } from 'nanoid';
import type { Caption, SegmentationOptions, Word } from '../types';

// ---- Grapheme helpers ------------------------------------------------------

type SegmenterLike = { segment(input: string): Iterable<{ segment: string }> };
let segmenter: SegmenterLike | null | undefined;

function getSegmenter(): SegmenterLike | null {
  if (segmenter === undefined) {
    const Seg = (Intl as unknown as { Segmenter?: new (loc?: string, o?: { granularity: string }) => SegmenterLike }).Segmenter;
    segmenter = Seg ? new Seg(undefined, { granularity: 'grapheme' }) : null;
  }
  return segmenter;
}

/** Split into user-perceived characters (a Sinhala syllable like ක්‍රෙ is one). */
export function graphemes(text: string): string[] {
  const seg = getSegmenter();
  if (!seg) return Array.from(text);
  return Array.from(seg.segment(text), (s) => s.segment);
}

export function graphemeLength(text: string): number {
  return graphemes(text).length;
}

// ---- Segmentation ----------------------------------------------------------

/** Sentence-ending punctuation (incl. Devanagari danda and Sinhala kunddaliya). */
const SENTENCE_END = /[.?!।॥෴…]["'”’)\]]*$/;
const SOFT_END = /[,;:，、]["'”’)\]]*$/;

const READABILITY_PAD = 0.3;

function captionChars(words: Word[]): number {
  let n = 0;
  for (const w of words) n += graphemeLength(w.text);
  return n + Math.max(0, words.length - 1); // spaces
}

function limit(v: number): number {
  return v > 0 && Number.isFinite(v) ? v : Infinity;
}

/**
 * Group words into captions honoring the segmentation options. Breaks are
 * forced by pauses and limits; when a limit forces a break, the last
 * punctuation-ended word in the second half of the chunk is preferred as the
 * break point. Sentence-ending punctuation always ends a caption; commas end
 * one when it is at least half full.
 */
export function segmentWords(words: Word[], opts: SegmentationOptions): Caption[] {
  const maxWords = limit(opts.maxWords);
  const maxChars = limit(opts.maxChars);
  const maxDuration = limit(opts.maxDuration);
  const pause = opts.splitOnPause > 0 ? opts.splitOnPause : Infinity;

  const sorted = words
    .filter((w) => w.text.trim().length > 0)
    .map((w) => ({ ...w, text: w.text.trim() }))
    .sort((a, b) => a.start - b.start);

  const groups: Word[][] = [];
  let cur: Word[] = [];

  const exceeds = (ws: Word[]): boolean =>
    ws.length > maxWords ||
    captionChars(ws) > maxChars ||
    ws[ws.length - 1].end - ws[0].start > maxDuration;

  const halfFull = (ws: Word[]): boolean =>
    ws.length >= maxWords / 2 || captionChars(ws) >= maxChars / 2 || ws[ws.length - 1].end - ws[0].start >= maxDuration / 2;

  for (const w of sorted) {
    if (cur.length && w.start - cur[cur.length - 1].end >= pause) {
      groups.push(cur);
      cur = [];
    }
    while (cur.length && exceeds([...cur, w])) {
      // Prefer breaking after punctuation in the second half of the chunk.
      let p = -1;
      for (let k = cur.length - 2; k >= Math.ceil(cur.length / 2) - 1 && k >= 0; k--) {
        if (SENTENCE_END.test(cur[k].text) || SOFT_END.test(cur[k].text)) { p = k; break; }
      }
      if (p >= 0) {
        groups.push(cur.slice(0, p + 1));
        cur = cur.slice(p + 1);
      } else {
        groups.push(cur);
        cur = [];
      }
    }
    cur.push(w);
    if (SENTENCE_END.test(w.text) || (SOFT_END.test(w.text) && halfFull(cur))) {
      groups.push(cur);
      cur = [];
    }
  }
  if (cur.length) groups.push(cur);

  const caps: Caption[] = groups
    .filter((g) => g.length > 0)
    .map((g) => ({ id: nanoid(), start: g[0].start, end: Math.max(...g.map((w) => w.end)), words: g }));

  // Extend ends slightly for readability without overlapping the next caption.
  for (let i = 0; i < caps.length; i++) {
    const next = caps[i + 1];
    const padded = caps[i].end + READABILITY_PAD;
    caps[i].end = next ? Math.max(caps[i].end, Math.min(next.start, padded)) : padded;
    if (next && caps[i].end > next.start) caps[i].end = Math.max(caps[i].start, next.start);
  }
  return caps;
}

// ---- Editing helpers -------------------------------------------------------

/** Distribute [start,end] across tokens proportionally to grapheme length. */
function distribute(tokens: string[], start: number, end: number): { text: string; start: number; end: number }[] {
  const weights = tokens.map((t) => Math.max(1, graphemeLength(t)));
  const total = weights.reduce((a, b) => a + b, 0);
  const dur = Math.max(0, end - start);
  let acc = 0;
  return tokens.map((text, i) => {
    const s = start + (dur * acc) / total;
    acc += weights[i];
    const e = start + (dur * acc) / total;
    return { text, start: round3(s), end: round3(e) };
  });
}

export function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export { distribute as distributeTokens };

/**
 * Rebuild the words of a caption after the user edited its text.
 * Same token count: keep each old word's id, timing and emphasis.
 * Otherwise: distribute times proportionally, preserving id + emphasis for
 * words whose text is unchanged.
 */
export function retimeWordsForText(oldWords: Word[], newText: string, start: number, end: number): Word[] {
  const tokens = newText.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];

  if (tokens.length === oldWords.length) {
    return tokens.map((text, i) => {
      const o = oldWords[i];
      const w: Word = { id: o.id, text, start: o.start, end: o.end };
      if (o.emphasize) w.emphasize = true;
      if (o.style) w.style = { ...o.style };
      return w;
    });
  }

  const pool = [...oldWords];
  return distribute(tokens, start, end).map((d) => {
    const idx = pool.findIndex((o) => o.text === d.text);
    const w: Word = { id: nanoid(), ...d };
    if (idx >= 0) {
      const o = pool.splice(idx, 1)[0];
      w.id = o.id;
      if (o.emphasize) w.emphasize = true;
      if (o.style) w.style = { ...o.style };
    }
    return w;
  });
}

/**
 * Split a caption at a time. Words whose midpoint is before `time` go to the
 * first part (at least one word on each side). Returns null for captions
 * with fewer than two words.
 */
export function splitCaptionAt(caption: Caption, time: number): [Caption, Caption] | null {
  const words = [...caption.words].sort((a, b) => a.start - b.start);
  if (words.length < 2) return null;
  let k = words.filter((w) => (w.start + w.end) / 2 < time).length;
  k = Math.min(words.length - 1, Math.max(1, k));
  const a = words.slice(0, k);
  const b = words.slice(k);
  let aEnd = Math.max(...a.map((w) => w.end));
  let bStart = b[0].start;
  if (time >= aEnd && time <= bStart) aEnd = bStart = time;
  const first: Caption = { ...caption, words: a, start: caption.start, end: Math.max(caption.start, aEnd) };
  const second: Caption = { ...caption, id: nanoid(), words: b, start: bStart, end: Math.max(bStart, caption.end) };
  return [first, second];
}

/** Merge two captions into one (keeps the earlier caption's id and override). */
export function mergeCaptions(a: Caption, b: Caption): Caption {
  const [first, second] = a.start <= b.start ? [a, b] : [b, a];
  return {
    ...first,
    start: Math.min(a.start, b.start),
    end: Math.max(a.end, b.end),
    words: [...first.words, ...second.words].sort((x, y) => x.start - y.start),
  };
}

/** Shift selected captions (and their words) by delta seconds, never below 0. */
export function shiftCaptions(captions: Caption[], ids: Iterable<string>, delta: number): Caption[] {
  const set = new Set(ids);
  return captions.map((c) => {
    if (!set.has(c.id)) return c;
    const d = Math.max(delta, -c.start);
    return {
      ...c,
      start: round3(c.start + d),
      end: round3(c.end + d),
      words: c.words.map((w) => ({ ...w, start: round3(w.start + d), end: round3(w.end + d) })),
    };
  });
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Sort, clamp, fix overlaps, clamp words into their caption and drop empty or
 * zero-length captions. Returns new objects; input is not mutated.
 */
export function normalizeCaptions(captions: Caption[]): Caption[] {
  const caps = captions
    .map((c) => {
      const words = c.words.filter((w) => w.text.trim()).map((w) => ({ ...w })).sort((a, b) => a.start - b.start);
      let start = Math.max(0, c.start);
      let end = Math.max(start, c.end);
      if (end - start <= 0 && words.length) {
        start = Math.max(0, Math.min(start, words[0].start));
        end = Math.max(end, ...words.map((w) => w.end));
      }
      return { ...c, start, end, words };
    })
    .filter((c) => c.words.length > 0)
    .sort((a, b) => a.start - b.start);

  for (let i = 1; i < caps.length; i++) {
    const prev = caps[i - 1];
    const c = caps[i];
    if (c.start < prev.end) {
      if (c.start > prev.start) prev.end = c.start;
      else c.start = Math.min(prev.end, c.end);
    }
  }

  return caps
    .filter((c) => c.end - c.start > 0.001)
    .map((c) => ({
      ...c,
      words: c.words.map((w) => {
        const s = clamp(w.start, c.start, c.end);
        return { ...w, start: s, end: clamp(w.end, s, c.end) };
      }),
    }));
}
