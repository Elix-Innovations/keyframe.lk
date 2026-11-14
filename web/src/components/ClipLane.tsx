import { useFilmstrip, type Filmstrip } from '@/lib/filmstrip';
import { clipboardKind, copyEdits, copySelection, hasClipboard, hasEdits, pasteAtPlayhead, pasteAttributes, pasteEdits } from '@/lib/clipboard';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Clip, Project, SpeedPt } from '@/types';
import { placeOnRow } from '@/lib/layers';
import { WAVEFORM_RATE } from '@/types';
import { useEditor } from '@/store';
import { deleteSelection, beginGroup, dragGroup, endGroup, pressBlock, type Group } from '@/lib/multiSelect';
import { currentTime } from '@/lib/player';
import { toast } from 'sonner';
import { extractCutout, extracting } from '@/lib/extractCutout';
import { extractFrame } from '@/lib/extractFrame';
import { generateCaptionsFromAudio } from '@/lib/captionsFromAudio';
import {
  changeCurve, changeSpeed, clipEnd, sourceTimeAt, deleteClips, createCutoutLayer, duplicateClip, freezeFrame, link, captionsFollowClips, mainSlotAt, moveClips, partnerOf, reorderMain, shiftAfter, splitClips, trimLeft, trimRight, unlink,
} from '@/lib/clips';
import { hasClipFx, laneOf, migrateVideo, TRANSITIONS } from '@/lib/videoFx';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ColorInput, Segmented, Slider } from '@/components/controls';
import { PreviewTile } from '@/components/panels/EffectsPanel';
import { usePreviewSourceSync } from '@/components/FxPreview';
import { geo } from '@/lib/timelineGeo';
import { loadSourceAudio } from '@/audio/clips';
import { waveformOf } from '@/audio/loudness';
import { formatClock } from '@/lib/srt';
import { cn } from '@/lib/utils';
import { AudioLines, Copy, ImagePlus, PictureInPicture, Play, Scissors, Trash2 } from '@/components/icons';
import { Lock, Volume, VolumeOff } from '@/components/icons-audio';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger,
} from '@/components/ui/context-menu';

const SNAP_PX = 8;
export const WAVE_K = { short: 0.55, default: 1, tall: 1.7 };
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
  createCutout(id: string, opts: { hands?: boolean; above?: number; from?: number; to?: number } = {}) {
    const st = useEditor.getState();
    const r = createCutoutLayer(st.project?.clips ?? [], id, st.project?.overlays, opts);
    if (!r.id) return;
    st.setClips(() => r.clips);
    st.selectClip(r.id);
    st.setPanel('clip');
    // The layer shows a live matte at once; in the background the subject is rendered into its own transparent video, which then replaces it.
    const src = r.clips.find((x) => x.id === r.id)!;
    const tid = toast.loading('Extracting the cut-out into its own video layer… 0%');
    extracting.add(src.id);
    void extractCutout(src, (p) => toast.loading(`Extracting the cut-out into its own video layer… ${Math.round(p * 100)}%`, { id: tid }))
      .finally(() => extracting.delete(src.id))
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
  curve(id: string, pts: SpeedPt[] | undefined, key?: string) { useEditor.getState().setClips((cs) => changeCurve(cs, id, pts), key); },
  reverse(id: string) {
    useEditor.getState().setClips((cs) => {
      const c = cs.find((x) => x.id === id);
      if (!c) return cs;
      const on = !c.reverse;
      return cs.map((x) => (x.id === id || (c.linkId && x.linkId === c.linkId) ? { ...x, reverse: on } : x));
    });
  },
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

/** Nudge a drag of `dt` seconds so the moved edge(s) stick to the playhead and other clips' starts and ends. A trim only moves its own edge. */
function snapDt(clips: Clip[], group: Clip[], dt: number, pps: number, edge: 'move' | 'l' | 'r' = 'move'): number {
  const ids = new Set(group.map((g) => g.id));
  const edges = [0, currentTime(), ...clips.filter((c) => !ids.has(c.id)).flatMap((c) => [c.start, clipEnd(c)])];
  let best = dt, bestD = SNAP_PX / pps;
  for (const g of group) for (const mine of edge === 'l' ? [g.start + dt] : edge === 'r' ? [clipEnd(g) + dt] : [g.start + dt, clipEnd(g) + dt]) for (const e of edges) {
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
    <ContextMenu onOpenChange={(o) => o && !useEditor.getState().multiIds.includes(clip.id) && useEditor.getState().selectClip(clip.id)}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        <ContextMenuItem disabled={!canSplit} onClick={() => clipOps.splitAtPlayhead([clip.id])}><Scissors />Split at playhead<ContextMenuShortcut>S</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem onClick={() => clipOps.duplicate(clip.id)}><Copy />Duplicate</ContextMenuItem>
        {(clip.kind === 'audio' || clip.linkId) && <ContextMenuItem onClick={() => void generateCaptionsFromAudio(clip.id)}><AudioLines />Generate captions from audio</ContextMenuItem>}
        {clip.kind === 'video' && (
          <ContextMenuSub>
            <ContextMenuSubTrigger><ImagePlus />Extract frame</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem onClick={() => void extractFrame(clip.id, 'layer')}>Next to clip, same layer</ContextMenuItem>
              <ContextMenuItem onClick={() => void extractFrame(clip.id, 'overlay')}>As overlay</ContextMenuItem>
              <ContextMenuItem onClick={() => void extractFrame(clip.id, 'save')}>Save as PNG</ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        {clip.kind === 'video' && <ContextMenuItem onClick={() => clipOps.createCutout(clip.id)}><PictureInPicture />Create cut-out layer</ContextMenuItem>}
        <ContextMenuItem onClick={() => copySelection()}><Copy />Copy<ContextMenuShortcut>⌘C</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem disabled={!hasClipboard()} onClick={() => pasteAtPlayhead(false)}>Paste at playhead<ContextMenuShortcut>⌘V</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem disabled={clipboardKind() !== 'clip'} onClick={() => pasteAtPlayhead(true)}>Paste as overlay window<ContextMenuShortcut>⌥⌘V</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem disabled={!hasClipboard()} onClick={() => pasteAttributes()}>Paste look only<ContextMenuShortcut>⇧⌘V</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem onClick={() => copyEdits()}><Copy />Copy edits<ContextMenuShortcut>⌥⌘C</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem disabled={!hasEdits()} onClick={() => pasteEdits()}>Paste edits<ContextMenuShortcut>⌥⇧⌘V</ContextMenuShortcut></ContextMenuItem>
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
        <ContextMenuItem onClick={() => { if (!deleteSelection()) clipOps.remove(clip.id, false); }} variant="destructive"><Trash2 />Delete<ContextMenuShortcut>Del</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem onClick={() => clipOps.remove(clip.id, true)} variant="destructive"><Trash2 />Delete and close gap</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export const ClipBlock = memo(function ClipBlock({ clip, pps, pad, top, height }: { clip: Clip; pps: number; pad: number; top: number; height: number }) {
  const selected = useEditor((s) => s.selectedClipId === clip.id || s.multiIds.includes(clip.id));
  const partnerSelected = useEditor((s) => {
    const sel = s.project?.clips?.find((c) => c.id === s.selectedClipId);
    return !!sel && sel.linkId === clip.linkId && !!clip.linkId && sel.id !== clip.id;
  });
  const laneKey = clip.kind === 'audio' ? 'audio' : (clip.track ?? 0) === 0 ? 'video' : `video:${clip.track}`;
  const locked = useEditor((s) => !!laneOf(s.project!, laneKey).locked);
  const hidden = useEditor((s) => !!laneOf(s.project!, laneKey).hidden);
  const waveK = useEditor((s) => WAVE_K[laneOf(s.project!, laneKey).wave ?? 'default']);
  const drag = useRef<{ kind: 'move' | 'l' | 'r'; x0: number; orig: Clip[]; proj: Project; group?: Group } | null>(null);
  const [wf, setWf] = useState<number[] | null>(null);
  // Set while a main-track clip is being re-ordered: it shrinks to one frame and follows the pointer by `x` px.
  const [lift, setLift] = useState<{ x: number } | null>(null);
  const TILE = 64;
  useEffect(() => {
    if (clip.kind !== 'audio' && !clip.linkId) return;
    let live = true;
    void peaksOf(clip.assetId).then((p) => { if (live) setWf(p); });
    return () => { live = false; };
  }, [clip.assetId, clip.kind, clip.linkId]);

  const down = (e: React.PointerEvent, kind: 'move' | 'l' | 'r') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const st = useEditor.getState();
    const press = kind === 'move' ? pressBlock(e, clip.id) : 'single';
    if (press === 'toggled') return;
    if (press === 'single') st.selectClip(clip.id);
    if (locked) return;
    drag.current = { kind, x0: e.clientX, orig: st.project?.clips ?? [], proj: st.project!, group: press === 'group' ? beginGroup(clip.id, e.clientX) : undefined };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.group) { dragGroup(d.group, e.clientX, pps); return; }
    const raw = (e.clientX - d.x0) / pps;
    const c = d.orig.find((x) => x.id === clip.id)!;
    const group = [c, partnerOf(d.orig, c)].filter(Boolean) as Clip[];
    const dt = snapDt(d.orig, group, raw, pps, d.kind);
    const op = d.kind === 'move' ? moveClips : d.kind === 'l' ? trimLeft : trimRight;
    const toTrack = d.kind === 'move' && clip.kind === 'video' ? geo.videoTrackAt(e.clientY) : undefined;
    // Dragging a main-track clip past a neighbour re-orders the track, like CapCut: the clip shows as one frame while it travels.
    if (d.kind === 'move' && clip.kind === 'video' && (clip.track ?? 0) === 0 && (toTrack === undefined || toTrack === 0)) {
      const at = geo.timeAt(e.clientX);
      const slot = mainSlotAt(d.orig, clip.id, at);
      const cur = d.orig.filter((o) => o.kind === 'video' && (o.track ?? 0) === 0).sort((a, b) => a.start - b.start).findIndex((o) => o.id === clip.id);
      if (slot !== cur) {
        const next = reorderMain(d.orig, clip.id, slot);
        const placed = next.find((o) => o.id === clip.id)!;
        const tile = Math.min(TILE, Math.max(6, clip.duration * pps));
        setLift({ x: at * pps + pad - tile / 2 - (placed.start * pps + pad) });
        useEditor.getState().update(() => ({ ...d.proj, clips: next, captions: captionsFollowClips(d.proj.captions, d.orig, next) }), `clip-${clip.id}`);
        return;
      }
      setLift(null);
    }
    // A taken row opens a new layer there, like dropping an overlay.
    useEditor.getState().update(() => {
      const clips = op(d.orig, clip.id, dt);
      let next: Project = { ...d.proj, clips };
      // Growing or shrinking a main-track clip carries everything after it (captions, overlays, filters) along.
      if (d.kind === 'r' && clip.kind === 'video' && (clip.track ?? 0) === 0) {
        next = shiftAfter({ ...next, captions: captionsFollowClips(d.proj.captions, d.orig, clips) }, clipEnd(c), clipEnd(clips.find((x) => x.id === clip.id)!) - clipEnd(c));
      }
      return toTrack !== undefined ? placeOnRow(next, clip.id, toTrack) : next;
    }, `clip-${clip.id}`);
  };

  const w = Math.max(6, clip.duration * pps);
  // The volume line edits the audio this block shows: its own, or the linked audio clip's for video.
  const volClip = useEditor((s) => (clip.kind === 'audio' ? clip : partnerOf(s.project?.clips ?? [], clip)));
  const volDb = volClip?.volume ?? 0;
  // The wave grows and shrinks with the volume, and the band is taller on taller tracks, like CapCut.
  const gain = volClip?.muted || clip.muted ? 0 : Math.pow(10, volDb / 20);
  const waveH = Math.max(WAVE_H, Math.round(height * 0.42));
  const path = useMemo(() => {
    if (!wf?.length) return '';
    const step = Math.max(1 / WAVEFORM_RATE, 1 / Math.max(1, pps));
    const topPts: string[] = [], bot: string[] = [];
    for (let x = 0; x <= clip.duration; x += step) {
      const v = wf[Math.min(wf.length - 1, Math.max(0, Math.floor(sourceTimeAt(clip, clip.start + x) * WAVEFORM_RATE)))] ?? 0;
      const lx = x.toFixed(3);
      topPts.push(`${lx},${(0.5 - Math.min(0.5, v * 0.6 * waveK * gain)).toFixed(3)}`);
      bot.push(`${lx},${(0.5 + Math.min(0.5, v * 0.6 * waveK * gain)).toFixed(3)}`);
    }
    return `M${topPts.join('L')}L${bot.reverse().join('L')}Z`;
  }, [wf, clip.in, clip.duration, clip.speed, clip.curve, pps, waveK, gain]);

  const isVideo = clip.kind === 'video';
  const volDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (locked || !volClip) return;
    const band = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
    const set = (ev: PointerEvent) => {
      const f = Math.min(1, Math.max(0, (ev.clientY - band.top) / band.height));
      const db = Math.round((VOL_MAX - f * (VOL_MAX - VOL_MIN)) * 2) / 2;
      useEditor.getState().setClips((cs) => cs.map((c) => (c.id === volClip.id ? { ...c, volume: db } : c)), `clipvol-${volClip.id}`);
    };
    const up = () => { window.removeEventListener('pointermove', set); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', set);
    window.addEventListener('pointerup', up);
    set(e.nativeEvent);
  };
  const strip = useFilmstrip(isVideo ? clip.assetId : undefined, clip.sourceDuration);
    return (
    <Menu clip={clip}>
      <div title={`${clip.name} · ${formatClock(clip.duration, true)}${clip.speed !== 1 ? ` · ${clip.speed}×` : ''}`}
        onPointerDown={(e) => down(e, 'move')} onPointerMove={move} onPointerUp={() => { endGroup(drag.current?.group); if (drag.current && isVideo && (clip.track ?? 0) === 0) useEditor.getState().setClips((cs) => cs, `clip-${clip.id}`); drag.current = null; setLift(null); }}
        className={cn('group absolute overflow-hidden rounded-lg border text-[10px] font-medium transition-shadow',
          isVideo ? strip ? 'border-teal-600/70 bg-teal-800' : 'border-foreground/20 bg-secondary' : 'border-chart-3/50 bg-chart-3/20',
          selected ? (isVideo ? 'border-white ring-2 ring-white' : 'border-primary shadow-md shadow-primary/30 ring-1 ring-primary') : partnerSelected ? 'ring-1 ring-primary/50' : '',
          lift && 'z-30 opacity-90 shadow-xl ring-2 ring-white', hidden && 'opacity-35', clip.muted && 'opacity-50', locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing')}
        style={{ left: clip.start * pps + pad, width: lift ? Math.min(TILE, w) : w, top, height, transform: lift ? `translateX(${lift.x}px)` : undefined }}>
        {strip && <Strip fs={strip} clip={clip} pps={pps} w={lift ? Math.min(TILE, w) : w} height={height - HEAD - (path ? waveH : 0)} lift={path ? waveH : 0} />}
        {path && (isVideo
          ? <svg className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/25" style={{ height: waveH }} viewBox={`0 0 ${Math.max(0.01, clip.duration)} 1`} preserveAspectRatio="none" width="100%" height={waveH}><path d={path} fill="rgba(110,230,215,0.65)" /></svg>
          : <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${Math.max(0.01, clip.duration)} 1`} preserveAspectRatio="none"><path d={path} fill="rgba(80,200,140,0.55)" /></svg>)}
        {path && selected && volClip && (
          <div className="absolute inset-x-0 z-10" style={isVideo ? { bottom: 0, height: waveH } : { top: HEAD, bottom: 0 }}>
            <div onPointerDown={volDrag} title={`Volume ${volDb > 0 ? '+' : ''}${volDb} dB: drag up or down`}
              className="group/vol absolute inset-x-0 flex h-3 -translate-y-1/2 cursor-ns-resize items-center"
              style={{ top: `${(1 - (volDb - VOL_MIN) / (VOL_MAX - VOL_MIN)) * 100}%` }}>
              <span className="h-px w-full bg-white/90 shadow-[0_0_2px_rgba(0,0,0,0.8)]" />
              <span className="absolute left-1/2 size-2 -translate-x-1/2 rounded-full border border-black/70 bg-white" />
            </div>
          </div>
        )}
        {clip.freeze && <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent_0_6px,rgba(255,255,255,0.08)_6px_12px)]" />}
        <span className={cn("pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-1 truncate px-1.5 text-foreground/90", strip && "bg-teal-700 text-white")} style={{ height: HEAD }}>
          {clip.linkId && <span title="Linked" className="grid size-3 place-items-center rounded-sm bg-primary/80 text-[8px] text-white">⛓</span>}
          {clip.muted && <VolumeOff className="size-3" />}
          <span className={cn('truncate', isVideo && 'rounded bg-black/30 px-1')}>{clip.freeze ? 'Freeze · ' : ''}{clip.name}</span>
          {isVideo && <span className="shrink-0 rounded bg-black/30 px-1 tabular-nums text-white">{formatClock(clip.duration, true)}</span>}
          {clip.speed !== 1 && <span className="rounded bg-black/50 px-1 text-white">{clip.speed}×</span>}
          {hasClipFx(clip.fx) && <span title="This clip has its own filter, effect, transition or crop" className="rounded bg-brand-2/80 px-1 text-white">fx</span>}
        </span>
        {locked && <Lock className="absolute right-1 top-1 size-3 text-muted-foreground" />}
        <span onPointerDown={(e) => down(e, 'l')} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-foreground/0 group-hover:bg-foreground/30" />
        <span onPointerDown={(e) => down(e, 'r')} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-foreground/0 group-hover:bg-foreground/30" />
        {isVideo && (['transitionIn', 'transitionOut'] as const).map((side) => <TransitionBadge key={side} clip={clip} side={side} pps={pps} />)}
        {selected && isVideo && !locked && ['l', 'r'].map((k) => (
          <span key={k} onPointerDown={(e) => down(e, k as 'l' | 'r')} style={{ top: height - (path ? waveH : 0) - 5 }}
            className={cn('absolute z-20 size-2.5 cursor-ew-resize rounded-full border-2 border-black/80 bg-white', k === 'l' ? 'left-0.5' : 'right-0.5')} />
        ))}
      </div>
    </Menu>
  );
});

/** Frames laid along a clip block; each tile shows the source frame at its own time, so trimming and speed stay honest. */
const HEAD = 16;
/** Height of the waveform band along the bottom of a video clip. */
/** A transition set on a video clip's start or end: sits at that edge on the timeline; click it to swap, retime or remove it. */
function TransitionBadge({ clip, side, pps }: { clip: Clip; side: 'transitionIn' | 'transitionOut'; pps: number }) {
  const t = migrateVideo(clip.fx)[side];
  const setClips = useEditor((s) => s.setClips);
  if (t.id === 'none') return null;
  const start = side === 'transitionIn';
  const maxD = Math.max(0.2, Math.min(3, clip.duration / 2));
  const patch = (p: Partial<typeof t>, key?: string) =>
    setClips((cs) => cs.map((c) => (c.id === clip.id ? { ...c, fx: { ...migrateVideo(c.fx), [side]: { ...migrateVideo(c.fx)[side], ...p } } as never } : c)), key && `trans-${side}-${clip.id}`);
  const label = TRANSITIONS.find((x) => x.id === t.id)?.label ?? t.id;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" onPointerDown={(e) => { e.stopPropagation(); useEditor.getState().selectClip(clip.id); }}
          title={`${start ? 'Start' : 'End'} transition: ${label} (click to change)`}
          className={cn('absolute top-1/2 z-20 flex h-6 -translate-y-1/2 cursor-pointer items-center rounded-md border border-white/70 bg-black/60 px-1 text-white backdrop-blur-sm hover:bg-black/80', start ? 'left-3' : 'right-3')}
          style={{ minWidth: Math.min(Math.max(18, t.duration * pps), 60) }}>
          <TransitionIcon className="mx-auto size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[26rem] space-y-2 p-2" onPointerDown={(e) => e.stopPropagation()}>
        <TransitionPicker id={t.id} duration={t.duration} maxD={maxD} title={`${start ? 'Start' : 'End'} transition: ${label}`} patch={patch} />
      </PopoverContent>
    </Popover>
  );
}

/** The bow-tie mark for a transition: two clips meeting in the middle. */
function TransitionIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className={className} aria-hidden>
      <path d="M3 5l9 7-9 7z" /><path d="M21 5l-9 7 9 7z" />
    </svg>
  );
}

/** Transition list with a live preview on the footage (hover a tile to play it). Only mounted while the popup is open. */
function TransitionPicker({ id, duration, maxD, title, patch }: { id: string; duration: number; maxD: number; title: string; patch: (p: { id?: never; duration?: number } | Record<string, unknown>, key?: string) => void }) {
  usePreviewSourceSync();
  const fit = useEditor((s) => s.project!.fit);
  const fitColor = useEditor((s) => s.project!.fitColor ?? '#000000');
  const update = useEditor((s) => s.update);
  return (
    <>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{title}</span>
        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => patch({ id: 'none' })}>Remove</button>
      </div>
      <div className="flex items-center gap-2 text-xs"><span className="w-12 shrink-0 text-muted-foreground">Length</span>
        <Slider value={duration} min={0.1} max={maxD} step={0.05} format={(v) => `${v.toFixed(2)}s`} onChange={(d) => patch({ duration: d }, 'len')} /></div>
      <div className="flex items-center gap-2 text-xs"><span className="w-12 shrink-0 text-muted-foreground">Backdrop</span>
        <Segmented size="sm" value={fit === 'color' || fit === 'blur' ? fit : 'contain'} onChange={(v: 'blur' | 'color' | 'contain') => update((p) => ({ ...p, fit: v }))}
          options={[{ value: 'blur', label: 'Blur' }, { value: 'color', label: 'Color' }, { value: 'contain', label: 'Black' }]} />
        {fit === 'color' && <ColorInput value={fitColor} onChange={(c) => update((p) => ({ ...p, fitColor: c }), 'fit-color')} />}
      </div>
      <div className="grid max-h-72 grid-cols-4 gap-1.5 overflow-y-auto pr-0.5">
        {TRANSITIONS.filter((x) => x.id !== 'none').map((x) => (
          <div key={x.id} onClick={() => patch({ id: x.id })} className="cursor-pointer">
            <PreviewTile spec={{ transition: x.id }} label={x.label} on={x.id === id} />
          </div>
        ))}
      </div>
    </>
  );
}

const WAVE_H = 22;
/** Range of the on-clip volume line, in dB (matches the Volume slider). */
const VOL_MIN = -30, VOL_MAX = 12;
const CELL = 1.25;

function Strip({ fs, clip, pps, w, height, lift = 0 }: { fs: Filmstrip; clip: Clip; pps: number; w: number; height: number; lift?: number }) {
  // Fixed CapCut-like cells (frames are cropped to fill); an extremely long block gets wider ones to bound the element count.
  const tw = Math.max(12, height * CELL, w / 150);
  const n = Math.ceil(w / tw);
  const tiles = [];
  for (let i = 0; i < n; i++) {
    const src = sourceTimeAt(clip, clip.start + (i * tw + tw / 2) / pps);
    const f = fs.frames[Math.min(fs.frames.length - 1, Math.max(0, Math.floor(src / fs.step)))];
    tiles.push(<div key={i} className="absolute top-0 h-full bg-cover bg-center" style={{ left: i * tw, width: tw, backgroundImage: `url(${f})` }} />);
  }
  return <div className="pointer-events-none absolute inset-x-0 overflow-hidden" style={{ height, bottom: lift }}>{tiles}</div>;
}
