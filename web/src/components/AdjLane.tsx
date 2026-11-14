import { memo, useRef } from 'react';
import type { AdjClip } from '@/types';
import { useEditor } from '@/store';
import { currentTime } from '@/lib/player';
import { deleteSelection, beginGroup, dragGroup, endGroup, pressBlock, type Group } from '@/lib/multiSelect';
import { adjEnd, deleteAdj, duplicateAdj, makeAdj, moveAdj, splitAdj, trimAdjLeft, trimAdjRight } from '@/lib/adj';
import { clipEnd } from '@/lib/clips';
import { FILTER_PRESETS, laneOf } from '@/lib/videoFx';
import { effectLabel } from '@/render/effects';
import { geo } from '@/lib/timelineGeo';
import { cn } from '@/lib/utils';
import { Copy, Scissors, Trash2 } from '@/components/icons';
import { Lock } from '@/components/icons-audio';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger } from '@/components/ui/context-menu';

const SNAP_PX = 8;

export const adjLabel = (a: AdjClip) => (a.kind === 'filter' ? FILTER_PRESETS.find((p) => p.id === a.refId)?.label ?? a.refId : effectLabel(a.refId));
export const adjLane = (track: number) => (track === 0 ? 'fx' : `adj:${track}`);

/** Edit helpers for filter and effect clips. All go through the store so they undo. */
export const adjOps = {
  addAt(kind: AdjClip['kind'], refId: string, start: number, duration: number, track: number): string | null {
    const st = useEditor.getState();
    const a = makeAdj({ kind, refId, start, duration, track }, st.project?.adj ?? []);
    st.setAdj((list) => [...list, a]);
    st.selectAdj(a.id);
    return a.id;
  },
  splitAtPlayhead(id?: string) {
    const st = useEditor.getState();
    const target = id ?? st.selectedAdjId;
    if (!target) return false;
    const r = splitAdj(st.project?.adj ?? [], target, currentTime());
    if (!r.id) return false;
    st.setAdj(() => r.adj);
    return true;
  },
  duplicate(id: string) { useEditor.getState().setAdj((l) => duplicateAdj(l, id)); },
  remove(id: string) { const st = useEditor.getState(); st.setAdj((l) => deleteAdj(l, id)); st.selectAdj(null); },
};

/** Nudge a drag of `dt` seconds so the moved edge(s) stick to the playhead, other blocks and clip starts and ends. A trim only moves its own edge. */
function snap(list: AdjClip[], a: AdjClip, dt: number, pps: number, edge: 'move' | 'l' | 'r' = 'move'): number {
  const edges = [0, currentTime(), ...list.filter((o) => o.id !== a.id).flatMap((o) => [o.start, adjEnd(o)]),
    ...(useEditor.getState().project?.clips ?? []).flatMap((c) => [c.start, clipEnd(c)])];
  let best = dt, bestD = SNAP_PX / pps;
  for (const mine of edge === 'l' ? [a.start + dt] : edge === 'r' ? [adjEnd(a) + dt] : [a.start + dt, adjEnd(a) + dt]) for (const e of edges) {
    const d = Math.abs(mine - e);
    if (d < bestD) { bestD = d; best = dt + (e - mine); }
  }
  return best;
}

export const AdjBlock = memo(function AdjBlock({ adj, pps, pad, top, height }: { adj: AdjClip; pps: number; pad: number; top: number; height: number }) {
  const selected = useEditor((s) => s.selectedAdjId === adj.id || s.multiIds.includes(adj.id));
  const locked = useEditor((s) => !!laneOf(s.project!, adjLane(adj.track)).locked);
  const hidden = useEditor((s) => !!laneOf(s.project!, adjLane(adj.track)).hidden);
  const drag = useRef<{ kind: 'move' | 'l' | 'r'; x0: number; orig: AdjClip[]; group?: Group } | null>(null);

  const down = (e: React.PointerEvent, kind: 'move' | 'l' | 'r') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const st = useEditor.getState();
    const press = kind === 'move' ? pressBlock(e, adj.id) : 'single';
    if (press === 'toggled') return;
    if (press === 'single') st.selectAdj(adj.id);
    if (locked) return;
    drag.current = { kind, x0: e.clientX, orig: st.project?.adj ?? [], group: press === 'group' ? beginGroup(adj.id, e.clientX) : undefined };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.group) { dragGroup(d.group, e.clientX, pps); return; }
    const raw = (e.clientX - d.x0) / pps;
    const a = d.orig.find((x) => x.id === adj.id)!;
    const set = useEditor.getState().setAdj;
    if (d.kind === 'move') set(() => moveAdj(d.orig, adj.id, snap(d.orig, a, raw, pps), geo.adjTrackAt(e.clientY)), `adj-${adj.id}`);
    else if (d.kind === 'l') set(() => trimAdjLeft(d.orig, adj.id, snap(d.orig, a, raw, pps, 'l')), `adj-${adj.id}`);
    else set(() => trimAdjRight(d.orig, adj.id, snap(d.orig, a, raw, pps, 'r')), `adj-${adj.id}`);
  };
  const canSplit = (() => { const t = currentTime(); return t > adj.start && t < adjEnd(adj); })();

  return (
    <ContextMenu onOpenChange={(o) => o && !useEditor.getState().multiIds.includes(adj.id) && useEditor.getState().selectAdj(adj.id)}>
      <ContextMenuTrigger asChild>
        <div title={`${adj.kind === 'filter' ? 'Filter' : 'Effect'}: ${adjLabel(adj)}`}
          onPointerDown={(e) => down(e, 'move')} onPointerMove={move} onPointerUp={() => { endGroup(drag.current?.group); drag.current = null; }}
          className={cn('group absolute flex items-center overflow-hidden rounded-lg border px-2 text-xs font-medium text-white',
            adj.kind === 'filter' ? 'border-chart-3/70 bg-chart-3/60' : 'border-brand-2/70 bg-brand-2/60',
            selected && 'ring-2 ring-primary', hidden && 'opacity-35', locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing')}
          style={{ left: adj.start * pps + pad, width: Math.max(8, adj.duration * pps), top, height }}>
          <span className="pointer-events-none truncate">{adj.kind === 'filter' ? '◐ ' : '✦ '}{adjLabel(adj)}</span>
          {locked && <Lock className="ml-auto size-3" />}
          <span onPointerDown={(e) => down(e, 'l')} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-white/0 group-hover:bg-white/30" />
          <span onPointerDown={(e) => down(e, 'r')} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/0 group-hover:bg-white/30" />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem disabled={!canSplit} onClick={() => adjOps.splitAtPlayhead(adj.id)}><Scissors />Split at playhead<ContextMenuShortcut>S</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem onClick={() => adjOps.duplicate(adj.id)}><Copy />Duplicate</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => { if (!deleteSelection()) adjOps.remove(adj.id); }}><Trash2 />Delete<ContextMenuShortcut>Del</ContextMenuShortcut></ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
