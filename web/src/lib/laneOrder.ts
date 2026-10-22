import type { LaneGroup, LaneState, Project } from '../types';
import { overlayLane } from '../render/overlays';

export const DEFAULT_ORDER: LaneGroup[] = ['overlay', 'adj', 'video', 'audio', 'broll', 'sound'];

/** The saved group order, repaired so every group appears exactly once. */
export const groupOrder = (p: Project): LaneGroup[] => {
  const saved = (p.laneOrder ?? []).filter((g, i, a) => DEFAULT_ORDER.includes(g) && a.indexOf(g) === i);
  return [...saved, ...DEFAULT_ORDER.filter((g) => !saved.includes(g))];
};

/** Move a whole group of tracks (e.g. all sound layers) to sit where `to` is. */
export function moveGroup(p: Project, group: LaneGroup, to: LaneGroup): Project {
  if (group === to) return p;
  const order = groupOrder(p).filter((g) => g !== group);
  const wasAbove = groupOrder(p).indexOf(group) < groupOrder(p).indexOf(to);
  order.splice(order.indexOf(to) + (wasAbove ? 1 : 0), 0, group);
  return { ...p, laneOrder: order };
}

export type LaneKind = 'video' | 'overlay' | 'adj' | 'sound';

const laneKey: Record<LaneKind, (track: number) => string> = {
  video: (t) => (t === 0 ? 'video' : `video:${t}`),
  overlay: overlayLane,
  adj: (t) => (t === 0 ? 'fx' : `adj:${t}`),
  sound: (t) => `sound:${t}`,
};

/** Where track `i` ends up when track `from` is dragged to position `to`; the tracks in between shift by one. */
const remap = (i: number, from: number, to: number) => (i === from ? to : from < to ? (i > from && i <= to ? i - 1 : i) : (i >= to && i < from ? i + 1 : i));

/** Move a whole track (every clip on it plus its hide / lock / mute state) to a new position in its stack. */
export function moveLane(p: Project, kind: LaneKind, from: number, to: number): Project {
  if (from === to || from < 0 || to < 0) return p;
  const m = (t: number | undefined) => remap(t ?? 0, from, to);
  const lanes: Record<string, LaneState> = { ...p.lanes };
  const states = new Map<number, LaneState | undefined>();
  const max = Math.max(from, to);
  for (let t = Math.min(from, to); t <= max; t++) { states.set(t, p.lanes?.[laneKey[kind](t)]); delete lanes[laneKey[kind](t)]; }
  for (const [t, st] of states) if (st) lanes[laneKey[kind](m(t))] = st;
  const next: Project = { ...p, lanes };
  if (kind === 'video') next.clips = p.clips?.map((c) => (c.kind === 'video' ? { ...c, track: m(c.track) } : c));
  else if (kind === 'overlay') next.overlays = p.overlays?.map((o) => ({ ...o, track: m(o.track) }));
  else if (kind === 'adj') next.adj = p.adj?.map((a) => ({ ...a, track: m(a.track) }));
  else next.audio = { ...p.audio, tracks: p.audio.tracks.map((t) => ({ ...t, layer: m(t.layer) })) };
  return next;
}
