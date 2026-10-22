import type { AnimKey } from '../../types';
import type { AepFile, AepText } from './aep';
import { animFromTracks } from './keys';

export interface AepMotion {
  letterIn?: AnimKey[]; letterOut?: AnimKey[]; lineIn?: AnimKey[]; lineOut?: AnimKey[];
  /** Seconds between letters. */
  perLetter: number;
  notes: string[];
}

const REST: Omit<AnimKey, 't' | 'ease'> = { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, sx: 1, sy: 1, blur: 0 };
/** How many characters a typical line has, to turn "the selector sweeps in D seconds" into a delay per letter. */
const TYPICAL_LETTERS = 12;

interface State { alpha: number; dx: number; dy: number; scale: number; rot: number; blur: number }
const rest = (): State => ({ alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, blur: 0 });
const key = (t: number, s: State, ease: AnimKey['ease']): AnimKey => ({ ...REST, ...s, t: Number(t.toFixed(3)), ease });

/**
 * Turn a text layer's animators into per-letter and whole-line keyframes.
 * An animator with a keyframed selector offset sweeps across the characters: when the offset moves away from 0 the
 * characters leave the animated state (an entrance), when it moves towards 0 they enter it (an exit). Each character's
 * own change is a short move between the animated state and rest; the sweep time sets the delay between characters.
 * `fontPx` is the type size in the project's own pixels, so position offsets become em.
 */
export function motionFromAep(file: AepFile, fontPx: number): AepMotion {
  const notes: string[] = [];
  const text = file.texts.find((t) => t.animators.some((a) => a.offset || a.positionKeys)) ?? file.texts[0] ?? { animators: [], start: 0, tracks: [] };
  const stateOf = (a: AepText['animators'][number]): State => ({
    alpha: a.opacity !== undefined ? a.opacity / 100 : 1,
    dx: a.position ? a.position[0] / fontPx : 0, dy: a.position ? a.position[1] / fontPx : 0,
    scale: a.scale !== undefined ? a.scale / 100 : 1,
    rot: ((a.rotation ?? 0) * Math.PI) / 180, blur: (a.blur ?? 0) / fontPx,
  });
  const merge = (into: State, s: State) => { into.alpha *= s.alpha; into.dx += s.dx; into.dy += s.dy; into.scale *= s.scale; into.rot += s.rot; into.blur += s.blur; };
  const isRest = (s: State) => s.alpha === 1 && !s.dx && !s.dy && s.scale === 1 && !s.rot && !s.blur;

  const sIn = rest(), sOut = rest();
  let inWin: [number, number] | null = null, outWin: [number, number] | null = null;
  let width = 1;
  for (const a of text.animators) {
    if (!a.offset) continue;
    const s = stateOf(a);
    if (isRest(s)) continue;
    const first = a.offset[0], last = a.offset[a.offset.length - 1];
    const leaving = Math.abs(last.v) >= Math.abs(first.v);
    const win: [number, number] = [first.t, last.t];
    width = Math.min(width, Math.max(0.2, (a.end - a.start) / 100));
    if (leaving) { merge(sIn, s); inWin = inWin ? [Math.min(inWin[0], win[0]), Math.max(inWin[1], win[1])] : win; }
    else { merge(sOut, s); outWin = outWin ? [Math.min(outWin[0], win[0]), Math.max(outWin[1], win[1])] : win; }
  }

  const m: AepMotion = { perLetter: 0.04, notes };
  const letterDur = (w: [number, number]) => Math.min(0.7, Math.max(0.2, (w[1] - w[0]) * 0.55));
  if (inWin) {
    m.letterIn = [key(0, sIn, 'easeOut'), key(letterDur(inWin), rest(), 'easeOut')];
    m.perLetter = Math.min(0.12, Math.max(0.012, ((inWin[1] - inWin[0]) * (1 - width * 0.5)) / TYPICAL_LETTERS));
  }
  if (outWin) {
    m.letterOut = [key(0, sOut, 'easeIn'), key(letterDur(outWin), rest(), 'easeIn')];
    if (!inWin) m.perLetter = Math.min(0.12, Math.max(0.012, ((outWin[1] - outWin[0]) * (1 - width * 0.5)) / TYPICAL_LETTERS));
  }

  // Presets built with expressions (the offset is computed, not keyframed): the animated state is still stored, so use it
  // as the entrance (and a second such animator as the exit) with a typical sweep time.
  if (!inWin && !outWin) {
    const guess = text.animators.filter((a) => !a.offset && !a.positionKeys).map(stateOf).filter((s) => !isRest(s));
    if (guess.length) {
      const enter = guess[0], leave = guess.length > 1 ? guess[guess.length - 1] : null;
      m.letterIn = [key(0, enter, 'easeOut'), key(0.45, rest(), 'easeOut')];
      if (leave) m.letterOut = [key(0, leave, 'easeIn'), key(0.45, rest(), 'easeIn')];
      m.perLetter = 0.05;
      notes.push('This preset computes its timing with an After Effects expression, so the timing is estimated.');
    }
  }

  // Whole-text drift: an animator whose Position is keyframed with no selector moves every letter together.
  const drift = text.animators.find((a) => a.positionKeys && !a.offset);
  if (drift?.positionKeys) {
    const ks = [...drift.positionKeys].sort((a, b) => a.t - b.t);
    const lastZero = Math.abs(ks[ks.length - 1].x) + Math.abs(ks[ks.length - 1].y) < 1e-6;
    const mid = inWin && outWin ? (inWin[1] + outWin[0]) / 2 : Infinity;
    if (lastZero && ks[0].t < mid) m.lineIn = ks.map((k) => key(k.t - ks[0].t, { ...rest(), dx: k.x / fontPx, dy: k.y / fontPx }, 'easeOut'));
    else notes.push('A whole-text move on the way out was skipped.');
  }
  // Whole-layer transforms (Position / Scale / Rotation / Opacity keyframes): an entrance and an exit for the whole text.
  if (!m.lineIn && !m.lineOut) {
    const tr = file.texts.find((t) => t.tracks.length)?.tracks ?? [];
    if (tr.length) { const r = animFromTracks(tr, fontPx); m.lineIn = r.inKeys; m.lineOut = r.outKeys; }
  }
  // Expression-driven typewriter: a slider runs 0 to 100 and the text is sliced to that fraction.
  if (!m.letterIn && !m.lineIn && file.typewriter && file.slider) {
    const D = Math.max(0.2, file.slider.t1 - file.slider.t0);
    m.letterIn = [key(0, { ...rest(), alpha: 0 }, 'linear'), key(0.04, rest(), 'linear')];
    m.perLetter = Math.min(0.12, Math.max(0.012, D / TYPICAL_LETTERS));
    notes.push('Typewriter reveal read from its slider.');
  }
  if (!m.letterIn && !m.letterOut && !m.lineIn && !m.lineOut) notes.push('No readable text-animator motion in this preset.');
  return m;
}
