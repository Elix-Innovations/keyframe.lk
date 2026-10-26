import type { LaneState, Project } from '../types';
import { clipEnd, trackOf, videoClips } from './clips';
import { moveAdj, trimAdjLeft, trimAdjRight, type Timed } from './adj';

/**
 * Layers: video clips above the main video, cut-outs, images, stickers, text and motion graphics all stack in one
 * numbered space. Row 0 is the main video; row 1 is the first layer above it, and so on. A higher row paints in
 * front, and several items share a row when they do not overlap in time. Pure logic, no React.
 */

const EPS = 1e-6;
const clash = (a: Timed, b: { start: number; duration: number }) => a.start < b.start + b.duration - EPS && b.start < a.start + a.duration - EPS;

/** Every video clip and overlay as a plain timed item on its row. */
export function layerItems(p: Project): Timed[] {
  return [
    ...(p.overlays ?? []).map((o) => ({ id: o.id, start: o.start, duration: o.duration, track: o.track })),
    ...videoClips(p.clips ?? []).map((c) => ({ id: c.id, start: c.start, duration: clipEnd(c) - c.start, track: trackOf(c) })),
  ];
}

/** Number of rows in the layer stack (main video included). */
export const rowCount = (p: Project) => layerItems(p).reduce((m, i) => Math.max(m, i.track + 1), 1);

/** First row at or above `preferred` (never the main row) where [start, start+duration) is free. */
export function freeLayerRow(p: Project, start: number, duration: number, preferred: number, ignoreId?: string): number {
  const items = layerItems(p);
  for (let t = Math.max(1, preferred); ; t++) {
    if (!items.some((i) => i.id !== ignoreId && i.track === t && clash(i, { start, duration }))) return t;
  }
}

/** Where a new layer goes by default: the front-most row, or a new row above it when that one is taken. */
export const newLayerRow = (p: Project, start: number, duration: number) => freeLayerRow(p, start, duration, rowCount(p) - 1);

/** Write rows (and, for overlays, timing) from `items` back to the project. */
function apply(p: Project, items: Timed[], timing: boolean): Project {
  const m = new Map(items.map((i) => [i.id, i]));
  return {
    ...p,
    overlays: p.overlays?.map((o) => {
      const i = m.get(o.id);
      return i && (i.track !== o.track || (timing && (i.start !== o.start || i.duration !== o.duration))) ? { ...o, track: i.track, ...(timing ? { start: i.start, duration: i.duration } : {}) } : o;
    }),
    clips: p.clips?.map((c) => {
      const i = c.kind === 'video' ? m.get(c.id) : undefined;
      return i && i.track !== trackOf(c) ? { ...c, track: i.track } : c;
    }),
  };
}

/** When a row was opened at `at`, the hide / lock state of every row from there up moves with its row. */
function shiftLanes(p: Project, at: number, rows: number): Project {
  if (!p.lanes) return p;
  const lanes: Record<string, LaneState> = {};
  for (const [k, v] of Object.entries(p.lanes)) {
    const m = /^video:(\d+)$/.exec(k);
    lanes[m && Number(m[1]) >= at ? `video:${Number(m[1]) + 1}` : k] = v;
  }
  void rows;
  return { ...p, lanes };
}

function place(p: Project, id: string, dt: number, toRow: number | undefined, timing: boolean): Project {
  const items = layerItems(p);
  const it = items.find((i) => i.id === id);
  if (!it) return p;
  const isOverlay = !!p.overlays?.some((o) => o.id === id);
  let to = toRow !== undefined && toRow >= 0 ? (isOverlay ? Math.max(1, toRow) : toRow) : undefined;
  if (to === it.track) to = undefined;
  // The main row never opens up; it only takes a clip when it is free.
  if (to === 0 && items.some((i) => i.id !== id && i.track === 0 && clash(i, { start: Math.max(0, it.start + dt), duration: it.duration }))) to = undefined;
  const moved = moveAdj(items, id, dt, to);
  const opened = to !== undefined && moved.some((i) => i.id !== id && i.track !== items.find((x) => x.id === i.id)!.track);
  const next = apply(p, moved, timing);
  return opened ? shiftLanes(next, to!, 1) : next;
}

/** Move an overlay in time and onto another row; a taken row opens a new one there. */
export const moveLayer = (p: Project, id: string, dt: number, toRow?: number) => place(p, id, dt, toRow, true);

/** Put a (video) clip on another row; its time was already set by the clip logic. */
export const placeOnRow = (p: Project, id: string, toRow: number) => place(p, id, 0, toRow, false);

/** Trim an overlay against every neighbour on its row, overlays and video clips alike. */
export function trimLayer(p: Project, id: string, side: 'l' | 'r', dt: number): Project {
  const items = layerItems(p);
  return apply(p, side === 'l' ? trimAdjLeft(items, id, dt) : trimAdjRight(items, id, dt), true);
}

/**
 * Old projects kept video layers and overlays on separate stacks, with an overlay's `behind` saying which video layer it sat
 * behind. Merge them into one stack that paints the same picture, carrying each row's hide / lock state along.
 */
export function migrateLayers(p: Project): Project {
  if (p.layersV2) return p;
  const overlays = p.overlays ?? [];
  if (!overlays.length) return { ...p, layersV2: true };
  const key = (o: { track: number; behind?: number }) => (o.behind !== undefined ? o.behind - 0.5 + o.track * 0.001 : 1000 + o.track);
  const vKeys = videoClips(p.clips ?? []).map(trackOf).filter((t) => t > 0);
  const keys = [...new Set([...vKeys, ...overlays.map(key)])].sort((a, b) => a - b);
  const rowOf = new Map(keys.map((k, i) => [k, i + 1]));
  const oldState = (k: string) => p.lanes?.[k];
  const lanes: Record<string, LaneState> = {};
  for (const [k, v] of Object.entries(p.lanes ?? {})) if (!/^(video:\d+|overlay(:\d+)?)$/.test(k)) lanes[k] = v;
  const put = (row: number, st?: LaneState) => { if (st) lanes[`video:${row}`] = { ...lanes[`video:${row}`], ...st }; };
  for (const t of new Set(vKeys)) put(rowOf.get(t)!, oldState(`video:${t}`));
  for (const o of overlays) put(rowOf.get(key(o))!, oldState(o.track === 0 ? 'overlay' : `overlay:${o.track}`));
  return {
    ...p,
    layersV2: true,
    lanes,
    overlays: overlays.map(({ behind: _b, ...o }) => ({ ...o, track: rowOf.get(key({ track: o.track, behind: _b }))! })),
    clips: p.clips?.map((c) => (c.kind === 'video' && trackOf(c) > 0 ? { ...c, track: rowOf.get(trackOf(c))! } : c)),
  };
}
