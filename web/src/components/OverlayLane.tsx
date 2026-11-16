import { useBlockThumb } from '@/lib/blockThumb';
import { deleteSelection, beginGroup, dragGroup, endGroup, isPrimaryPress, pressBlock, type Group } from '@/lib/multiSelect';
import { copySelection, cutSelection, hasClipboard, pasteAtPlayhead, pasteAttributes } from '@/lib/clipboard';
import { memo, useRef, useState } from 'react';
import type { OverlayItem, Project } from '@/types';
import { useEditor } from '@/store';
import { currentTime, seek } from '@/lib/player';
import { adjEnd, deleteAdj, duplicateAdj, splitAdj } from '@/lib/adj';
import { freeLayerRow, moveLayer, trimLayer } from '@/lib/layers';
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
    const o = makeOverlay(init, st.project?.overlays ?? [], st.project ?? undefined);
    st.setOverlays((l) => [...l, o]);
    st.selectOverlay(o.id);
    st.setPanel('overlay');
    return o.id;
  },
  /** A new text or sticker overlay with a preset look. `start` defaults to the playhead. */
  addText(text: string, presetId?: string, start = currentTime(), track?: number) {
    const preset = TEXT_PRESETS.find((p) => p.id === presetId) ?? BADGES.find((b) => b.id === presetId);
    return overlayOps.add({ kind: 'text', text, start, duration: Math.min(3, Math.max(1, (useEditor.getState().project?.duration ?? 3) - start)), track, apply: preset?.apply });
  },
  addSticker(text: string, start = currentTime(), track?: number) {
    return overlayOps.add({ kind: 'sticker', text, start, duration: Math.min(3, Math.max(1, (useEditor.getState().project?.duration ?? 3) - start)), track });
  },
  /** A generated scrolling feed to pin on a phone screen in the video, at the playhead. */
  addScreen(start = currentTime(), track?: number) {
    return overlayOps.add({ kind: 'screen', text: 'Phone screen', start, duration: Math.min(6, Math.max(2, (useEditor.getState().project?.duration ?? 6) - start)), track });
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
  duplicate(id: string) {
    useEditor.getState().update((p) => {
      const list = duplicateAdj(p.overlays ?? [], id), dup = list.at(-1);
      if (!dup || dup.id === id) return p;
      return { ...p, overlays: list.map((o) => (o === dup ? { ...o, track: freeLayerRow(p, o.start, o.duration, o.track) } : o)) };
    });
  },
  remove(id: string) { const st = useEditor.getState(); st.setOverlays((l) => deleteAdj(l, id)); st.selectOverlay(null); },
};

/** Nudge a drag of `dt` seconds so the moved edge(s) stick to the playhead, other blocks and clip starts and ends. A trim only moves its own edge. */
function snap(list: OverlayItem[], a: OverlayItem, dt: number, pps: number, edge: 'move' | 'l' | 'r' = 'move'): number {
  const edges = [0, currentTime(), ...list.filter((o) => o.id !== a.id).flatMap((o) => [o.start, adjEnd(o)]),
    ...(useEditor.getState().project?.clips ?? []).flatMap((c) => [c.start, clipEnd(c)])];
  let best = dt, bestD = SNAP_PX / pps;
  for (const mine of edge === 'l' ? [a.start + dt] : edge === 'r' ? [adjEnd(a) + dt] : [a.start + dt, adjEnd(a) + dt]) for (const e of edges) {
    const d = Math.abs(mine - e);
    if (d < bestD) { bestD = d; best = dt + (e - mine); }
  }
  return best;
}

export const OverlayBlock = memo(function OverlayBlock({ item, pps, pad, top, height }: { item: OverlayItem; pps: number; pad: number; top: number; height: number }) {
  const selected = useEditor((s) => s.selectedOverlayId === item.id || s.multiIds.includes(item.id));
  const locked = useEditor((s) => !!laneOf(s.project!, overlayLane(item.track)).locked);
  const hidden = useEditor((s) => !!laneOf(s.project!, overlayLane(item.track)).hidden);
  const drag = useRef<{ kind: 'move' | 'l' | 'r'; x0: number; orig: OverlayItem[]; proj: Project; group?: Group } | null>(null);
  const cell = Math.max(12, (height - 16) * 1.25, (item.duration * pps) / 150);
  const thumb = useBlockThumb(item.kind === 'image' ? item.assetId : undefined, 'image');

  const down = (e: React.PointerEvent, kind: 'move' | 'l' | 'r') => {
    if (!isPrimaryPress(e)) return;
    e.stopPropagation();
    const st = useEditor.getState();
    const press = kind === 'move' ? pressBlock(e, item.id) : 'single';
    if (press === 'toggled') return;
    if (press === 'single') st.selectOverlay(item.id);
    if (locked) return;
    drag.current = { kind, x0: e.clientX, orig: st.project?.overlays ?? [], proj: st.project!, group: press === 'group' ? beginGroup(item.id, e.clientX) : undefined };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const endDrag = () => { endGroup(drag.current?.group); drag.current = null; };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (e.buttons === 0) { endDrag(); return; } // the gesture ended without a pointerup
    if (d.group) { dragGroup(d.group, e.clientX, pps); return; }
    const raw = (e.clientX - d.x0) / pps;
    const a = d.orig.find((x) => x.id === item.id)!;
    const proj = d.proj;
    const upd = useEditor.getState().update;
    if (d.kind === 'move') upd(() => moveLayer(proj, item.id, snap(d.orig, a, raw, pps), geo.videoTrackAt(e.clientY)), `overlay-${item.id}`);
    else upd(() => trimLayer(proj, item.id, d.kind === 'l' ? 'l' : 'r', snap(d.orig, a, raw, pps, d.kind)), `overlay-${item.id}`);
  };
  // The block is memoised and doesn't re-render on playhead/clipboard changes, so read both when the menu opens.
  const [menu, setMenu] = useState({ canSplit: false, canPaste: false });
  const onMenuOpen = (o: boolean) => {
    if (!o) return;
    const t = currentTime();
    setMenu({ canSplit: t > item.start && t < adjEnd(item), canPaste: hasClipboard() });
    if (!useEditor.getState().multiIds.includes(item.id)) useEditor.getState().selectOverlay(item.id);
  };

  return (
    <ContextMenu onOpenChange={onMenuOpen}>
      <ContextMenuTrigger asChild>
        <div title={`${item.kind === 'text' ? 'Text' : item.kind === 'sticker' ? 'Sticker' : 'Image'}: ${overlayLabel(item)}`}
          onPointerDown={(e) => down(e, 'move')} onPointerMove={move} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
          className={cn('group absolute flex items-center gap-1.5 overflow-hidden rounded-lg border bg-black/40 text-xs font-medium text-white',
            item.kind === 'text' ? 'border-chart-1/70' : item.kind === 'sticker' ? 'border-chart-4/70' : 'border-chart-2/70',
            selected && 'ring-2 ring-primary', hidden && 'opacity-35', locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing')}
          style={{ left: item.start * pps + pad, width: Math.max(8, item.duration * pps), top, height }}>
          <span className={cn('pointer-events-none absolute inset-x-0 top-0 z-10 flex h-4 items-center gap-1 truncate px-1.5 text-[10px]', item.kind === 'text' ? 'bg-chart-1' : item.kind === 'sticker' ? 'bg-chart-4' : 'bg-chart-2')}>
            <span className="shrink-0">{item.kind === 'text' ? 'T' : item.kind === 'sticker' ? '☺' : item.kind === 'motion' ? '✦' : item.kind === 'screen' ? '▯' : '▣'}</span>
            <span className="sinhala truncate">{overlayLabel(item)}</span>
          </span>
          {thumb
            ? <div className="pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden" style={{ top: 16 }}>
              {Array.from({ length: Math.min(150, Math.ceil(Math.max(8, item.duration * pps) / cell)) }, (_, i) => <div key={i} className="absolute top-0 h-full bg-cover bg-center" style={{ left: i * cell, width: cell, backgroundImage: `url(${thumb})` }} />)}
            </div>
            : <span className="sinhala pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 truncate px-2" style={{ top: 16, fontSize: item.kind === 'sticker' ? 22 : 13, color: item.kind === 'text' ? item.color : undefined }}>{item.kind === 'sticker' ? item.text.slice(0, 3) : item.kind === 'text' ? item.text.split('\n')[0] : '✦'}</span>}
          
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
        <ContextMenuItem disabled={!menu.canSplit} onClick={() => overlayOps.splitAtPlayhead(item.id)}><Scissors />Split at playhead<ContextMenuShortcut>S</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem onClick={() => overlayOps.duplicate(item.id)}><Copy />Duplicate</ContextMenuItem>
        <ContextMenuItem onClick={() => copySelection()}><Copy />Copy<ContextMenuShortcut>⌘C</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem onClick={() => cutSelection()}>Cut<ContextMenuShortcut>⌘X</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem disabled={!menu.canPaste} onClick={() => pasteAtPlayhead(false)}>Paste at playhead<ContextMenuShortcut>⌘V</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem disabled={!menu.canPaste} onClick={() => pasteAttributes()}>Paste look only<ContextMenuShortcut>⇧⌘V</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => { if (!deleteSelection()) overlayOps.remove(item.id); }}><Trash2 />Delete<ContextMenuShortcut>Del</ContextMenuShortcut></ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
