/**
 * FM mark positioning.
 *
 * Legacy FM fonts have no OpenType positioning: the upper vowel signs ි (`s`) and ී (`S`) are zero-width
 * glyphs drawn at one fixed height, tuned for a flat-topped consonant like ප. On consonants whose top rises
 * or curls (ඩ ව ට බ …) the loop sinks into the letter and disappears.
 *
 * This measures, per font and per base+mark pair, how deep the mark's bottom edge sits into the base's top
 * edge (column by column), and raises or lowers the mark so every pair overlaps the way the font's reference
 * pair (ප + mark) does, capped at about one stroke width so the loop always stays readable.
 * Results are cached per font family; measuring needs the font loaded, so nothing is cached until it is.
 */

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Upper vowel signs in the FM encoding that get repositioned. */
const UPPER_MARKS = new Set(['s', 'S']);
/** ප: flat top, the consonant FM marks are designed around. */
const REFERENCE_BASE = 'm';

const P = 200; // measuring size, px

export interface Piece { text: string; dx: number; dy: number } // dx: px from run start; dy: em fraction × size

interface Profile { top: Int16Array; bottom: Int16Array; thick: number }

let scratch: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
function measureCtx() {
  if (scratch) return scratch;
  const W = P * 3, H = P * 2;
  scratch = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(W, H).getContext('2d', { willReadFrequently: true })!
    : Object.assign(document.createElement('canvas'), { width: W, height: H }).getContext('2d', { willReadFrequently: true })!;
  return scratch;
}

/** Per-column top-most and bottom-most ink rows of `text` drawn at x0 (−1 = no ink). */
function profile(family: string, text: string, x0: number): Profile {
  const c = measureCtx();
  const W = c.canvas.width, H = c.canvas.height, baseline = Math.round(P * 1.4);
  c.clearRect(0, 0, W, H);
  c.font = `400 ${P}px ${family}`;
  c.fillStyle = '#000';
  c.textBaseline = 'alphabetic';
  c.fillText(text, x0, baseline);
  const data = c.getImageData(0, 0, W, H).data;
  const top = new Int16Array(W).fill(-1), bottom = new Int16Array(W).fill(-1);
  const runs: number[] = [];
  for (let x = 0; x < W; x++) {
    let run = 0;
    for (let y = 0; y < H; y++) {
      if (data[(y * W + x) * 4 + 3] > 127) {
        if (top[x] < 0) top[x] = y;
        bottom[x] = y;
        run++;
      } else if (run) { runs.push(run); run = 0; }
    }
    if (run) runs.push(run);
  }
  runs.sort((a, b) => a - b);
  return { top, bottom, thick: runs.length ? runs[Math.floor(runs.length / 2)] : P * 0.08 };
}

/** How far (px at size P) the mark's bottom edge reaches below the base's top edge; 0 if they don't meet. */
function penetration(family: string, base: string, mark: string): { depth: number; thick: number } | null {
  const c = measureCtx();
  c.font = `400 ${P}px ${family}`;
  const x0 = P / 2;
  const adv = c.measureText(base).width;
  const b = profile(family, base, x0);
  const m = profile(family, mark, x0 + adv);
  let depth = -Infinity;
  for (let x = 0; x < b.top.length; x++) {
    if (m.bottom[x] < 0 || b.top[x] < 0) continue;
    depth = Math.max(depth, m.bottom[x] - b.top[x]);
  }
  return depth === -Infinity ? null : { depth, thick: m.thick };
}

const cache = new Map<string, number>(); // `${family}|${base}${mark}` → dy in em

function fontReady(family: string): boolean {
  if (typeof document === 'undefined' || !document.fonts) return true;
  // `check()` is true for families that were never registered, so require a loaded face by name.
  const name = family.match(/^\s*"([^"]+)"/)?.[1] ?? family.split(',')[0].trim();
  for (const face of document.fonts) if (face.family.replace(/"/g, '') === name && face.status === 'loaded') return true;
  return false;
}

/** Vertical shift (em fraction) for `mark` after `base` in this FM font. */
export function markShift(family: string, base: string, mark: string): number {
  const key = `${family}|${base}${mark}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (!fontReady(family)) return 0;
  let dy = 0;
  const cur = base === REFERENCE_BASE ? null : penetration(family, base, mark);
  const ref = penetration(family, REFERENCE_BASE, mark);
  if (cur && ref) {
    // Aim for the reference overlap, but never deeper than one stroke (the loop must stay visible).
    const target = Math.min(ref.depth, ref.thick);
    dy = (target - cur.depth) / P;
    dy = Math.max(-0.35, Math.min(0.08, dy));
    if (Math.abs(dy) < 0.006) dy = 0; // sub-pixel noise at caption sizes
  }
  cache.set(key, dy);
  return dy;
}

/**
 * Split an FM string into drawable pieces: plain stretches, and each upper mark on its own with its
 * repositioned offset. Returns null when nothing needs moving (draw the run as one string).
 */
export function fmPieces(ctx: Ctx2D, family: string, text: string): Piece[] | null {
  let moved = false;
  const marks: { i: number; dy: number }[] = [];
  for (let i = 1; i < text.length; i++) {
    if (!UPPER_MARKS.has(text[i])) continue;
    const dy = markShift(family, text[i - 1], text[i]);
    marks.push({ i, dy });
    if (dy) moved = true;
  }
  if (!moved) return null;
  const pieces: Piece[] = [];
  let start = 0;
  const at = (i: number) => (i === 0 ? 0 : ctx.measureText(text.slice(0, i)).width);
  for (const { i, dy } of marks) {
    if (i > start) pieces.push({ text: text.slice(start, i), dx: at(start), dy: 0 });
    pieces.push({ text: text[i], dx: at(i), dy });
    start = i + 1;
  }
  if (start < text.length) pieces.push({ text: text.slice(start), dx: at(start), dy: 0 });
  return pieces;
}

/** Forget measurements (e.g. after a font finishes loading and replaces its fallback). */
export function resetFmShapeCache() {
  cache.clear();
}
