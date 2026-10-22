import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { ChevronLeft, ChevronRight, Copy, Plus, Crosshair, Merge, Pencil, Play, Redo2, Scissors, Trash2, Type, Undo2, ZoomIn, ZoomOut } from '@/components/icons';
import { Eye, EyeOff, Layers, Link, Lock, Magnet, Ripple, Unlock, Volume, VolumeOff } from '@/components/icons-audio';
import type { Caption, LaneGroup, MusicTrack } from '@/types';
import { WAVEFORM_RATE } from '@/types';
import { nearestBeat, trackGainCurve, trackSegments } from '@/audio/mix';
import { useEditor } from '@/store';
import { seek, currentTime, playRange } from '@/lib/player';
import { mergeCaptions, normalizeCaptions, shiftCaptions, splitCaptionAt } from '@/lib/segment';
import { cn } from '@/lib/utils';
import { laneOf, migrateVideo } from '@/lib/videoFx';
import { audioRows, clipEnd, copyClipTo, trackOf, videoClips, videoTrackCount } from '@/lib/clips';
import { trackCount } from '@/lib/adj';
import { groupOrder, moveGroup, moveLane, type LaneKind } from '@/lib/laneOrder';
import { DRAG_MIME, geo, type DragPayload } from '@/lib/timelineGeo';
import { importMedia } from '@/lib/importMedia';
import { addSound, trackOps, waveformForAsset } from '@/lib/sounds';
import { AdjBlock, adjLane, adjOps } from './AdjLane';
import { OverlayBlock, overlayOps } from './OverlayLane';
import { overlayLane } from '@/render/overlays';
import { ClipBlock, clipOps } from './ClipLane';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger,
} from '@/components/ui/context-menu';

const LANE_H = 48;
const HEAD = 148; // sticky track-header column
const PAD = HEAD + 12; // time 0 sits just right of the headers
const MUSIC_H = 46;
const FX_H = 28;
const GAP = 6;

type LaneField = 'hidden' | 'locked';
function toggleLane(key: string, field: LaneField) {
  useEditor.getState().update((p) => ({ ...p, lanes: { ...p.lanes, [key]: { ...p.lanes?.[key], [field]: !p.lanes?.[key]?.[field] } } }));
}

/** Header cell for one timeline row: icon, name and the hide / lock / mute switches. */
function LaneHeader({ top, height, label, icon, laneKey, eye = true, lock = true, mute, order }: {
  top: number; height: number; label: string; icon: React.ReactNode; laneKey: string; eye?: boolean; lock?: boolean;
  mute?: { on: boolean; toggle: () => void };
  /** Makes the header draggable: drop it on another group to move the whole group, or on another track of its own group to reorder tracks. */
  order?: { group: LaneGroup; groupAt: (clientY: number) => LaneGroup; kind?: LaneKind; track?: number; count?: number; at?: (clientY: number) => number | undefined };
}) {
  const [drag, setDrag] = useState<{ y0: number; dy: number } | null>(null);
  const grab = (e: React.PointerEvent) => {
    if (!order || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ y0: e.clientY, dy: 0 });
  };
  const move = (e: React.PointerEvent) => setDrag((d) => (d ? { ...d, dy: e.clientY - d.y0 } : d));
  const drop = (e: React.PointerEvent) => {
    if (!drag || !order) return;
    setDrag(null);
    const g = order.groupAt(e.clientY);
    const st = useEditor.getState();
    if (g !== order.group) st.update((p) => moveGroup(p, order.group, g));
    else if (order.kind && order.track !== undefined && order.count && order.at) {
      const to = Math.min(order.count - 1, order.at(e.clientY) ?? order.track);
      if (to !== order.track) st.update((p) => moveLane(p, order.kind!, order.track!, to));
    }
  };
  const lane = useEditor((s) => laneOf(s.project!, laneKey));
  const Btn = ({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children: React.ReactNode }) => (
    <button title={title} aria-label={title} aria-pressed={on} onClick={onClick}
      className={cn('grid size-5 place-items-center rounded transition-colors [&_svg]:size-3.5', on ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground')}>{children}</button>
  );
  return (
    <div className={cn('absolute left-0 border-b border-r bg-card px-2', drag && 'z-30 bg-accent shadow-lg', height < 36 ? 'flex flex-row items-center gap-1' : 'flex flex-col justify-center gap-1')} style={{ top, height, width: HEAD, ...(drag ? { transform: `translateY(${drag.dy}px)` } : {}) }}>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] font-medium text-foreground/90 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground">{order && <span title="Drag to reorder" aria-label="Drag to reorder" onPointerDown={grab} onPointerMove={move} onPointerUp={drop} onPointerCancel={() => setDrag(null)}
          className="-ml-1 grid size-5 shrink-0 cursor-grab touch-none select-none place-items-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground active:cursor-grabbing">⠿</span>}
        {icon}<span className="truncate">{label}</span></div>
      <div className="flex shrink-0 gap-0.5">
        {eye && <Btn on={!!lane.hidden} title={lane.hidden ? 'Show' : 'Hide'} onClick={() => toggleLane(laneKey, 'hidden')}>{lane.hidden ? <EyeOff /> : <Eye />}</Btn>}
        {lock && <Btn on={!!lane.locked} title={lane.locked ? 'Unlock' : 'Lock'} onClick={() => toggleLane(laneKey, 'locked')}>{lane.locked ? <Lock /> : <Unlock />}</Btn>}
        {mute && <Btn on={mute.on} title={mute.on ? 'Unmute' : 'Mute'} onClick={mute.toggle}>{mute.on ? <VolumeOff /> : <Volume />}</Btn>}
      </div>
    </div>
  );
}

/** One music track on the timeline: waveform, beat ticks, ducking curve; drag to move, trim either end. */
const MusicBlock = memo(function MusicBlock({ t, pps, top }: { t: MusicTrack; pps: number; top: number }) {
  const captions = useEditor((s) => s.project!.captions);
  const ducking = useEditor((s) => s.project!.audio.ducking);
  const normalize = useEditor((s) => s.project!.audio.normalize);
  const update = useEditor((s) => s.update);
  const drag = useRef<{ kind: 'move' | 'l' | 'r'; x0: number; orig: MusicTrack } | null>(null);
  const locked = useEditor((s) => !!laneOf(s.project!, `music:${t.id}`).locked);
  const selected = useEditor((s) => s.selectedTrackId === t.id);
  const patch = (p: Partial<MusicTrack>) => update((pr) => ({ ...pr, audio: { ...pr.audio, tracks: pr.audio.tracks.map((x) => (x.id === t.id ? { ...x, ...p } : x)) } }), `music-${t.id}`);
  const onDown = (e: React.PointerEvent, kind: 'move' | 'l' | 'r') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    useEditor.getState().selectTrack(t.id);
    if (locked) return;
    drag.current = { kind, x0: e.clientX, orig: t };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dt = (e.clientX - d.x0) / pps, o = d.orig;
    const maxLen = o.loop ? Infinity : o.fileDuration - o.offset;
    if (d.kind === 'move') patch({ start: Math.max(0, o.start + dt), layer: geo.soundLayerAt(e.clientY) ?? (o.layer ?? 0) });
    else if (d.kind === 'r') patch({ duration: Math.min(maxLen, Math.max(0.5, o.duration + dt)) });
    else {
      const k = Math.min(Math.max(dt, -o.start, -o.offset), o.duration - 0.5);
      patch({ start: o.start + k, offset: o.offset + k, duration: o.duration - k });
    }
  };
  const w = Math.max(6, t.duration * pps);
  // Tracks saved without analysis (older sounds) get their peaks decoded on demand.
  const stored = t.analysis?.waveform;
  const [lazy, setLazy] = useState<number[] | null>(null);
  useEffect(() => {
    if (stored?.length) return;
    let live = true;
    waveformForAsset(t.assetId).then((w) => live && setLazy(w)).catch(() => {});
    return () => { live = false; };
  }, [t.assetId, stored]);
  const wf = useMemo(() => (stored?.length ? stored : lazy ?? []), [stored, lazy]);
  // Waveform path in track-local seconds (viewBox units), following loops.
  const path = useMemo(() => {
    if (!wf.length) return '';
    const segs = trackSegments(t);
    const step = Math.max(1 / WAVEFORM_RATE, 1 / Math.max(1, pps)); // ≈ one point per pixel
    const top: string[] = [], bot: string[] = [];
    for (const sg of segs) {
      for (let x = 0; x <= sg.dur; x += step) {
        // Peak over the whole step, so zoomed-out views don't skip transients.
        const i0 = Math.min(wf.length - 1, Math.floor((sg.offset + x) * WAVEFORM_RATE));
        const i1 = Math.min(wf.length - 1, Math.max(i0, Math.floor((sg.offset + Math.min(sg.dur, x + step)) * WAVEFORM_RATE)));
        let v = 0;
        for (let i = i0; i <= i1; i++) if (wf[i] > v) v = wf[i];
        const lx = (sg.when - t.start + x).toFixed(3);
        top.push(`${lx},${(0.5 - v * 0.45).toFixed(3)}`);
        bot.push(`${lx},${(0.5 + v * 0.45).toFixed(3)}`);
      }
    }
    return `M${top.join('L')}L${bot.reverse().join('L')}Z`;
  }, [t, pps, wf]);
  const duck = useMemo(() => {
    const project = useEditor.getState().project!;
    const curve = trackGainCurve(t, { ...project, captions, audio: { ...project.audio, ducking, normalize } });
    let gmax = 1e-4;
    for (const p of curve) if (p.g > gmax) gmax = p.g;
    return curve.map((p) => `${(p.t - t.start).toFixed(2)},${(0.08 + 0.84 * (1 - p.g / gmax)).toFixed(3)}`).join(' ');
  }, [t, captions, ducking, normalize]);
  const beats = useMemo(() => (t.analysis?.beats ?? []).flatMap((b) => trackSegments(t).filter((sg) => b >= sg.offset && b <= sg.offset + sg.dur).map((sg) => sg.when - t.start + (b - sg.offset))), [t]);
  return (
    <ContextMenu onOpenChange={(o) => o && useEditor.getState().selectTrack(t.id)}>
    <ContextMenuTrigger asChild>
    <div className={cn('group absolute overflow-hidden rounded-md border border-chart-5/40 bg-chart-5/10', selected && 'ring-2 ring-primary', t.muted && 'opacity-40', locked && 'cursor-not-allowed')}
      style={{ left: t.start * pps + PAD, width: w, top, height: MUSIC_H }}
      onPointerDown={(e) => onDown(e, 'move')} onPointerMove={onMove} onPointerUp={() => { drag.current = null; }}>
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${Math.max(0.01, t.duration)} 1`} preserveAspectRatio="none">
        {path && <path d={path} fill="rgba(214,92,184,0.5)" />}
        {beats.map((b, i) => <line key={i} x1={b} x2={b} y1={0.82} y2={1} stroke="rgba(255,255,255,0.35)" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
        <polyline points={duck} fill="none" stroke="rgb(255,200,80)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="pointer-events-none absolute left-1.5 top-0.5 max-w-[90%] truncate text-[10px] font-medium text-foreground/90">♪ {t.name}</span>
      <span onPointerDown={(e) => onDown(e, 'l')} className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize group-hover:bg-foreground/30" />
      <span onPointerDown={(e) => onDown(e, 'r')} className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize group-hover:bg-foreground/30" />
    </div>
    </ContextMenuTrigger>
    <ContextMenuContent className="w-56">
      <ContextMenuItem disabled={!trackOps.canSplit(t.id)} onClick={() => trackOps.splitAtPlayhead(t.id)}><Scissors />Split at playhead<ContextMenuShortcut>S</ContextMenuShortcut></ContextMenuItem>
      <ContextMenuItem onClick={() => trackOps.duplicate(t.id)}><Copy />Duplicate</ContextMenuItem>
      <ContextMenuItem onClick={() => trackOps.toggleMute(t.id)}>{t.muted ? <Volume /> : <VolumeOff />}{t.muted ? 'Unmute' : 'Mute'}</ContextMenuItem>
      <ContextMenuItem onClick={() => { useEditor.getState().setPanel('audio'); }}><Pencil />Edit volume and fades…</ContextMenuItem>
      <ContextMenuItem onClick={() => patch({ start: Math.max(0, currentTime()) })}><Crosshair />Move to playhead</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onClick={() => trackOps.remove(t.id)}><Trash2 />Delete<ContextMenuShortcut>Del</ContextMenuShortcut></ContextMenuItem>
    </ContextMenuContent>
    </ContextMenu>
  );
});

/** Linearly remap a caption's word timings into a new [start, end]. */
function retime(c: Caption, start: number, end: number): Caption {
  const span = c.end - c.start || 1;
  const map = (t: number) => start + ((t - c.start) / span) * (end - start);
  return { ...c, start, end, words: c.words.map((w) => ({ ...w, start: map(w.start), end: map(w.end) })) };
}

function CaptionMenu({ c, children }: { c: Caption; children: React.ReactNode }) {
  const st = useEditor.getState;
  const all = () => st().project!.captions;
  const idx = () => all().findIndex((x) => x.id === c.id);
  const t = currentTime();
  const canSplit = t > c.start && t < c.end && c.words.length > 1;
  return (
    <ContextMenu onOpenChange={(o) => o && st().select(c.id)}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onClick={() => playRange(c.start, c.end)}><Play />Play caption</ContextMenuItem>
        <ContextMenuItem onClick={() => { seek(c.start); st().setPanel('captions'); }}><Pencil />Edit text</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!canSplit} onClick={() => {
          const parts = splitCaptionAt(c, currentTime());
          if (parts) st().setCaptions(all().flatMap((x) => (x.id === c.id ? parts : [x])));
        }}><Scissors />Split at playhead<ContextMenuShortcut>S</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem disabled={idx() >= all().length - 1} onClick={() => {
          const i = idx(), next = all()[i + 1];
          if (next) st().setCaptions([...all().slice(0, i), mergeCaptions(c, next), ...all().slice(i + 2)]);
        }}><Merge />Merge with next<ContextMenuShortcut>M</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem onClick={() => {
          const len = c.end - c.start;
          const copy: Caption = { ...retime(c, c.end, c.end + len), id: nanoid(8) };
          copy.words = copy.words.map((w) => ({ ...w, id: nanoid(8) }));
          st().setCaptions([...all(), copy]);
        }}><Copy />Duplicate after</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => st().setCaptions(shiftCaptions(all(), [c.id], -0.1))}><ChevronLeft />Nudge −100 ms</ContextMenuItem>
        <ContextMenuItem onClick={() => st().setCaptions(shiftCaptions(all(), [c.id], 0.1))}><ChevronRight />Nudge +100 ms</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => { st().setCaptions(all().filter((x) => x.id !== c.id)); st().select(null); }}>
          <Trash2 />Delete<ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function Timeline() {
  const project = useEditor((s) => s.project)!;
  const time = useEditor((s) => s.time);
  const playing = useEditor((s) => s.playing);
  const selected = useEditor((s) => s.selectedCaptionId);
  const select = useEditor((s) => s.select);
  const setCaptions = useEditor((s) => s.setCaptions);
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [zoom, setZoom] = useState(1); // 1 = whole video fits
  const dur = Math.max(project.duration, project.captions.at(-1)?.end ?? 0, 1);
  const pps = Math.max(8, ((width - PAD - 16) / dur) * zoom); // pixels per second
  const total = dur * pps + PAD + 16;

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep playhead in view while playing.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !playing) return;
    const x = time * pps + PAD;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = x - 60;
  }, [time, playing, pps]);

  const ticks = useMemo(() => {
    const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const step = steps.find((s) => s * pps >= 70) ?? 600;
    const out: number[] = [];
    for (let t = 0; t <= dur; t += step) out.push(t);
    return out;
  }, [pps, dur]);

  // Dragging captions: move or resize edges.
  const drag = useRef<{ id: string; kind: 'move' | 'l' | 'r'; x0: number; orig: Caption; others: Caption[] } | null>(null);
  const onBlockDown = (e: React.PointerEvent, c: Caption, kind: 'move' | 'l' | 'r') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    select(c.id);
    if (laneOf(useEditor.getState().project!, 'captions').locked) return;
    drag.current = { id: c.id, kind, x0: e.clientX, orig: c, others: project.captions };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onBlockMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dt = (e.clientX - d.x0) / pps;
    const i = d.others.findIndex((c) => c.id === d.id);
    const prevEnd = i > 0 ? d.others[i - 1].end : 0;
    const nextStart = i < d.others.length - 1 ? d.others[i + 1].start : dur;
    const o = d.orig;
    let s = o.start, en = o.end;
    if (d.kind === 'move') {
      let want = dt;
      const proj = useEditor.getState().project!;
      if (proj.audio.snapToBeats) { const b = nearestBeat(proj, o.start + dt, 0.2); if (b !== null) want = b - o.start; }
      const shift = Math.min(Math.max(want, prevEnd - o.start), nextStart - o.end);
      s = o.start + shift; en = o.end + shift;
    } else if (d.kind === 'l') s = Math.min(Math.max(o.start + dt, prevEnd), o.end - 0.1);
    else en = Math.max(Math.min(o.end + dt, nextStart), o.start + 0.1);
    setCaptions(normalizeCaptions(d.others.map((c) => (c.id === d.id ? retime(o, s, en) : c))), `drag-${d.id}`);
  };
  const onBlockUp = () => { drag.current = null; };

  // Scrub on ruler / empty area.
  const scrub = useRef(false);
  const tAt = (e: React.PointerEvent) => {
    const r = scroller.current!.getBoundingClientRect();
    return (e.clientX - r.left + scroller.current!.scrollLeft - PAD) / pps;
  };
  const setZoomKeepCenter = (z: number) => {
    const el = scroller.current!;
    const center = (el.scrollLeft + el.clientWidth / 2) / pps;
    const nz = Math.min(40, Math.max(1, z));
    setZoom(nz);
    requestAnimationFrame(() => { el.scrollLeft = center * ((width - PAD - 16) / dur) * nz - el.clientWidth / 2; });
  };

  const AUD_H = 40;
  const aRows = audioRows(project.clips ?? []);
  const audioRowCount = Math.max(1, ...aRows.map((r) => r.row + 1));
  const nAdj = trackCount(project.adj ?? []);
  const nOvl = trackCount(project.overlays ?? []);
  const nVid = videoTrackCount(project.clips ?? []);
  const nSound = project.audio.tracks.length ? Math.max(...project.audio.tracks.map((t) => t.layer ?? 0)) + 1 : 0;
  const capsTop = 30;
  const order = groupOrder(project);
  const sizes: Record<LaneGroup, number> = {
    overlay: nOvl * (FX_H + GAP), adj: nAdj * (FX_H + GAP), video: nVid * (LANE_H + GAP),
    audio: audioRowCount * (AUD_H + 4) + GAP, broll: FX_H + GAP, sound: nSound * (MUSIC_H + GAP),
  };
  const area = {} as Record<LaneGroup, number>;
  let acc = capsTop + LANE_H + GAP;
  for (const g of order) { area[g] = acc; acc += sizes[g]; }
  const ovlArea = area.overlay, adjArea = area.adj, videoArea = area.video, audioTop = area.audio;
  const ovlTop = (track: number) => ovlArea + (nOvl - 1 - track) * (FX_H + GAP);
  const adjTop = (track: number) => adjArea + (nAdj - 1 - track) * (FX_H + GAP);
  const videoTop = (track: number) => videoArea + (nVid - 1 - track) * (LANE_H + GAP);
  const rows = { ruler: 0, caps: capsTop, extra: area.broll };
  const musicTop = (layer: number) => area.sound + layer * (MUSIC_H + GAP);
  const bottom = acc + 8;
  /** Row under a pointer y inside one group; a new track above when the pointer is just above the top group. */
  const trackIn = (g: LaneGroup, y: number, count: number, h: number) => {
    if (y < area[g] - 4) return order[0] === g ? count : undefined;
    if (y >= area[g] + sizes[g]) return undefined;
    return Math.max(0, Math.min(count - 1, count - 1 - Math.floor((y - area[g]) / h)));
  };
  const groupAt = (clientY: number): LaneGroup => {
    const y = contentY(clientY);
    return order.find((g) => y < area[g] + sizes[g]) ?? order[order.length - 1];
  };
  const [dropAt, setDropAt] = useState<{ x: number; y: number } | null>(null);
  // Publish row geometry so clip blocks can turn a pointer position into a track while dragging.
  const contentY = (clientY: number) => clientY - scroller.current!.getBoundingClientRect().top + scroller.current!.scrollTop;
  geo.timeAt = (clientX) => (clientX - scroller.current!.getBoundingClientRect().left + scroller.current!.scrollLeft - PAD) / pps;
  geo.overlayTrackAt = (clientY) => trackIn('overlay', contentY(clientY), nOvl, FX_H + GAP);
  geo.adjTrackAt = (clientY) => trackIn('adj', contentY(clientY), nAdj, FX_H + GAP);
  geo.videoTrackAt = (clientY) => trackIn('video', contentY(clientY), nVid, LANE_H + GAP);
  geo.soundLayerAt = (clientY) => {
    const y = contentY(clientY);
    if (y < area.sound - GAP) return undefined;
    return Math.max(0, Math.min(nSound, Math.floor((y - area.sound) / (MUSIC_H + GAP))));
  };
  // CapCut's "+": add media right after the last clip of a video track.
  const plusInput = useRef<HTMLInputElement>(null);
  const plusTarget = useRef({ track: 0, start: 0 });
  const addAfterEnd = async (files: FileList | null) => {
    if (!files) return;
    let start = plusTarget.current.start;
    for (const f of Array.from(files)) {
      try { await importMedia(f, null, { start, track: plusTarget.current.track }); } catch (err) { useEditor.getState().notify((err as Error).message, 'error'); }
      const clips = useEditor.getState().project?.clips ?? [];
      start = Math.max(start, ...clips.filter((c) => c.kind === 'video' && trackOf(c) === plusTarget.current.track).map(clipEnd));
    }
  };
  const selClip = useEditor((s) => s.selectedClipId);
  const selectedClip = (project.clips ?? []).find((c) => c.id === selClip) ?? null;
  const rippleDelete = useEditor((s) => s.rippleDelete);
  const sel = project.captions.find((c) => c.id === selected) ?? null;
  const canUndo = useEditor((s) => s.past.length > 0), canRedo = useEditor((s) => s.future.length > 0);

  const selOverlay = useEditor((s) => s.selectedOverlayId);
  const selTrack = useEditor((s) => s.selectedTrackId);
  const splitHere = () => {
    if (selTrack && trackOps.splitAtPlayhead()) return;
    if (selOverlay && overlayOps.splitAtPlayhead()) return;
    if (clipOps.splitAtPlayhead()) return;
    const t = currentTime();
    const target = project.captions.find((c) => t > c.start && t < c.end);
    const parts = target && splitCaptionAt(target, t);
    if (target && parts) setCaptions(project.captions.flatMap((c) => (c.id === target.id ? parts : [c])));
  };
  const Tool = ({ label, onClick, disabled, active, children }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean; children: React.ReactNode }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick} className={cn(active && 'bg-primary/15 text-primary')}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );

  const isDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(DRAG_MIME) || e.dataTransfer.types.includes('Files');
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropAt(null);
    const t = Math.max(0, geo.timeAt(e.clientX));
    const st = useEditor.getState();
    const clips = st.project?.clips ?? [];
    const vTrack = geo.videoTrackAt(e.clientY);
    const under = vTrack === undefined ? undefined : clips.find((c) => c.kind === 'video' && trackOf(c) === vTrack && t >= c.start && t < c.start + c.duration);
    if (e.dataTransfer.files.length) {
      for (const f of Array.from(e.dataTransfer.files)) {
        try { await importMedia(f, null, { start: t, track: vTrack ?? 0 }); } catch (err) { st.notify((err as Error).message, 'error'); }
      }
      return;
    }
    let payload: DragPayload;
    try { payload = JSON.parse(e.dataTransfer.getData(DRAG_MIME)); } catch { return; }
    if (payload.type === 'sound') {
      addSound(payload.sound, t, geo.soundLayerAt(e.clientY)).catch((err) => st.notify((err as Error).message, 'error'));
    } else if (payload.type === 'overlay') {
      const oTrack = geo.overlayTrackAt(e.clientY);
      if (payload.kind === 'sticker') overlayOps.addSticker(payload.text, t, oTrack ?? 0);
      else overlayOps.addText(payload.text, payload.presetId, t, oTrack ?? 0);
    } else if (payload.type === 'fx') {
      const aTrack = geo.adjTrackAt(e.clientY);
      const dur = under ? under.duration : 3;
      adjOps.addAt(payload.kind, payload.refId, under ? under.start : t, Math.min(dur, Math.max(0.5, (st.project?.duration || dur + t) - (under ? under.start : t))), aTrack ?? 0);
    } else if (payload.type === 'transition') {
      if (!under) { st.notify('Drop a transition onto a video clip.', 'info'); return; }
      const which = t < under.start + under.duration / 2 ? 'transitionIn' : 'transitionOut';
      st.setClips((cs) => cs.map((c) => (c.id === under.id ? { ...c, fx: { ...migrateVideo(c.fx), [which]: { id: payload.id, duration: Math.min(0.8, under.duration / 2) } } as never } : c)));
      st.selectClip(under.id);
    } else if (payload.type === 'media') {
      const r = copyClipTo(clips, payload.clipId, t, vTrack ?? 0);
      if (r.id) { st.setClips(() => r.clips); st.selectClip(r.id); }
    }
  };

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2 text-xs text-muted-foreground">
        <Tool label="Undo" disabled={!canUndo} onClick={() => useEditor.getState().undo()}><Undo2 /></Tool>
        <Tool label="Redo" disabled={!canRedo} onClick={() => useEditor.getState().redo()}><Redo2 /></Tool>
        <span className="mx-1 h-5 w-px bg-border" />
        <Tool label="Split at playhead (S)" onClick={splitHere}><Scissors /></Tool>
        <Tool label="Delete selected (Del)" disabled={!sel && !selectedClip && !selOverlay && !selTrack} onClick={() => { if (selTrack) trackOps.remove(selTrack); else if (selOverlay) overlayOps.remove(selOverlay); else if (selectedClip) clipOps.remove(selectedClip.id); else if (sel) { setCaptions(project.captions.filter((c) => c.id !== sel.id)); select(null); } }}><Trash2 /></Tool>
        <Tool label={selectedClip?.linkId ? 'Unlink video and audio' : 'Link selected clip with its audio / video'} disabled={!selectedClip}
          active={!!selectedClip?.linkId} onClick={() => { if (selectedClip) { if (selectedClip.linkId) clipOps.unlink(selectedClip.id); else clipOps.link(selectedClip.id); } }}><Link /></Tool>
        <Tool label="Ripple delete: closing the gap when a clip is deleted" active={rippleDelete} onClick={() => useEditor.getState().setRippleDelete(!rippleDelete)}><Ripple /></Tool>
        <span className="mx-1 h-5 w-px bg-border" />
        <Tool label="Snap to beats" active={project.audio.snapToBeats} onClick={() => useEditor.getState().update((p) => ({ ...p, audio: { ...p.audio, snapToBeats: !p.audio.snapToBeats } }))}><Magnet /></Tool>
        <span className="ml-2 hidden md:inline">{project.captions.length} captions · right-click a caption for more</span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon-xs" onClick={() => setZoomKeepCenter(zoom / 1.5)} aria-label="Zoom out"><ZoomOut /></Button>
          <Slider className="w-28" min={1} max={40} step={0.1} value={[zoom]} onValueChange={([z]) => setZoomKeepCenter(z)} />
          <Button variant="ghost" size="icon-xs" onClick={() => setZoomKeepCenter(zoom * 1.5)} aria-label="Zoom in"><ZoomIn /></Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="Find playhead"
                onClick={() => { const el = scroller.current!; el.scrollLeft = currentTime() * pps - el.clientWidth / 2; }}><Crosshair /></Button>
            </TooltipTrigger>
            <TooltipContent>Find playhead</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div ref={scroller} className="relative min-h-0 flex-1 overflow-x-auto overflow-y-auto"
        onDragOver={(e) => { if (!isDrag(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropAt({ x: e.clientX, y: e.clientY }); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDropAt(null); }}
        onDrop={(e) => void onDrop(e)}
        onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom((z) => Math.min(40, Math.max(1, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))); } }}
        onPointerDown={(e) => { if (e.button !== 0) return; scrub.current = true; seek(tAt(e)); select(null); useEditor.getState().selectClip(null); useEditor.getState().selectOverlay(null); useEditor.getState().selectAdj(null); useEditor.getState().selectTrack(null); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (scrub.current) seek(tAt(e)); }}
        onPointerUp={() => { scrub.current = false; }}>
        <div className="relative" style={{ width: total, height: bottom, minHeight: '100%' }}>
          {/* Sticky track headers: zero footprint in flow, absolute cells inside. */}
          <div className="sticky left-0 z-30 h-0 w-0" onPointerDown={(e) => e.stopPropagation()}>
            <div className="absolute left-0 top-0 border-r bg-card" style={{ width: HEAD, height: Math.max(bottom, 400) }}>
              <div className="absolute inset-x-0 top-0 h-6 border-b bg-background/40" />
              <LaneHeader top={rows.caps} height={LANE_H} label="Captions" icon={<Pencil />} laneKey="captions" />
              {Array.from({ length: nOvl }, (_, i) => nOvl - 1 - i).map((tr) => (
                <LaneHeader key={`ovl${tr}`} top={ovlTop(tr)} height={FX_H} label={tr === 0 ? 'Text & stickers' : `Overlay ${tr + 1}`} icon={<Type />} laneKey={overlayLane(tr)}
                  order={{ group: 'overlay', groupAt, kind: 'overlay', track: tr, count: nOvl, at: geo.overlayTrackAt }} />
              ))}
              {Array.from({ length: nAdj }, (_, i) => nAdj - 1 - i).map((tr) => (
                <LaneHeader key={`adj${tr}`} top={adjTop(tr)} height={FX_H} label={tr === 0 ? 'Filters & FX' : `FX ${tr + 1}`} icon={<Layers />} laneKey={adjLane(tr)}
                  order={{ group: 'adj', groupAt, kind: 'adj', track: tr, count: nAdj, at: geo.adjTrackAt }} />
              ))}
              {Array.from({ length: nVid }, (_, i) => nVid - 1 - i).map((tr) => (
                <LaneHeader key={`vid${tr}`} top={videoTop(tr)} height={LANE_H} label={tr === 0 ? 'Video' : `Overlay ${tr}`} icon={<Play />} laneKey={tr === 0 ? 'video' : `video:${tr}`}
                  order={{ group: 'video', groupAt, kind: 'video', track: tr, count: nVid, at: geo.videoTrackAt }} />
              ))}
              <LaneHeader top={audioTop} height={audioRowCount * (AUD_H + 4) - 4} label="Audio" icon={<Volume />} laneKey="audio" eye={false} order={{ group: 'audio', groupAt }}
                mute={{ on: !!laneOf(project, 'audio').muted, toggle: () => useEditor.getState().update((p) => ({ ...p, lanes: { ...p.lanes, audio: { ...p.lanes?.audio, muted: !p.lanes?.audio?.muted } } })) }} />
              <LaneHeader top={rows.extra} height={FX_H} label="B-roll" icon={<Copy />} laneKey="broll" lock={false} order={{ group: 'broll', groupAt }} />
              {Array.from({ length: nSound }, (_, l) => {
                const inLayer = project.audio.tracks.filter((t) => (t.layer ?? 0) === l);
                const allMuted = inLayer.length > 0 && inLayer.every((t) => t.muted);
                return (
                  <LaneHeader key={`snd${l}`} top={musicTop(l)} height={MUSIC_H} label={`Sound ${l + 1}`} icon={<Volume />} laneKey={`sound:${l}`} eye={false} lock={false}
                    order={{ group: 'sound', groupAt, kind: 'sound', track: l, count: nSound, at: geo.soundLayerAt }}
                    mute={{ on: allMuted, toggle: () => useEditor.getState().update((p) => ({ ...p, audio: { ...p.audio, tracks: p.audio.tracks.map((x) => ((x.layer ?? 0) === l ? { ...x, muted: !allMuted } : x)) } })) }} />
                );
              })}
            </div>
          </div>
          <div className="absolute inset-x-0 h-6 border-b bg-background/40" style={{ top: rows.ruler }}>
            {ticks.map((t) => (
              <div key={t} className="absolute top-0 h-full border-l border-border/70 pl-1 pt-1 font-mono text-[10px] text-muted-foreground" style={{ left: t * pps + PAD }}>
                {Math.floor(t / 60)}:{String(Math.floor(t % 60)).padStart(2, '0')}
              </div>
            ))}
          </div>
          {/* Captions */}
          <div className={cn('absolute inset-x-0', laneOf(project, 'captions').hidden && 'opacity-35')} style={{ top: rows.caps, height: LANE_H }}>
            {project.captions.map((c) => {
              const left = c.start * pps + PAD, w = Math.max(4, (c.end - c.start) * pps);
              const active = time >= c.start && time < c.end;
              const text = c.words.map((x) => x.text).join(' ');
              const emph = c.words.some((x) => x.emphasize);
              return (
                <CaptionMenu key={c.id} c={c}>
                  <div title={text}
                    onPointerDown={(e) => onBlockDown(e, c, 'move')} onPointerMove={onBlockMove} onPointerUp={onBlockUp}
                    onDoubleClick={(e) => { e.stopPropagation(); seek(c.start); useEditor.getState().setPanel('captions'); }}
                    className={cn('group absolute top-0 flex h-full cursor-grab items-center overflow-hidden rounded-lg border px-2 text-xs transition-colors active:cursor-grabbing',
                      selected === c.id ? 'border-primary bg-primary/45 text-foreground shadow-md shadow-primary/30'
                        : active ? 'border-primary/60 bg-primary/30' : 'border-primary/25 bg-primary/15 hover:bg-primary/25')}
                    style={{ left, width: w }}>
                    {emph && <span className="absolute left-0 top-0 h-0.5 w-full bg-warn/80" />}
                    <span className="sinhala pointer-events-none truncate">{text}</span>
                    <span onPointerDown={(e) => onBlockDown(e, c, 'l')} className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize group-hover:bg-foreground/30" />
                    <span onPointerDown={(e) => onBlockDown(e, c, 'r')} className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize group-hover:bg-foreground/30" />
                  </div>
                </CaptionMenu>
              );
            })}
          </div>
          {/* Text, sticker and image overlays on their own tracks. Empty rows are drop targets. */}
          {Array.from({ length: nOvl }, (_, tr) => (
            <div key={`ovlrow${tr}`} className="pointer-events-none absolute rounded-lg border border-dashed border-border/60" style={{ left: PAD, width: dur * pps, top: ovlTop(tr), height: FX_H }} />
          ))}
          {(project.overlays ?? []).map((o) => <OverlayBlock key={o.id} item={o} pps={pps} pad={PAD} top={ovlTop(o.track)} height={FX_H} />)}
          {/* Filter and effect clips on their own tracks. Empty rows are drop targets. */}
          {Array.from({ length: nAdj }, (_, tr) => (
            <div key={`adjrow${tr}`} className="pointer-events-none absolute rounded-lg border border-dashed border-border/60" style={{ left: PAD, width: dur * pps, top: adjTop(tr), height: FX_H }} />
          ))}
          {(project.adj ?? []).map((a) => <AdjBlock key={a.id} adj={a} pps={pps} pad={PAD} top={adjTop(a.track)} height={FX_H} />)}
          {/* Video clips (one row per track) and audio clips (their own layer); linked pairs move together */}
          {videoClips(project.clips ?? []).map((c) => <ClipBlock key={c.id} clip={c} pps={pps} pad={PAD} top={videoTop(trackOf(c))} height={LANE_H} />)}
          {aRows.map(({ clip, row }) => <ClipBlock key={clip.id} clip={clip} pps={pps} pad={PAD} top={audioTop + row * (AUD_H + 4)} height={AUD_H} />)}
          {Array.from({ length: nVid }, (_, tr) => {
            const end = Math.max(0, ...videoClips(project.clips ?? []).filter((c) => trackOf(c) === tr).map(clipEnd));
            return (
              <button key={`plus${tr}`} type="button" title="Add media after the last clip" aria-label="Add media after the last clip"
                onClick={() => { plusTarget.current = { track: tr, start: end }; plusInput.current?.click(); }}
                className="absolute z-10 grid place-items-center rounded-md bg-foreground/90 text-background shadow transition-transform hover:scale-105"
                style={{ left: end * pps + PAD + 8, top: videoTop(tr) + (LANE_H - 28) / 2, width: 28, height: 28 }}><Plus className="size-4" /></button>
            );
          })}
          <input ref={plusInput} type="file" multiple accept="video/*,audio/*,image/*" hidden onChange={(e) => { void addAfterEnd(e.target.files); e.target.value = ''; }} />
          {videoClips(project.clips ?? []).flatMap((c) => migrateVideo(c.fx).keyframes.map((k) => (
            <button key={k.id} title="Keyframe" aria-label="Keyframe"
              onPointerDown={(e) => { e.stopPropagation(); useEditor.getState().selectClip(c.id); seek(c.start + k.t); useEditor.getState().setPanel('clip'); }}
              className="keyframe-diamond absolute z-10 size-3 bg-primary hover:scale-125"
              style={{ left: (c.start + k.t) * pps + PAD - 6, top: videoTop(trackOf(c)) + LANE_H - 15 }} />
          )))}
          {/* Hook and b-roll */}
          <div className={cn('absolute inset-x-0', laneOf(project, 'broll').hidden && 'opacity-35')} style={{ top: rows.extra, height: FX_H }}>
            {project.hook.enabled && project.hook.text && (
              <div className="absolute top-0 h-full truncate rounded-lg border border-warn/40 bg-warn/15 px-2 text-[11px] leading-[26px]"
                style={{ left: project.hook.start * pps + PAD, width: (project.hook.end - project.hook.start) * pps }}>Hook · {project.hook.text}</div>
            )}
            {project.broll.map((b) => (
              <div key={b.id} className="absolute top-0 h-full truncate rounded-lg border border-ok/40 bg-ok/15 px-2 text-[11px] leading-[26px]"
                style={{ left: b.start * pps + PAD, width: (b.end - b.start) * pps }}>{b.note || 'B-roll'}</div>
            ))}
          </div>
          {project.audio.tracks.map((t) => (
            <MusicBlock key={t.id} t={t} pps={pps} top={musicTop(t.layer ?? 0)} />
          ))}
          {dropAt && <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 bg-primary/70" style={{ left: Math.max(0, geo.timeAt(dropAt.x)) * pps + PAD }} />}
          <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-destructive" style={{ left: time * pps + PAD }}>
            <div className="absolute -left-[5px] top-0 h-2.5 w-[11px] rounded-b-sm bg-destructive" />
          </div>
        </div>
      </div>
    </div>
  );
}
