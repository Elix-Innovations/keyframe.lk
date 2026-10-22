import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Clip } from '@/types';
import { WAVEFORM_RATE } from '@/types';
import { useEditor } from '@/store';
import { currentTime } from '@/lib/player';
import {
  changeSpeed, clipEnd, deleteClips, duplicateClip, freezeFrame, link, moveClips, partnerOf, setVideoTrack, splitClips, trimLeft, trimRight, unlink,
} from '@/lib/clips';
import { hasClipFx, laneOf } from '@/lib/videoFx';
import { geo } from '@/lib/timelineGeo';
import { loadSourceAudio } from '@/audio/clips';
import { waveformOf } from '@/audio/loudness';
import { formatClock } from '@/lib/srt';
import { cn } from '@/lib/utils';
import { Copy, Play, Scissors, Trash2 } from '@/components/icons';
import { Lock, Volume, VolumeOff } from '@/components/icons-audio';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger,
} from '@/components/ui/context-menu';

const SNAP_PX = 8;
export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

const peaks = new Map<string, Promise<number[] | null>>();
function peaksOf(assetId: string) {
  let p = peaks.get(assetId);
  if (!p) { p = loadSourceAudio(assetId).then((b) => (b ? waveformOf(b, WAVEFORM_RATE) : null)).catch(() => null); peaks.set(assetId, p); }
  return p;
}

/** Edit helpers shared by blocks, menus, toolbar and keys. All go through the store so they undo. */
export const clipOps = {
  splitAtPlayhead(ids?: string[]) {
    const st = useEditor.getState();
    const t = currentTime();
    const cs = st.project?.clips ?? [];
    const targets = ids ?? (st.selectedClipId ? [st.selectedClipId] : cs.filter((c) => t > c.start && t < clipEnd(c)).map((c) => c.id));
    const r = splitClips(cs, targets, t);
    if (!r.ids.length) return false;
    st.setClips(() => r.clips);
    return true;
  },
  remove(id: string, ripple = useEditor.getState().rippleDelete) {
    const st = useEditor.getState();
    st.setClips((cs) => deleteClips(cs, [id], ripple));
    st.selectClip(null);
  },
  duplicate(id: string) { useEditor.getState().setClips((cs) => duplicateClip(cs, id)); },
  speed(id: string, s: number) { useEditor.getState().setClips((cs) => changeSpeed(cs, id, s)); },
  freeze(id: string) { useEditor.getState().setClips((cs) => freezeFrame(cs, id, currentTime())); },
  unlink(id: string) { useEditor.getState().setClips((cs) => unlink(cs, id)); },
  /** Link the clip with the nearest overlapping clip of the other kind that is not linked. */
  link(id: string) {
    useEditor.getState().setClips((cs) => {
      const c = cs.find((x) => x.id === id);
      if (!c) return cs;
      const mid = c.start + c.duration / 2;
      const other = cs
        .filter((x) => x.kind !== c.kind && !x.linkId && x.assetId === c.assetId)
        .sort((a, b) => Math.abs(a.start + a.duration / 2 - mid) - Math.abs(b.start + b.duration / 2 - mid))[0]
        ?? cs.filter((x) => x.kind !== c.kind && !x.linkId).sort((a, b) => Math.abs(a.start + a.duration / 2 - mid) - Math.abs(b.start + b.duration / 2 - mid))[0];
      return other ? link(cs, id, other.id) : cs;
    });
  },
  mute(id: string) { useEditor.getState().setClips((cs) => cs.map((c) => (c.id === id ? { ...c, muted: !c.muted } : c))); },
};

function snapDt(clips: Clip[], group: Clip[], dt: number, pps: number): number {
  const ids = new Set(group.map((g) => g.id));
  const edges = [0, currentTime(), ...clips.filter((c) => !ids.has(c.id)).flatMap((c) => [c.start, clipEnd(c)])];
  let best = dt, bestD = SNAP_PX / pps;
  for (const g of group) for (const mine of [g.start + dt, clipEnd(g) + dt]) for (const e of edges) {
    const d = Math.abs(mine - e);
    if (d < bestD) { bestD = d; best = dt + (e - mine); }
  }
  return best;
}

function Menu({ clip, children }: { clip: Clip; children: React.ReactNode }) {
  const linked = !!clip.linkId;
  const t = currentTime();
  const canSplit = t > clip.start && t < clipEnd(clip);
  return (
    <ContextMenu onOpenChange={(o) => o && useEditor.getState().selectClip(clip.id)}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        <ContextMenuItem disabled={!canSplit} onClick={() => clipOps.splitAtPlayhead([clip.id])}><Scissors />Split at playhead<ContextMenuShortcut>S</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem onClick={() => clipOps.duplicate(clip.id)}><Copy />Duplicate</ContextMenuItem>
        {clip.kind === 'video' && <ContextMenuItem disabled={!canSplit} onClick={() => clipOps.freeze(clip.id)}><Play />Freeze frame (2 s)</ContextMenuItem>}
        <ContextMenuSeparator />
        {linked
          ? <ContextMenuItem onClick={() => clipOps.unlink(clip.id)}>Unlink video and audio</ContextMenuItem>
          : <ContextMenuItem onClick={() => clipOps.link(clip.id)}>Link with {clip.kind === 'video' ? 'audio' : 'video'}</ContextMenuItem>}
        {clip.kind === 'audio' && <ContextMenuItem onClick={() => clipOps.mute(clip.id)}>{clip.muted ? <Volume /> : <VolumeOff />}{clip.muted ? 'Unmute' : 'Mute'}</ContextMenuItem>}
        <ContextMenuSeparator />
        {clip.freeze ? null : SPEEDS.map((s) => (
          <ContextMenuItem key={s} onClick={() => clipOps.speed(clip.id, s)}>Speed {s}×{clip.speed === s && ' ✓'}</ContextMenuItem>
        ))}
        {!clip.freeze && <ContextMenuSeparator />}
        <ContextMenuItem onClick={() => clipOps.remove(clip.id, false)} variant="destructive"><Trash2 />Delete<ContextMenuShortcut>Del</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem onClick={() => clipOps.remove(clip.id, true)} variant="destructive"><Trash2 />Delete and close gap</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export const ClipBlock = memo(function ClipBlock({ clip, pps, pad, top, height }: { clip: Clip; pps: number; pad: number; top: number; height: number }) {
  const selected = useEditor((s) => s.selectedClipId === clip.id);
  const partnerSelected = useEditor((s) => {
    const sel = s.project?.clips?.find((c) => c.id === s.selectedClipId);
    return !!sel && sel.linkId === clip.linkId && !!clip.linkId && sel.id !== clip.id;
  });
  const laneKey = clip.kind === 'audio' ? 'audio' : (clip.track ?? 0) === 0 ? 'video' : `video:${clip.track}`;
  const locked = useEditor((s) => !!laneOf(s.project!, laneKey).locked);
  const hidden = useEditor((s) => !!laneOf(s.project!, laneKey).hidden);
  const drag = useRef<{ kind: 'move' | 'l' | 'r'; x0: number; orig: Clip[] } | null>(null);
  const [wf, setWf] = useState<number[] | null>(null);
  useEffect(() => {
    if (clip.kind !== 'audio') return;
    let live = true;
    void peaksOf(clip.assetId).then((p) => { if (live) setWf(p); });
    return () => { live = false; };
  }, [clip.assetId, clip.kind]);

  const down = (e: React.PointerEvent, kind: 'move' | 'l' | 'r') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const st = useEditor.getState();
    st.selectClip(clip.id);
    if (locked) return;
    drag.current = { kind, x0: e.clientX, orig: st.project?.clips ?? [] };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const raw = (e.clientX - d.x0) / pps;
    const c = d.orig.find((x) => x.id === clip.id)!;
    const group = [c, partnerOf(d.orig, c)].filter(Boolean) as Clip[];
    const dt = d.kind === 'move' ? snapDt(d.orig, group, raw, pps) : raw;
    const op = d.kind === 'move' ? moveClips : d.kind === 'l' ? trimLeft : trimRight;
    const toTrack = d.kind === 'move' && clip.kind === 'video' ? geo.videoTrackAt(e.clientY) : undefined;
    useEditor.getState().setClips(() => {
      const moved = op(d.orig, clip.id, dt);
      return toTrack !== undefined ? setVideoTrack(moved, clip.id, toTrack) : moved;
    }, `clip-${clip.id}`);
  };

  const w = Math.max(6, clip.duration * pps);
  const path = useMemo(() => {
    if (!wf?.length) return '';
    const step = Math.max(1 / WAVEFORM_RATE, 1 / Math.max(1, pps));
    const topPts: string[] = [], bot: string[] = [];
    for (let x = 0; x <= clip.duration; x += step) {
      const v = wf[Math.min(wf.length - 1, Math.max(0, Math.floor((clip.in + x * clip.speed) * WAVEFORM_RATE)))] ?? 0;
      const lx = x.toFixed(3);
      topPts.push(`${lx},${(0.5 - v * 0.45).toFixed(3)}`);
      bot.push(`${lx},${(0.5 + v * 0.45).toFixed(3)}`);
    }
    return `M${topPts.join('L')}L${bot.reverse().join('L')}Z`;
  }, [wf, clip.in, clip.duration, clip.speed, pps]);

  const isVideo = clip.kind === 'video';
  return (
    <Menu clip={clip}>
      <div title={`${clip.name} · ${formatClock(clip.duration, true)}${clip.speed !== 1 ? ` · ${clip.speed}×` : ''}`}
        onPointerDown={(e) => down(e, 'move')} onPointerMove={move} onPointerUp={() => { drag.current = null; }}
        className={cn('group absolute overflow-hidden rounded-lg border text-[10px] font-medium transition-shadow',
          isVideo ? 'border-foreground/20 bg-secondary' : 'border-chart-3/50 bg-chart-3/20',
          selected ? 'border-primary shadow-md shadow-primary/30 ring-1 ring-primary' : partnerSelected ? 'ring-1 ring-primary/50' : '',
          hidden && 'opacity-35', clip.muted && 'opacity-50', locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing')}
        style={{ left: clip.start * pps + pad, width: w, top, height }}>
        {path && <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${Math.max(0.01, clip.duration)} 1`} preserveAspectRatio="none"><path d={path} fill="rgba(80,200,140,0.55)" /></svg>}
        {clip.freeze && <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent_0_6px,rgba(255,255,255,0.08)_6px_12px)]" />}
        <span className="pointer-events-none absolute left-1.5 top-0.5 flex max-w-[92%] items-center gap-1 truncate text-foreground/90">
          {clip.linkId && <span title="Linked" className="grid size-3 place-items-center rounded-sm bg-primary/80 text-[8px] text-white">⛓</span>}
          {clip.muted && <VolumeOff className="size-3" />}
          <span className="truncate">{clip.freeze ? 'Freeze · ' : ''}{clip.name}</span>
          {clip.speed !== 1 && <span className="rounded bg-black/50 px-1 text-white">{clip.speed}×</span>}
          {hasClipFx(clip.fx) && <span title="This clip has its own filter, effect, transition or crop" className="rounded bg-brand-2/80 px-1 text-white">fx</span>}
        </span>
        {locked && <Lock className="absolute right-1 top-1 size-3 text-muted-foreground" />}
        <span onPointerDown={(e) => down(e, 'l')} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-foreground/0 group-hover:bg-foreground/30" />
        <span onPointerDown={(e) => down(e, 'r')} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-foreground/0 group-hover:bg-foreground/30" />
      </div>
    </Menu>
  );
});
