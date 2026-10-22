/** Magnet snapping for dragging things in the preview, like CapCut: centres and edges stick to the frame and to other items. */

/** Axis-aligned box in canvas pixels, by centre. */
export interface Box { cx: number; cy: number; w: number; h: number }
export interface Guide { axis: 'x' | 'y'; pos: number }
export interface Snap { dx: number; dy: number; guides: Guide[] }

/** Frame lines an item snaps to on one axis: edges, centre, and a safe margin in from each edge. */
const frameLines = (size: number, margin: number) => [0, margin, size / 2, size - margin, size];

function snapAxis(mine: number[], lines: number[], threshold: number): { delta: number; at: number } | null {
  let best: { delta: number; at: number } | null = null;
  for (const m of mine) for (const l of lines) {
    const d = l - m;
    if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, at: l };
  }
  return best;
}

/**
 * How far to nudge `box` so its left / centre / right and top / middle / bottom land on the frame lines or on the same
 * points of any of `others`. Returns the nudge and the guide lines to draw (one per axis at most).
 */
export function snapBox(box: Box, others: Box[], W: number, H: number, threshold: number): Snap {
  const xs = [box.cx - box.w / 2, box.cx, box.cx + box.w / 2];
  const ys = [box.cy - box.h / 2, box.cy, box.cy + box.h / 2];
  const lx = [...frameLines(W, W * 0.05), ...others.flatMap((o) => [o.cx - o.w / 2, o.cx, o.cx + o.w / 2])];
  const ly = [...frameLines(H, H * 0.05), ...others.flatMap((o) => [o.cy - o.h / 2, o.cy, o.cy + o.h / 2])];
  const sx = snapAxis(xs, lx, threshold), sy = snapAxis(ys, ly, threshold);
  const guides: Guide[] = [];
  if (sx) guides.push({ axis: 'x', pos: sx.at });
  if (sy) guides.push({ axis: 'y', pos: sy.at });
  return { dx: sx?.delta ?? 0, dy: sy?.delta ?? 0, guides };
}

/** Smallest box holding all of `boxes`. */
export function unionBox(boxes: Box[]): Box {
  const l = Math.min(...boxes.map((b) => b.cx - b.w / 2)), r = Math.max(...boxes.map((b) => b.cx + b.w / 2));
  const t = Math.min(...boxes.map((b) => b.cy - b.h / 2)), b = Math.max(...boxes.map((b2) => b2.cy + b2.h / 2));
  return { cx: (l + r) / 2, cy: (t + b) / 2, w: r - l, h: b - t };
}
