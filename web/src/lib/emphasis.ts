/**
 * Offline emphasis picker used when the AI server isn't configured.
 * Scores numbers, English loanwords inside Sinhala speech, long words and words before a pause.
 */
export function heuristicEmphasis(words: { text: string; start: number; end: number }[], ratio = 0.15): number[] {
  const STOP = new Set(['මේ', 'ඒ', 'අපි', 'මම', 'ඔයා', 'එක', 'කරන', 'තමයි', 'නම්', 'වගේ', 'හා', 'සහ', 'the', 'a', 'an', 'and', 'to', 'of', 'is', 'in', 'it']);
  const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('si', { granularity: 'grapheme' }) : null;
  const len = (s: string) => (seg ? [...seg.segment(s)].length : s.length);
  const scored = words.map((w, i) => {
    const t = w.text.replace(/[.,!?।"'“”]/g, '');
    let s = 0;
    if (!t || STOP.has(t.toLowerCase())) return { i, s: -1 };
    if (/\d/.test(t)) s += 3;
    if (/[A-Za-z]/.test(t) && /[඀-෿]/.test(words.map((x) => x.text).join(''))) s += 1.5;
    s += Math.min(3, len(t) / 3);
    const next = words[i + 1];
    if (!next || next.start - w.end > 0.35) s += 1.5;
    if (/[!?]/.test(w.text)) s += 1;
    return { i, s };
  });
  const k = Math.max(1, Math.round(words.length * ratio));
  return scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.i).sort((a, b) => a - b);
}
