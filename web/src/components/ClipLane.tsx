import { useFilmstrip, type Filmstrip } from '@/lib/filmstrip';
import { clipboardKind, copySelection, hasClipboard, pasteAtPlayhead, pasteAttributes } from '@/lib/clipboard';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Clip, Project } from '@/types';
import { placeOnRow } from '@/lib/layers';
import { WAVEFORM_RATE } from '@/types';
import { useEditor } from '@/store';
import { currentTime } from '@/lib/player';
import { toast } from 'sonner';
import { extractCutout } from '@/lib/extractCutout';
import {
  changeSpeed, clipEnd, deleteClips, createCutoutLayer, duplicateClip, freezeFrame, link, moveClips, partnerOf, splitClips, trimLeft, trimRight, unlink,
} from '@/lib/clips';
import { hasClipFx, laneOf, migrateVideo } from '@/lib/videoFx';
import { geo } from '@/lib/timelineGeo';
import { loadSourceAudio } from '@/audio/clips';
import { waveformOf } from '@/audio/loudness';
import { formatClock } from '@/lib/srt';
import { cn } from '@/lib/utils';
import { Copy, PictureInPicture, Play, Scissors, Trash2 } from '@/components/icons';
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
  /** Make an overlay layer from the clip's cut-out so overlays can go behind or in front of the subject. */
  createCutout(id: string) {
    const st = useEditor.getState();
    const r = createCutoutLayer(st.project?.clips ?? [], id, st.project?.overlays);
    if (!r.id) return;
    st.setClips(() => r.clips);
    st.selectClip(r.id);
    st.setPanel('clip');
    // The layer shows a live matte at once; in the background the subject is rendered into its own transparent video, which then replaces it.
    const src = r.clips.find((x) => x.id === r.id)!;
    const tid = toast.loading('Extracting the cut-out into its own video layer… 0%');
    void extractCutout(src, (p) => toast.loading(`Extracting the cut-out into its own video layer… ${Math.round(p * 100)}%`, { id: tid }))
      .then((x) => {
        const cur = useEditor.getState().project?.clips?.find((c) => c.id === src.id);
        if (!cur || cur.assetId !== src.assetId) { toast.dismiss(tid); return; } // deleted or changed meanwhile
        useEditor.getState().setClips((cs) => cs.map((c) => (c.id === src.id ? {
          ...c, assetId: x.assetId, in: 0, speed: 1, freeze: false, sourceDuration: c.duration, width: x.width, height: x.height,
          fx: { ...migrateVideo(c.fx), matte: undefined, regionBlurs: [] },
        } : c)));
        toast.success('Cut-out extracted as its own video layer. Set text or images to Depth "Behind cut-out" to place them between it and the clip below.', { id: tid });
      })
      .catch((e: Error) => toast.error(e.name === 'AbortError' ? 'Extraction cancelled.' : `Could not extract the cut-out: ${e.message}. The layer keeps its live cut-out.`, { id: tid }));
  },
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
        {clip.kind === 'video' && <ContextMenuItem onClick={() => clipOps.createCutout(clip.id)}><PictureInPicture />Create cut-out layer</ContextMenuItem>}
        <ContextMenuItem onClick={() => copySelection()}><Copy />Copy<ContextMenuShortcut>⌘C</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem disabled={!hasClipboard()} onClick={() => pasteAtPlayhead(false)}>Paste at playhead<ContextMenuShortcut>⌘V</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem disabled={clipboardKind() !== 'clip'} onClick={() => pasteAtPlayhead(true)}>Paste as overlay window<ContextMenuShortcut>⌥⌘V</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem disabled={!hasClipboard()} onClick={() => pasteAttributes()}>Paste look only<ContextMenuShortcut>⇧⌘V</ContextMenuShortcut></ContextMenuItem>
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
  const drag = useRef<{ kind: 'move' | 'l' | 'r'; x0: number; orig: Clip[]; proj: Project } | null>(null);
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
    drag.current = { kind, x0: e.clientX, orig: st.project?.clips ?? [], proj: st.project! };
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
    // A taken row opens a new layer there, like dropping an overlay.
    useEditor.getState().update(() => {
      const next = { ...d.proj, clips: op(d.orig, clip.id, dt) };
      return toTrack !== undefined ? placeOnRow(next, clip.id, toTrack) : next;
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
  const strip = useFilmstrip(isVideo ? clip.assetId : undefined, clip.sourceDuration);
    return (
    <Menu clip={clip}>
      <div title={`${clip.name} · ${formatClock(clip.duration, true)}${clip.speed !== 1 ? ` · ${clip.speed}×` : ''}`}
        onPointerDown={(e) => down(e, 'move')} onPointerMove={move} onPointerUp={() => { drag.current = null; }}
        className={cn('group absolute overflow-hidden rounded-lg border text-[10px] font-medium transition-shadow',
          isVideo ? strip ? 'border-teal-600/70 bg-teal-800' : 'border-foreground/20 bg-secondary' : 'border-chart-3/50 bg-chart-3/20',
          selected ? 'border-primary shadow-md shadow-primary/30 ring-1 ring-primary' : partnerSelected ? 'ring-1 ring-primary/50' : '',
          hidden && 'opacity-35', clip.muted && 'opacity-50', locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing')}
        style={{ left: clip.start * pps + pad, width: w, top, height }}>
        {strip && <Strip fs={strip} clip={clip} pps={pps} w={w} height={height - HEAD} />}
        {path && <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${Math.max(0.01, clip.duration)} 1`} preserveAspectRatio="none"><path d={path} fill="rgba(80,200,140,0.55)" /></svg>}
        {clip.freeze && <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent_0_6px,rgba(255,255,255,0.08)_6px_12px)]" />}
        <span className={cn("pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-1 truncate px-1.5 text-foreground/90", strip && "bg-teal-700 text-white")} style={{ height: HEAD }}>
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

/** Frames laid along a clip block; each tile shows the source frame at its own time, so trimming and speed stay honest. */
const HEAD = 16;
const CELL = 1.25;

function Strip({ fs, clip, pps, w, height }: { fs: Filmstrip; clip: Clip; pps: number; w: number; height: number }) {
  // Fixed CapCut-like cells (frames are cropped to fill); an extremely long block gets wider ones to bound the element count.
  const tw = Math.max(12, height * CELL, w / 150);
  const n = Math.ceil(w / tw);
  const tiles = [];
  for (let i = 0; i < n; i++) {
    const src = clip.in + ((i * tw + tw / 2) / pps) * clip.speed;
    const f = fs.frames[Math.min(fs.frames.length - 1, Math.max(0, Math.floor(src / fs.step)))];
    tiles.push(<div key={i} className="absolute top-0 h-full bg-cover bg-center" style={{ left: i * tw, width: tw, backgroundImage: `url(${f})` }} />);
  }
  return <div className="pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden" style={{ height }}>{tiles}</div>;
}
