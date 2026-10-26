import { copySelection, cutSelection, hasClipboard, pasteAtPlayhead, pasteAttributes } from '@/lib/clipboard';
import { memo, useRef } from 'react';
import type { OverlayItem } from '@/types';
import { useEditor } from '@/store';
import { currentTime, seek } from '@/lib/player';
import { adjEnd, deleteAdj, duplicateAdj, moveAdj, splitAdj, trimAdjLeft, trimAdjRight } from '@/lib/adj';
import { clipEnd } from '@/lib/clips';
import { laneOf } from '@/lib/videoFx';
import { makeOverlay, overlayLabel, TEXT_PRESETS, BADGES, type OverlayInit } from '@/lib/overlays';
import { overlayLane } from '@/render/overlays';
import { geo } from '@/lib/timelineGeo';
import { cn } from '@/lib/utils';
import { Copy, Scissors, Trash2 } from '@/components/icons';
import { Lock } from '@/components/icons-audio';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger } from '@/components/ui/context-menu';

const SNAP_PX = 8;

/** Edit helpers for overlays. All go through the store so they undo. */
export const overlayOps = {
  add(init: OverlayInit): string {
    const st = useEditor.getState();
    const o = makeOverlay(init, st.project?.overlays ?? []);
    st.setOverlays((l) => [...l, o]);
    st.selectOverlay(o.id);
    st.setPanel('overlay');
    return o.id;
  },
  /** A new text or sticker overlay with a preset look. `start` defaults to the playhead. */
  addText(text: string, presetId?: string, start = currentTime(), track = 0) {
    const preset = TEXT_PRESETS.find((p) => p.id === presetId) ?? BADGES.find((b) => b.id === presetId);
    return overlayOps.add({ kind: 'text', text, start, duration: Math.min(3, Math.max(1, (useEditor.getState().project?.duration ?? 3) - start)), track, apply: preset?.apply });
  },
  addSticker(text: string, start = currentTime(), track = 0) {
    return overlayOps.add({ kind: 'sticker', text, start, duration: Math.min(3, Math.max(1, (useEditor.getState().project?.duration ?? 3) - start)), track });
  },
  splitAtPlayhead(id?: string) {
    const st = useEditor.getState();
    const target = id ?? st.selectedOverlayId;
    if (!target) return false;
    const r = splitAdj(st.project?.overlays ?? [], target, currentTime());
    if (!r.id) return false;
    st.setOverlays(() => r.adj);
    return true;
  },
  duplicate(id: string) { useEditor.getState().setOverlays((l) => duplicateAdj(l, id)); },
  remove(id: string) { const st = useEditor.getState(); st.setOverlays((l) => deleteAdj(l, id)); st.selectOverlay(null); },
};

function snap(list: OverlayItem[], a: OverlayItem, dt: number, pps: number): number {
  const edges = [0, currentTime(), ...list.filter((o) => o.id !== a.id).flatMap((o) => [o.start, adjEnd(o)]),
    ...(useEditor.getState().project?.clips ?? []).flatMap((c) => [c.start, clipEnd(c)])];
  let best = dt, bestD = SNAP_PX / pps;
  for (const mine of [a.start + dt, adjEnd(a) + dt]) for (const e of edges) {
    const d = Math.abs(mine - e);
    if (d < bestD) { bestD = d; best = dt + (e - mine); }
  }
  return best;
}

export const OverlayBlock = memo(function OverlayBlock({ item, pps, pad, top, height }: { item: OverlayItem; pps: number; pad: number; top: number; height: number }) {
  const selected = useEditor((s) => s.selectedOverlayId === item.id);
  const locked = useEditor((s) => !!laneOf(s.project!, overlayLane(item.track)).locked);
  const hidden = useEditor((s) => !!laneOf(s.project!, overlayLane(item.track)).hidden);
  const drag = useRef<{ kind: 'move' | 'l' | 'r'; x0: number; orig: OverlayItem[] } | null>(null);

  const down = (e: React.PointerEvent, kind: 'move' | 'l' | 'r') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const st = useEditor.getState();
    st.selectOverlay(item.id);
    if (locked) return;
    drag.current = { kind, x0: e.clientX, orig: st.project?.overlays ?? [] };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const raw = (e.clientX - d.x0) / pps;
    const a = d.orig.find((x) => x.id === item.id)!;
    const set = useEditor.getState().setOverlays;
    if (d.kind === 'move') set(() => moveAdj(d.orig, item.id, snap(d.orig, a, raw, pps), geo.overlayTrackAt(e.clientY)), `overlay-${item.id}`);
    else if (d.kind === 'l') set(() => trimAdjLeft(d.orig, item.id, raw), `overlay-${item.id}`);
    else set(() => trimAdjRight(d.orig, item.id, raw), `overlay-${item.id}`);
  };
  const canSplit = (() => { const t = currentTime(); return t > item.start && t < adjEnd(item); })();
  const icon = item.kind === 'text' ? 'T' : item.kind === 'sticker' ? item.text.slice(0, 2) : '▣';

  return (
    <ContextMenu onOpenChange={(o) => o && useEditor.getState().selectOverlay(item.id)}>
      <ContextMenuTrigger asChild>
        <div title={`${item.kind === 'text' ? 'Text' : item.kind === 'sticker' ? 'Sticker' : 'Image'}: ${overlayLabel(item)}`}
          onPointerDown={(e) => down(e, 'move')} onPointerMove={move} onPointerUp={() => { drag.current = null; }}
          className={cn('group absolute flex items-center gap-1.5 overflow-hidden rounded-lg border px-2 text-xs font-medium text-white',
            item.kind === 'text' ? 'border-chart-1/70 bg-chart-1/60' : item.kind === 'sticker' ? 'border-chart-4/70 bg-chart-4/60' : 'border-chart-2/70 bg-chart-2/60',
            selected && 'ring-2 ring-primary', hidden && 'opacity-35', locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing')}
          style={{ left: item.start * pps + pad, width: Math.max(8, item.duration * pps), top, height }}>
          <span className="pointer-events-none shrink-0 font-semibold">{icon}</span>
          <span className="sinhala pointer-events-none truncate">{item.kind === 'sticker' ? '' : overlayLabel(item)}</span>
          {(item.keyframes ?? []).map((k) => (
            <button key={k.id} type="button" title="Keyframe" aria-label="Keyframe" onPointerDown={(e) => { e.stopPropagation(); useEditor.getState().selectOverlay(item.id); seek(item.start + k.t); }}
              className="keyframe-diamond absolute bottom-0.5 z-10 size-2.5 bg-white hover:scale-125" style={{ left: k.t * pps - 5 }} />
          ))}
          {locked && <Lock className="ml-auto size-3" />}
          <span onPointerDown={(e) => down(e, 'l')} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-white/0 group-hover:bg-white/30" />
          <span onPointerDown={(e) => down(e, 'r')} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/0 group-hover:bg-white/30" />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem disabled={!canSplit} onClick={() => overlayOps.splitAtPlayhead(item.id)}><Scissors />Split at playhead<ContextMenuShortcut>S</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem onClick={() => overlayOps.duplicate(item.id)}><Copy />Duplicate</ContextMenuItem>
        <ContextMenuItem onClick={() => copySelection()}><Copy />Copy<ContextMenuShortcut>⌘C</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem onClick={() => cutSelection()}>Cut<ContextMenuShortcut>⌘X</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem disabled={!hasClipboard()} onClick={() => pasteAtPlayhead(false)}>Paste at playhead<ContextMenuShortcut>⌘V</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem disabled={!hasClipboard()} onClick={() => pasteAttributes()}>Paste look only<ContextMenuShortcut>⇧⌘V</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => overlayOps.remove(item.id)}><Trash2 />Delete<ContextMenuShortcut>Del</ContextMenuShortcut></ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
