import { nanoid } from 'nanoid';
import type { MouseEvent as ReactMouse } from 'react';
import { useEditor } from '../store';
import type { Project } from '../types';
import { currentTime } from './player';
import { splitAdj } from './adj';
import { shiftCaptions } from './segment';
import { captionsFollowClips, clipEnd, closeMainGaps, deleteClips, splitClips, trackOf, withClips, withPartner } from './clips';

/** Timeline multi-selection across clips, overlays and filter / effect blocks. Pure helpers plus the pointer protocol the blocks share. */

const SNAP_PX = 8;
const EPS = 1e-6;
type Timed = { id: string; start: number; duration: number };

type SelState = Pick<ReturnType<typeof useEditor.getState>, 'multiIds' | 'selectedClipId' | 'selectedOverlayId' | 'extraOverlayIds' | 'selectedAdjId' | 'selectedCaptionId' | 'selectedTrackId'>;

/** Ids of everything selected on the timeline (one id when a single item is selected). */
export function selectedIds(st: SelState): string[] {
  if (st.multiIds.length > 1) return st.multiIds;
  // A preview multi-selection of overlays lives in selectedOverlayId + extraOverlayIds with multiIds empty.
  const ids = [st.selectedClipId, st.selectedOverlayId, ...st.extraOverlayIds, st.selectedAdjId, st.selectedCaptionId, st.selectedTrackId].filter((x): x is string => !!x);
  return [...new Set(ids)];
}

/** Select one item by id, whatever it is. */
export function selectOnly(id: string) {
  const p = useEditor.getState().project, st = useEditor.getState();
  if ((p?.clips ?? []).some((c) => c.id === id)) st.selectClip(id);
  else if ((p?.overlays ?? []).some((o) => o.id === id)) st.selectOverlay(id);
  else if ((p?.adj ?? []).some((a) => a.id === id)) st.selectAdj(id);
  else if (p?.captions.some((c) => c.id === id)) st.select(id);
  else if (p?.audio.tracks.some((t) => t.id === id)) st.selectTrack(id);
}

/** Every item that can sit in a group, with its group id. */
const grouped = (p: Project): { id: string; groupId?: string }[] => [...(p.clips ?? []), ...(p.overlays ?? []), ...(p.adj ?? []), ...p.captions, ...p.audio.tracks];

/** The ids plus every other member of any group they belong to. */
export function withGroupMates(p: Project, ids: string[]): string[] {
  const all = grouped(p);
  const gs = new Set(all.filter((x) => ids.includes(x.id) && x.groupId).map((x) => x.groupId));
  return [...new Set([...ids, ...all.filter((x) => x.groupId && gs.has(x.groupId)).map((x) => x.id)])];
}

export interface Group { id: string; ids: string[]; x0: number; proj: Project; moved: boolean }

/** A left-button press that should select / drag. On macOS Ctrl+click is a right-click, so it is left to the context menu. */
export const isPrimaryPress = (e: { button: number; ctrlKey: boolean }) =>
  e.button === 0 && !(e.ctrlKey && typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform));

/**
 * Pointer press on a block. Shift / ⌘ / Ctrl toggles it in the selection and starts no drag ('toggled').
 * A plain press on a block that is already part of a multi-selection keeps the selection and drags it as a group ('group').
 * Anything else is an ordinary single selection ('single').
 */
export function pressBlock(e: ReactMouse, id: string): 'toggled' | 'group' | 'single' {
  const st = useEditor.getState(), p = st.project!;
  if (e.shiftKey || e.metaKey || e.ctrlKey) {
    const cur = selectedIds(st), mates = withGroupMates(p, [id]);
    st.setMulti(cur.includes(id) ? cur.filter((x) => !mates.includes(x)) : [...cur, ...mates]);
    return 'toggled';
  }
  if (st.multiIds.length > 1 && st.multiIds.includes(id)) return 'group';
  const mates = withGroupMates(p, [id]);
  if (mates.length > 1) { st.setMulti(mates); return 'group'; }
  return 'single';
}

export function beginGroup(id: string, x0: number): Group {
  const st = useEditor.getState();
  return { id, ids: st.multiIds, x0, proj: st.project!, moved: false };
}

export function dragGroup(g: Group, clientX: number, pps: number) {
  const dx = clientX - g.x0;
  if (!g.moved && Math.abs(dx) < 3) return;
  g.moved = true;
  useEditor.getState().update(() => moveSelection(g.proj, g.ids, dx / pps, pps), 'multi-drag');
}

/** A press-release on a group member with no drag narrows the selection to that item, like clicking in a file list. */
export function endGroup(g?: Group | null) {
  if (!g || g.moved) return;
  const p = useEditor.getState().project!;
  if (withGroupMates(p, [g.id]).length < 2) selectOnly(g.id); // a grouped item keeps its whole group selected
}

/** Move every selected item by dt seconds, snapping edges to the other items, the playhead and zero. Video clips on a track never overlap their neighbours. */
export function moveSelection(p: Project, ids: string[], dt: number, pps: number): Project {
  const sel = new Set(ids);
  const clips = p.clips ?? [];
  const movingClips = [...new Map(clips.filter((c) => sel.has(c.id)).flatMap((c) => withPartner(clips, c)).map((c) => [c.id, c])).values()];
  const mc = new Set(movingClips.map((c) => c.id));
  const ovl = (p.overlays ?? []).filter((o) => sel.has(o.id));
  const adj = (p.adj ?? []).filter((a) => sel.has(a.id));
  const caps = p.captions.filter((c) => sel.has(c.id));
  const tracks = p.audio.tracks.filter((t) => sel.has(t.id));
  const moving: Timed[] = [...movingClips, ...ovl, ...adj, ...caps.map((c) => ({ id: c.id, start: c.start, duration: c.end - c.start })), ...tracks];
  if (!moving.length) return p;
  const fixed: Timed[] = [...clips.filter((c) => !mc.has(c.id)), ...(p.overlays ?? []).filter((o) => !sel.has(o.id)), ...(p.adj ?? []).filter((a) => !sel.has(a.id))];
  const edges = [0, currentTime(), ...fixed.flatMap((x) => [x.start, x.start + x.duration])];
  let best = dt, bestD = SNAP_PX / pps;
  for (const m of moving) for (const mine of [m.start + dt, m.start + m.duration + dt]) for (const e of edges) {
    const d = Math.abs(mine - e);
    if (d < bestD) { bestD = d; best = dt + (e - mine); }
  }
  let delta = Math.max(best, -Math.min(...moving.map((m) => m.start)));
  for (const g of movingClips) {
    if (g.kind !== 'video') continue;
    for (const o of clips) {
      if (o.kind !== 'video' || mc.has(o.id) || trackOf(o) !== trackOf(g)) continue;
      if (clipEnd(o) <= g.start + EPS) delta = Math.max(delta, clipEnd(o) - g.start);
      else if (o.start >= clipEnd(g) - EPS) delta = Math.min(delta, o.start - clipEnd(g));
    }
  }
  // Captions never cross the captions that stay behind.
  for (const m of caps) for (const o of p.captions) {
    if (sel.has(o.id)) continue;
    if (o.end <= m.start + EPS) delta = Math.max(delta, o.end - m.start);
    else if (o.start >= m.end - EPS) delta = Math.min(delta, o.start - m.end);
  }
  // Overlays and filter / effect blocks never cross the ones that stay behind on their own track.
  for (const [mv, all] of [[ovl, p.overlays ?? []], [adj, p.adj ?? []]] as const) for (const m of mv) for (const o of all) {
    if (sel.has(o.id) || o.track !== m.track) continue;
    if (o.start + o.duration <= m.start + EPS) delta = Math.max(delta, o.start + o.duration - m.start);
    else if (o.start >= m.start + m.duration - EPS) delta = Math.min(delta, o.start - (m.start + m.duration));
  }
  const shift = <T extends { id: string; start: number }>(list: T[], set: Set<string>) => list.map((x) => (set.has(x.id) ? { ...x, start: x.start + delta } : x));
  const next = mc.size ? withClips(p, shift(clips, mc)) : p;
  return {
    ...next,
    ...(caps.length ? { captions: shiftCaptions(p.captions, caps.map((c) => c.id), delta) } : {}),
    ...(tracks.length ? { audio: { ...p.audio, tracks: shift(p.audio.tracks, new Set(tracks.map((t) => t.id))) } } : {}),
    ...(ovl.length ? { overlays: shift(p.overlays ?? [], new Set(ovl.map((o) => o.id))) } : {}),
    ...(adj.length ? { adj: shift(p.adj ?? [], new Set(adj.map((a) => a.id))) } : {}),
  };
}

/** Delete everything in a multi-selection in one undo step. */
export function deleteSelection(): boolean {
  const st = useEditor.getState();
  if (st.multiIds.length < 2) return false;
  const set = new Set(st.multiIds);
  st.update((p) => {
    // Like setClips: the main track stays magnetic and captions follow their clips.
    const before = p.clips ?? [];
    const after = closeMainGaps(deleteClips(before, st.multiIds, st.rippleDelete));
    return {
      ...withClips(p, after),
      ...(p.overlays ? { overlays: p.overlays.filter((o) => !set.has(o.id)) } : {}),
      ...(p.adj ? { adj: p.adj.filter((a) => !set.has(a.id)) } : {}),
      captions: captionsFollowClips(p.captions, before, after).filter((c) => !set.has(c.id)),
      audio: { ...p.audio, tracks: p.audio.tracks.filter((t) => !set.has(t.id)) },
    };
  });
  st.setMulti([]);
  return true;
}

/** Split everything in a multi-selection that sits under the playhead, in one undo step. */
export function splitSelection(): boolean {
  const st = useEditor.getState();
  if (st.multiIds.length < 2) return false;
  const t = currentTime(), ids = st.multiIds;
  const p = st.project;
  if (!p) return false;
  let q = p;
  const r = splitClips(p.clips ?? [], ids, t);
  if (r.ids.length) q = withClips(q, r.clips);
  for (const id of ids) {
    const o = splitAdj(q.overlays ?? [], id, t);
    if (o.id) q = { ...q, overlays: o.adj };
    const a = splitAdj(q.adj ?? [], id, t);
    if (a.id) q = { ...q, adj: a.adj };
  }
  if (q === p) return false; // nothing under the playhead: leave history untouched
  st.update(() => q);
  return true;
}

/** Everything that can be multi-selected. */
export function allSelectableIds(p: Project): string[] {
  return grouped(p).map((x) => x.id);
}

/** True when every selected item shares one group id. */
export function selectionGrouped(): boolean {
  const st = useEditor.getState(), p = st.project;
  if (!p || st.multiIds.length < 2) return false;
  const gs = grouped(p).filter((x) => st.multiIds.includes(x.id)).map((x) => x.groupId);
  return !!gs[0] && gs.every((g) => g === gs[0]);
}

/** ⌘G: tie the selected items together. ⌘⇧G (or ⌘G on a whole group): untie them. */
export function groupSelection(ungroup = selectionGrouped()): boolean {
  const st = useEditor.getState();
  const ids = new Set(st.multiIds.length > 1 ? st.multiIds : []);
  if (!ids.size) { st.notify('Select two or more items to group.', 'info'); return false; }
  const gid = ungroup ? undefined : nanoid(6);
  const tag = <T extends { id: string }>(l: T[]): T[] => l.map((x) => (ids.has(x.id) ? { ...x, groupId: gid } : x));
  st.update((p) => ({
    ...p, clips: tag(p.clips ?? []), captions: tag(p.captions), audio: { ...p.audio, tracks: tag(p.audio.tracks) },
    ...(p.overlays ? { overlays: tag(p.overlays) } : {}), ...(p.adj ? { adj: tag(p.adj) } : {}),
  }));
  st.notify(ungroup ? 'Ungrouped.' : `Grouped ${ids.size} items. Click one to select the group.`, 'success');
  return true;
}
