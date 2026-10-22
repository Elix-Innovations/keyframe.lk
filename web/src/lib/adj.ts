import { nanoid } from 'nanoid';
import type { AdjClip } from '../types';

/** Anything placed on a numbered timeline track over a time range: filter / effect clips and overlays. */
export interface Timed { id: string; start: number; duration: number; track: number }

/** Pure logic for filter and effect clips on adjustment tracks. */
export const MIN_ADJ = 0.2;
const EPS = 1e-6;
export const adjEnd = (a: Timed) => a.start + a.duration;
const overlaps = (a: { start: number; duration: number }, b: { start: number; duration: number }) => a.start < b.start + b.duration - EPS && b.start < a.start + a.duration - EPS;

/** First track at or above `preferred` where [start, start+duration) is free. */
export function freeTrack(adj: Timed[], start: number, duration: number, preferred: number, ignoreId?: string): number {
  for (let t = Math.max(0, preferred); ; t++) {
    if (!adj.some((a) => a.id !== ignoreId && a.track === t && overlaps(a, { start, duration }))) return t;
  }
}

export function makeAdj(o: { kind: AdjClip['kind']; refId: string; start: number; duration: number; track?: number; intensity?: number }, adj: AdjClip[]): AdjClip {
  const duration = Math.max(MIN_ADJ, o.duration);
  return {
    id: nanoid(8), kind: o.kind, refId: o.refId, start: Math.max(0, o.start), duration,
    track: freeTrack(adj, Math.max(0, o.start), duration, o.track ?? 0),
    intensity: o.intensity ?? (o.kind === 'filter' ? 100 : 60),
  };
}

export function trackCount(adj: Timed[]) {
  return adj.reduce((m, a) => Math.max(m, a.track + 1), 1);
}

const replace = <T extends Timed>(adj: T[], next: T) => adj.map((a) => (a.id === next.id ? next : a));

/** Move in time (clamped at 0 and against neighbours on the same track) and optionally onto another track if free. */
export function moveAdj<T extends Timed>(adj: T[], id: string, dt: number, toTrack?: number): T[] {
  const a = adj.find((x) => x.id === id);
  if (!a) return adj;
  const track = toTrack !== undefined && toTrack >= 0 && !adj.some((o) => o.id !== id && o.track === toTrack && overlaps(o, { start: a.start + Math.max(dt, -a.start), duration: a.duration })) ? toTrack : a.track;
  const others = adj.filter((o) => o.id !== id && o.track === track).sort((p, q) => p.start - q.start);
  let start = Math.max(0, a.start + dt);
  const prev = others.filter((o) => adjEnd(o) <= a.start + EPS).at(-1);
  const next = others.find((o) => o.start >= adjEnd(a) - EPS);
  if (track === a.track) {
    if (prev) start = Math.max(start, adjEnd(prev));
    if (next) start = Math.min(start, next.start - a.duration);
  }
  return replace(adj, { ...a, start, track });
}

export function trimAdjLeft<T extends Timed>(adj: T[], id: string, dt: number): T[] {
  const a = adj.find((x) => x.id === id);
  if (!a) return adj;
  const prev = adj.filter((o) => o.id !== id && o.track === a.track && adjEnd(o) <= a.start + EPS).sort((p, q) => adjEnd(q) - adjEnd(p))[0];
  const d = Math.min(Math.max(dt, -a.start, prev ? adjEnd(prev) - a.start : -Infinity), a.duration - MIN_ADJ);
  return replace(adj, { ...a, start: a.start + d, duration: a.duration - d });
}

export function trimAdjRight<T extends Timed>(adj: T[], id: string, dt: number): T[] {
  const a = adj.find((x) => x.id === id);
  if (!a) return adj;
  const next = adj.filter((o) => o.id !== id && o.track === a.track && o.start >= adjEnd(a) - EPS).sort((p, q) => p.start - q.start)[0];
  const d = Math.max(Math.min(dt, next ? next.start - adjEnd(a) : Infinity), MIN_ADJ - a.duration);
  return replace(adj, { ...a, duration: a.duration + d });
}

export function splitAdj<T extends Timed>(adj: T[], id: string, t: number): { adj: T[]; id: string | null } {
  const a = adj.find((x) => x.id === id);
  if (!a || t <= a.start + MIN_ADJ / 2 || t >= adjEnd(a) - MIN_ADJ / 2) return { adj, id: null };
  const right: T = { ...a, id: nanoid(8), start: t, duration: adjEnd(a) - t };
  return { adj: adj.flatMap((x) => (x.id === id ? [{ ...a, duration: t - a.start }, right] : [x])), id: right.id };
}

export function duplicateAdj<T extends Timed>(adj: T[], id: string): T[] {
  const a = adj.find((x) => x.id === id);
  if (!a) return adj;
  const start = adjEnd(a);
  return [...adj, { ...a, id: nanoid(8), start, track: freeTrack(adj, start, a.duration, a.track) }];
}

export const deleteAdj = <T extends Timed>(adj: T[], id: string) => adj.filter((a) => a.id !== id);
export const adjAt = <T extends Timed>(adj: T[], t: number) => adj.filter((a) => t >= a.start - EPS && t < adjEnd(a) - EPS).sort((p, q) => p.track - q.track);
