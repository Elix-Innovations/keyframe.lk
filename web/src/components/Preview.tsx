import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../store';
import { currentTime, seek, syncVideos, togglePlay } from '../lib/player';
import { ensureVideo, keyOf, onVideoFrame, peekVideo, registerVideoBlob, releaseUnused } from '../lib/videoPool';
import { videoClips, videoLayersAt } from '../lib/clips';
import { addVideo } from '../lib/importMedia';
import { composeFrame, outputSize } from '../render/compose';
import type { OverlayHit } from '../render/overlays';
import { clearMeasureCache, type Ctx2D, type Rect } from '../render/captions';
import { getBlob, grantFileAccess, NeedsPermissionError } from '../lib/db';
import { ensureFonts, onFontsChanged } from '../lib/fonts';
import { projectFontIds } from '../lib/util';
import { formatClock } from '../lib/srt';
import { Pause, Play, SkipBack, Smartphone } from '@/components/icons';
import type { AspectRatio, Clip } from '@/types';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Keys } from './ShortcutsDialog';
import { SinhalaInput } from './SinhalaInput';
import { SAFE_ZONES, SafeZoneOverlay, type SafeZoneId } from './SafeZones';
import { retimeWordsWithBreaks, wordsToText } from '../lib/segment';
import { matteHints, onSegmenterChange } from '../render/matte';
import { snapBox, unionBox, type Box, type Guide } from '../lib/previewSnap';
import { migrateVideo, newKeyframe, transformAt, type Transform } from '../lib/videoFx';

type Drag =
  | { kind: 'move'; x0: number; y0: number; items: { id: string; x: number; y: number }[]; box0: Box; others: Box[] }
  | { kind: 'caption'; dx: number; dy: number; captionId: string | null; shownId: string | null; w: number; h: number; moved: boolean; others: Box[] }
  | { kind: 'scale'; id: string; cx: number; cy: number; d0: number; s0: number }
  | { kind: 'rotate'; id: string; cx: number; cy: number; r0: number; a0: number }
  | { kind: 'cmove'; id: string; x0: number; y0: number; pose0: Transform; box0: Box; others: Box[] }
  | { kind: 'cscale'; id: string; cx: number; cy: number; d0: number; pose0: Transform }
  | { kind: 'crot'; id: string; cx: number; cy: number; a0: number; pose0: Transform }
  | { kind: 'marquee'; x0: number; y0: number; x1: number; y1: number; moved: boolean; base: string[] };

/** The four corner knobs of a selected overlay, in its own (rotated) coordinates. */
const handlePoints = (h: OverlayHit, dpr: number): [number, number][] => {
  const hw = h.w / 2 + 6 * dpr, hh = h.h / 2 + 6 * dpr;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
};

/** Which knob (if any) sits under a canvas point. */
function knobAt(h: OverlayHit, x: number, y: number, dpr: number): 'rotate' | 'scale' | null {
  const a = (h.rot * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const world = (lx: number, ly: number) => ({ x: h.cx + lx * cos - ly * sin, y: h.cy + lx * sin + ly * cos });
  const near = (p: { x: number; y: number }) => Math.hypot(p.x - x, p.y - y) <= 11 * dpr;
  if (near(world(0, -h.h / 2 - 24 * dpr))) return 'rotate';
  return handlePoints(h, dpr).some(([lx, ly]) => near(world(lx, ly))) ? 'scale' : null;
}

export function Preview() {
  const project = useEditor((s) => s.project)!;
  const playing = useEditor((s) => s.playing);
  const time = useEditor((s) => s.time);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [safeZone, setSafeZone] = useState<SafeZoneId | 'off'>('off');
  const [hover, setHover] = useState(false);
  const bboxRef = useRef<Rect | null>(null);
  const hitsRef = useRef<OverlayHit[]>([]);
  const selOverlay = useEditor((s) => s.selectedOverlayId);
  const selExtra = useEditor((s) => s.extraOverlayIds);
  const selCaption = useEditor((s) => s.selectedCaptionId);
  const selClip = useEditor((s) => s.selectedClipId);
  const [magnet, setMagnetState] = useState(() => { try { return localStorage.getItem('kf-magnet') !== '0'; } catch { return true; } });
  const setMagnet = (v: boolean) => { setMagnetState(v); try { localStorage.setItem('kf-magnet', v ? '1' : '0'); } catch { /* private mode */ } };
  const guidesRef = useRef<Guide[]>([]);
  const magnetRef = useRef(magnet);
  magnetRef.current = magnet;
  const brollRef = useRef(new Map<string, ImageBitmap>());
  const [tick, force] = useState(0);
  /** Caption being typed over the preview (double-click). */
  const [edit, setEdit] = useState<{ id: string; draft: string } | null>(null);

  // Load a hidden video element per source file. If one is gone (failed save, cleared site data), offer to re-attach it.
  const [missing, setMissing] = useState<string | null>(null); // asset id that could not be loaded
  const [needsAccess, setNeedsAccess] = useState<NeedsPermissionError | null>(null);
  const [loaded, setLoaded] = useState(false);
  const assetKey = [...new Set(videoClips(project.clips ?? []).map((c) => keyOf(c.assetId, c.track ?? 0)))].join('|');
  useEffect(() => {
    let cancelled = false;
    const keys = assetKey ? assetKey.split('|') : [];
    setMissing(null);
    setNeedsAccess(null);
    setLoaded(false);
    releaseUnused(new Set(keys));
    Promise.all(keys.map((k) => { const [id, slot] = k.split('#'); return ensureVideo(id, Number(slot)).then((el) => { if (!el && !cancelled) setMissing(id); }, (e) => {
      if (cancelled) return;
      if (e instanceof NeedsPermissionError) setNeedsAccess(e); else setMissing(id);
    }); })).then(() => { if (!cancelled) setLoaded(true); force((n) => n + 1); syncVideos(); });
    return () => { cancelled = true; };
  }, [assetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onVideoFrame(() => force((n) => n + 1)), []);
  useEffect(() => onSegmenterChange(() => force((n) => n + 1)), []); // redraw when the AI cut-out model finishes loading

  const relinkRef = useRef<HTMLInputElement>(null);
  const relink = async (file: File, handle?: FileSystemFileHandle) => {
    try {
      await addVideoOrReplace(file, handle);
    } catch (e) {
      useEditor.getState().notify((e as Error).message, 'error');
    }
  };
  const addVideoOrReplace = async (file: File, handle?: FileSystemFileHandle) => {
    if (!missing) { await addVideo(file, handle); return; }
    // Same file chosen again for a missing asset: store it and point the clips at it.
    const { putBlob, putFileHandle } = await import('../lib/db');
    const assetId = handle ? await putFileHandle(handle, file) : await putBlob(file);
    const old = missing;
    useEditor.getState().setClips((cs) => cs.map((c) => (c.assetId === old ? { ...c, assetId } : c)));
    registerVideoBlob(assetId, file);
    useEditor.getState().notify('Video re-attached.', 'success');
  };

  // Fonts used by the current style.
  const fontKey = projectFontIds(project).join('|');
  useEffect(() => { ensureFonts(fontKey.split('|')); }, [fontKey]);
  useEffect(() => onFontsChanged(() => { clearMeasureCache(); force((n) => n + 1); }), []);

  // B-roll bitmaps.
  const brollKey = [...project.broll.map((b) => b.assetId), ...(project.overlays ?? []).flatMap((o) => (o.assetId ? [o.assetId] : []))].join('|');
  useEffect(() => {
    const map = brollRef.current;
    const wanted = new Set([...project.broll.map((b) => b.assetId), ...(project.overlays ?? []).flatMap((o) => (o.assetId ? [o.assetId] : []))]);
    for (const [k, v] of map) if (!wanted.has(k)) { v.close(); map.delete(k); }
    Promise.all([...wanted].filter((id) => !map.has(id)).map(async (id) => {
      const blob = await getBlob(id);
      if (blob) map.set(id, await createImageBitmap(blob));
    })).then(() => force((n) => n + 1));
  }, [brollKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fit the output frame into the available area.
  const out = outputSize(project);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const s = Math.min((r.width - 32) / out.width, (r.height - 32) / out.height);
      setBox({ w: Math.max(0, Math.floor(out.width * s)), h: Math.max(0, Math.floor(out.height * s)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [out.width, out.height]);

  // Draw loop: redraw every frame while playing, otherwise when inputs change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || box.w === 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(box.w * dpr), H = Math.round(box.h * dpr);
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    const draw = () => {
      matteHints.playing = playing;
      const t = currentTime();
      const p = useEditor.getState().project!;
      const frameFor = (clip: Clip) => {
        const v = peekVideo(clip.assetId, clip.track ?? 0);
        if (!v || v.readyState < 2) return null;
        const w = v.videoWidth || clip.width || 0, h = v.videoHeight || clip.height || 0;
        return { draw: (c: Ctx2D, dx: number, dy: number, dw: number, dh: number) => c.drawImage(v, dx, dy, dw, dh), w, h };
      };
      const first = videoLayersAt(p.clips ?? [], t)[0];
      const hits: OverlayHit[] = [];
      const res = composeFrame(ctx, W, H, p, t, null, { brollImages: brollRef.current, overlayHits: hits, frameFor, videoSize: first?.width && first.height ? { w: first.width, h: first.height } : undefined });
      bboxRef.current = res.bbox;
      hitsRef.current = hits;
      const stNow = useEditor.getState();
      const picked = [stNow.selectedOverlayId, ...stNow.extraOverlayIds, ...(stNow.selectedOverlayId ? [] : [stNow.selectedClipId])];
      for (const h of hits.filter((x) => picked.includes(x.id))) {
        const primary = h.id === (stNow.selectedOverlayId ?? stNow.selectedClipId);
        ctx.save();
        ctx.translate(h.cx, h.cy);
        ctx.rotate((h.rot * Math.PI) / 180);
        ctx.strokeStyle = primary ? 'rgba(99,102,241,0.95)' : 'rgba(99,102,241,0.6)';
        ctx.lineWidth = 2 * dpr;
        ctx.strokeRect(-h.w / 2 - 6 * dpr, -h.h / 2 - 6 * dpr, h.w + 12 * dpr, h.h + 12 * dpr);
        if (primary && picked.length === 1 && !playing) {
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = 'rgba(99,102,241,1)';
          ctx.lineWidth = 1.5 * dpr;
          for (const [hx, hy] of handlePoints(h, dpr)) { ctx.beginPath(); ctx.arc(hx, hy, 5 * dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
          ctx.beginPath(); ctx.moveTo(0, -h.h / 2 - 6 * dpr); ctx.lineTo(0, -h.h / 2 - 24 * dpr); ctx.stroke();
          ctx.beginPath(); ctx.arc(0, -h.h / 2 - 24 * dpr, 5 * dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
      }
      shownRef.current = res.captionId;
      if (res.bbox && (hover || drag.current?.kind === 'caption' || (res.captionId && res.captionId === stNow.selectedCaptionId))) {
        ctx.save();
        const chosen = res.captionId === stNow.selectedCaptionId;
        ctx.setLineDash(chosen ? [] : [8 * dpr, 6 * dpr]);
        ctx.strokeStyle = chosen ? 'rgba(99,102,241,0.95)' : 'rgba(244,63,94,0.95)';
        ctx.lineWidth = 1.5 * dpr;
        ctx.strokeRect(res.bbox.x - 8 * dpr, res.bbox.y - 8 * dpr, res.bbox.w + 16 * dpr, res.bbox.h + 16 * dpr);
        ctx.restore();
      }
      // Magnet guides while dragging.
      if (guidesRef.current.length && drag.current) {
        ctx.save();
        ctx.strokeStyle = '#FF3B9A';
        ctx.lineWidth = dpr;
        for (const g of guidesRef.current) {
          ctx.beginPath();
          if (g.axis === 'x') { ctx.moveTo(g.pos, 0); ctx.lineTo(g.pos, H); } else { ctx.moveTo(0, g.pos); ctx.lineTo(W, g.pos); }
          ctx.stroke();
        }
        ctx.restore();
      }
      const dm = drag.current;
      if (dm?.kind === 'marquee' && dm.moved) {
        ctx.save();
        ctx.fillStyle = 'rgba(99,102,241,0.14)';
        ctx.strokeStyle = 'rgba(99,102,241,0.9)';
        ctx.lineWidth = dpr;
        const rx = Math.min(dm.x0, dm.x1), ry = Math.min(dm.y0, dm.y1);
        ctx.fillRect(rx, ry, Math.abs(dm.x1 - dm.x0), Math.abs(dm.y1 - dm.y0));
        ctx.strokeRect(rx, ry, Math.abs(dm.x1 - dm.x0), Math.abs(dm.y1 - dm.y0));
        ctx.restore();
      }
      if (playing) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [box.w, box.h, playing, project, time, hover, loaded, tick, selOverlay, selExtra, selCaption, selClip]); // eslint-disable-line react-hooks/exhaustive-deps

  // Selecting and dragging in the preview: click an item to select it, shift / ⌘ / Ctrl-click to add more, drag on empty
  // space to box-select, drag to move (the magnet sticks centres and edges to the frame and to other items; hold Alt to
  // move freely), and use the corner and top knobs of a single selected overlay to resize and rotate.
  // A caption that is selected (or already has its own position) moves on its own; otherwise all captions move.
  const drag = useRef<Drag | null>(null);
  const shownRef = useRef<string | null>(null);
  const toCanvas = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const dpr = canvasRef.current!.width / r.width;
    return { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr, W: canvasRef.current!.width, H: canvasRef.current!.height, dpr };
  };
  const inside = (h: OverlayHit, x: number, y: number, pad: number) => {
    const a = (-h.rot * Math.PI) / 180, px = x - h.cx, py = y - h.cy;
    const lx = px * Math.cos(a) - py * Math.sin(a), ly = px * Math.sin(a) + py * Math.cos(a);
    return Math.abs(lx) <= h.w / 2 + pad && Math.abs(ly) <= h.h / 2 + pad;
  };
  /** Topmost overlay under a canvas point. */
  const overlayAt = (x: number, y: number, dpr: number) => [...hitsRef.current].reverse().find((h) => inside(h, x, y, 6 * dpr) && (!h.solidAt || h.solidAt(x, y))) ?? null;
  /** The pose a video layer has at the playhead (its keyframes, or its static transform). */
  const poseOf = (id: string): Transform | null => {
    const c = useEditor.getState().project?.clips?.find((v) => v.id === id);
    if (!c) return null;
    const l = migrateVideo(c.fx);
    return { ...transformAt(l.keyframes, Math.max(0, currentTime() - c.start), l.base!) };
  };
  /** Move / scale / rotate a video layer: its static transform, or a keyframe at the playhead when it has keyframes. */
  const setPose = (id: string, pose: Transform) => {
    const st = useEditor.getState();
    st.setClips((cs) => cs.map((c) => {
      if (c.id !== id) return c;
      const l = migrateVideo(c.fx), lt = Math.max(0, currentTime() - c.start);
      if (!l.keyframes.length) return { ...c, fx: { ...l, base: pose } };
      const near = l.keyframes.find((k) => Math.abs(k.t - lt) < 0.05);
      return { ...c, fx: { ...l, keyframes: near ? l.keyframes.map((k) => (k === near ? { ...k, ...pose } : k)) : [...l.keyframes, newKeyframe(Number(lt.toFixed(2)), pose)] } };
    }), `clip-pose-${id}`);
  };
  const onCaption = (x: number, y: number) => { const b = bboxRef.current; return !!b && x >= b.x - 20 && x <= b.x + b.w + 20 && y >= b.y - 20 && y <= b.y + b.h + 20; };
  const boxOf = (h: OverlayHit): Box => ({ cx: h.cx, cy: h.cy, w: h.w, h: h.h });
  const snapOn = (e: React.PointerEvent) => magnetRef.current && !e.altKey;

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const { x, y, W, H, dpr } = toCanvas(e);
    const st = useEditor.getState();
    const capture = () => (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const picked = [st.selectedOverlayId, ...st.extraOverlayIds].filter((id): id is string => !!id);
    const hits = hitsRef.current;

    // Knobs of the one selected overlay: rotate, then resize.
    // A selected video layer (e.g. the cut-out layer) has the same knobs.
    const selClipHit = !picked.length && st.selectedClipId ? hits.find((h) => h.clipId && h.id === st.selectedClipId) : undefined;
    if (selClipHit) {
      const pose0 = poseOf(selClipHit.id);
      const knob = pose0 ? knobAt(selClipHit, x, y, dpr) : null;
      if (pose0 && knob === 'rotate') { drag.current = { kind: 'crot', id: selClipHit.id, cx: selClipHit.cx, cy: selClipHit.cy, a0: Math.atan2(y - selClipHit.cy, x - selClipHit.cx), pose0 }; capture(); return; }
      if (pose0 && knob === 'scale') { drag.current = { kind: 'cscale', id: selClipHit.id, cx: selClipHit.cx, cy: selClipHit.cy, d0: Math.hypot(x - selClipHit.cx, y - selClipHit.cy) || 1, pose0 }; capture(); return; }
    }
    const only = picked.length === 1 ? hits.find((h) => h.id === picked[0]) : undefined;
    const o = only && st.project?.overlays?.find((v) => v.id === only.id);
    if (only && o) {
      const knob = knobAt(only, x, y, dpr);
      if (knob === 'rotate') { drag.current = { kind: 'rotate', id: o.id, cx: only.cx, cy: only.cy, r0: o.rotation, a0: Math.atan2(y - only.cy, x - only.cx) }; capture(); return; }
      if (knob === 'scale') { drag.current = { kind: 'scale', id: o.id, cx: only.cx, cy: only.cy, d0: Math.hypot(x - only.cx, y - only.cy) || 1, s0: o.scale }; capture(); return; }
    }

    const oh = overlayAt(x, y, dpr);
    if (oh?.clipId) { // a video layer: select it and drag its transform
      const pose0 = poseOf(oh.id);
      if (!pose0) return;
      if (st.selectedClipId !== oh.id) { st.selectClip(oh.id); st.setPanel('clip'); }
      drag.current = { kind: 'cmove', id: oh.id, x0: x, y0: y, pose0, box0: boxOf(oh), others: hits.filter((h) => !h.clipId).map(boxOf) };
      capture();
      return;
    }
    if (oh) {
      const multi = e.shiftKey || e.metaKey || e.ctrlKey;
      if (multi) { // add to / take out of the selection
        st.setOverlaySelection(picked.includes(oh.id) ? picked.filter((id) => id !== oh.id) : [...picked, oh.id]);
        return;
      }
      if (!picked.includes(oh.id)) { st.selectOverlay(oh.id); st.setPanel('overlay'); }
      const ids = picked.includes(oh.id) ? picked : [oh.id];
      const items = (st.project?.overlays ?? []).filter((v) => ids.includes(v.id)).map((v) => ({ id: v.id, x: v.x, y: v.y }));
      const group = hits.filter((h) => ids.includes(h.id)).map(boxOf);
      const others = [...hits.filter((h) => !ids.includes(h.id) && !h.clipId).map(boxOf)];
      const bb = bboxRef.current;
      if (bb) others.push({ cx: bb.x + bb.w / 2, cy: bb.y + bb.h / 2, w: bb.w, h: bb.h });
      drag.current = { kind: 'move', x0: x, y0: y, items, box0: unionBox(group), others };
      capture();
      return;
    }

    if (onCaption(x, y)) {
      const b = bboxRef.current!;
      const id = shownRef.current;
      const own = !!id && (id === st.selectedCaptionId || !!st.project?.captions.find((c) => c.id === id)?.styleOverride?.layout);
      drag.current = { kind: 'caption', dx: x - (b.x + b.w / 2), dy: y - (b.y + b.h / 2), captionId: own ? id : null, shownId: id, w: b.w, h: b.h, moved: false, others: hits.map(boxOf) };
      capture();
      return;
    }

    drag.current = { kind: 'marquee', x0: x, y0: y, x1: x, y1: y, moved: false, base: e.shiftKey ? picked : [] };
    capture();
    void W; void H;
  };

  const onMove = (e: React.PointerEvent) => {
    const { x, y, W, H, dpr } = toCanvas(e);
    const d = drag.current;
    const st = useEditor.getState();
    if (!d) {
      setHover(!!overlayAt(x, y, dpr) || onCaption(x, y));
      return;
    }
    const thr = 7 * dpr;
    if (d.kind === 'move') {
      let dx = x - d.x0, dy = y - d.y0;
      guidesRef.current = [];
      if (snapOn(e)) {
        const sn = snapBox({ ...d.box0, cx: d.box0.cx + dx, cy: d.box0.cy + dy }, d.others, W, H, thr);
        dx += sn.dx; dy += sn.dy; guidesRef.current = sn.guides;
      }
      const at = new Map(d.items.map((v) => [v.id, v]));
      st.setOverlays((l) => l.map((o) => { const v = at.get(o.id); return v ? { ...o, x: Math.round((v.x + (dx / W) * 100) * 10) / 10, y: Math.round((v.y + (dy / H) * 100) * 10) / 10 } : o; }), 'ovl-drag-group');
      force((n) => n + 1);
    } else if (d.kind === 'caption') {
      d.moved = true;
      let cx = x - d.dx, cy = y - d.dy;
      guidesRef.current = [];
      if (snapOn(e)) {
        const sn = snapBox({ cx, cy, w: d.w, h: d.h }, d.others, W, H, thr);
        cx += sn.dx; cy += sn.dy; guidesRef.current = sn.guides;
      }
      const pos = { x: Math.round((cx / W) * 1000) / 10, y: Math.round((cy / H) * 1000) / 10 };
      if (d.captionId) {
        const id = d.captionId;
        st.setCaptions(st.project!.captions.map((c) => (c.id === id ? { ...c, styleOverride: { ...c.styleOverride, layout: { ...c.styleOverride?.layout, ...pos } } } : c)), `drag-caption-${id}`);
      } else {
        st.setStyle((s) => ({ ...s, layout: { ...s.layout, ...pos } }), 'drag-caption');
      }
      force((n) => n + 1);
    } else if (d.kind === 'cmove') {
      let dx = x - d.x0, dy = y - d.y0;
      guidesRef.current = [];
      if (snapOn(e)) {
        const sn = snapBox({ ...d.box0, cx: d.box0.cx + dx, cy: d.box0.cy + dy }, d.others, W, H, thr);
        dx += sn.dx; dy += sn.dy; guidesRef.current = sn.guides;
      }
      setPose(d.id, { ...d.pose0, x: Math.round((d.pose0.x + (dx / W) * 100) * 10) / 10, y: Math.round((d.pose0.y + (dy / H) * 100) * 10) / 10 });
      force((n) => n + 1);
    } else if (d.kind === 'cscale') {
      setPose(d.id, { ...d.pose0, scale: Math.min(8, Math.max(0.1, Math.round(d.pose0.scale * (Math.hypot(x - d.cx, y - d.cy) / d.d0) * 100) / 100)) });
    } else if (d.kind === 'crot') {
      let rot = d.pose0.rotation + ((Math.atan2(y - d.cy, x - d.cx) - d.a0) * 180) / Math.PI;
      rot = ((rot + 540) % 360) - 180;
      if (snapOn(e)) for (const a of [-180, -135, -90, -45, 0, 45, 90, 135, 180]) if (Math.abs(rot - a) < 4) rot = a;
      setPose(d.id, { ...d.pose0, rotation: Math.round(rot * 10) / 10 });
    } else if (d.kind === 'scale') {
      const scale = Math.min(8, Math.max(0.1, Math.round(d.s0 * (Math.hypot(x - d.cx, y - d.cy) / d.d0) * 100) / 100));
      st.setOverlays((l) => l.map((o) => (o.id === d.id ? { ...o, scale } : o)), `ovl-scale-${d.id}`);
    } else if (d.kind === 'rotate') {
      let rot = d.r0 + ((Math.atan2(y - d.cy, x - d.cx) - d.a0) * 180) / Math.PI;
      rot = ((rot + 540) % 360) - 180;
      guidesRef.current = [];
      if (snapOn(e)) for (const a of [-180, -135, -90, -45, 0, 45, 90, 135, 180]) if (Math.abs(rot - a) < 4) rot = a;
      st.setOverlays((l) => l.map((o) => (o.id === d.id ? { ...o, rotation: Math.round(rot * 10) / 10 } : o)), `ovl-rot-${d.id}`);
    } else {
      d.x1 = x; d.y1 = y;
      if (!d.moved && Math.hypot(x - d.x0, y - d.y0) > 4 * dpr) d.moved = true;
      if (d.moved) {
        const l = Math.min(d.x0, x), r = Math.max(d.x0, x), t = Math.min(d.y0, y), b = Math.max(d.y0, y);
        const hit = hitsRef.current.filter((h) => !h.clipId && h.cx + h.w / 2 >= l && h.cx - h.w / 2 <= r && h.cy + h.h / 2 >= t && h.cy - h.h / 2 <= b).map((h) => h.id);
        const ids = [...new Set([...d.base, ...hit.reverse()])];
        const cur = [st.selectedOverlayId, ...st.extraOverlayIds].filter(Boolean).join();
        if (ids.join() !== cur) st.setOverlaySelection(ids);
        if (ids.length) st.setPanel('overlay');
      }
      force((n) => n + 1);
    }
  };

  const startEdit = (e: React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const dpr = canvasRef.current!.width / r.width;
    const x = (e.clientX - r.left) * dpr, y = (e.clientY - r.top) * dpr;
    const id = shownRef.current;
    if (!id || !onCaption(x, y)) return;
    const c = useEditor.getState().project?.captions.find((v) => v.id === id);
    if (!c) return;
    if (useEditor.getState().playing) togglePlay();
    useEditor.getState().select(id);
    setEdit({ id, draft: wordsToText(c.words) });
  };
  const commitEdit = (save: boolean) => {
    const cur = edit;
    setEdit(null);
    if (!cur || !save) return;
    const st = useEditor.getState();
    const c = st.project?.captions.find((v) => v.id === cur.id);
    if (!c || cur.draft === wordsToText(c.words)) return;
    if (!cur.draft.trim()) return;
    st.setCaptions(st.project!.captions.map((v) => (v.id === c.id ? { ...c, words: retimeWordsWithBreaks(c.words, cur.draft, c.start, c.end) } : v)));
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    guidesRef.current = [];
    const st = useEditor.getState();
    if (d?.kind === 'caption' && !d.moved && d.shownId) st.select(d.shownId); // a click, not a drag: select this caption
    if (d?.kind === 'marquee' && !d.moved) {
      const anything = st.selectedOverlayId || st.selectedCaptionId;
      if (anything) { st.select(null); st.selectOverlay(null); } else togglePlay(); // empty click: deselect, or play / pause
    }
    force((n) => n + 1);
  };

  const dur = project.duration || 0;
  const noVideo = videoClips(project.clips ?? []).length === 0;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={wrapRef} className="checker relative flex min-h-0 flex-1 items-center justify-center">
        <div className="relative" style={{ width: box.w, height: box.h }}>
          <canvas ref={canvasRef} className={`h-full w-full rounded-lg shadow-2xl shadow-black/30 ring-1 ring-border ${hover ? 'cursor-move' : 'cursor-pointer'}`}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => setHover(false)} onPointerCancel={onUp} onDoubleClick={startEdit} />
          {edit && bboxRef.current && (() => {
            const k = box.w / (canvasRef.current?.width || 1), b = bboxRef.current;
            const w = Math.max(b.w * k + 24, 200);
            return (
              <SinhalaInput autoFocus rows={Math.max(1, edit.draft.split('\n').length)} value={edit.draft} onChange={(draft) => setEdit({ ...edit, draft })}
                onFocus={(e) => e.currentTarget.select()} onBlur={() => commitEdit(true)}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); commitEdit(false); } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commitEdit(true); } e.stopPropagation(); }}
                className="sinhala absolute z-10 resize-none rounded-lg border-2 border-primary bg-black/75 p-2 text-center text-lg leading-snug text-white shadow-2xl outline-none"
                style={{ width: w, left: Math.min(Math.max(0, (b.x + b.w / 2) * k - w / 2), box.w - w), top: Math.max(0, (b.y + b.h / 2) * k - 28) }} />
            );
          })()}
          {safeZone !== 'off' && <SafeZoneOverlay id={safeZone} />}
        </div>
        {!loaded && !missing && !noVideo && <div className="absolute text-muted-foreground">Loading video…</div>}
        {needsAccess && (
          <div className="absolute inset-0 grid place-items-center bg-background/80 backdrop-blur-sm">
            <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border bg-card p-6 text-center shadow-2xl">
              <div className="text-base font-semibold">Allow access to your video</div>
              <p className="text-sm text-muted-foreground">Keyframe.lk links to “{needsAccess.handle.name}” on your computer instead of copying it. Chrome asks again after a restart.</p>
              <Button onClick={async () => {
                const b = await grantFileAccess(needsAccess).catch(() => undefined);
                if (b) { registerVideoBlob(needsAccess.assetId, b); setNeedsAccess(null); } else setMissing(needsAccess.assetId);
              }}>Allow access</Button>
            </div>
          </div>
        )}
        {(missing || noVideo) && (
          <div className="absolute inset-0 grid place-items-center bg-background/80 backdrop-blur-sm">
            <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border bg-card p-6 text-center shadow-2xl">
              <div className="text-base font-semibold">{missing ? "This project's video is missing" : 'Add a video to start'}</div>
              <p className="text-sm text-muted-foreground">{missing ? "It wasn't saved in browser storage. Choose the same video file again. Your captions and styles are kept." : 'Choose the video you want to caption. It stays on your computer.'}</p>
              <Button onClick={async () => {
                const picker = (window as unknown as { showOpenFilePicker?: (o: object) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker;
                if (!picker) { relinkRef.current?.click(); return; }
                try { const [h] = await picker({ types: [{ description: 'Video', accept: { 'video/*': ['.mp4', '.mov', '.m4v', '.webm', '.mkv'] } }] }); if (h) await relink(await h.getFile(), h); }
                catch (e) { if ((e as Error).name !== 'AbortError') relinkRef.current?.click(); }
              }}>{missing ? 'Re-attach video' : 'Choose video'}</Button>
              <input ref={relinkRef} type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) relink(f); e.target.value = ''; }} />
            </div>
          </div>
        )}
      </div>
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-t bg-card px-3 py-1.5 [&_*]:whitespace-nowrap">
        <Button variant="ghost" size="icon-sm" onClick={() => seek(0)} aria-label="Go to start"><SkipBack /></Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" className="rounded-full" onClick={togglePlay} aria-label="Play / pause">{playing ? <Pause /> : <Play className="translate-x-px" />}</Button>
          </TooltipTrigger>
          <TooltipContent className="flex items-center gap-2">Play / pause <Keys keys={['Space']} /></TooltipContent>
        </Tooltip>
        <span className="ml-1 font-mono text-xs tabular-nums"><span>{formatClock(time, true)}</span><span className="text-muted-foreground"> / {formatClock(dur, true)}</span></span>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
          <div className="flex items-center gap-2">
            <Switch id="magnet" checked={magnet} onCheckedChange={setMagnet} />
            <Label htmlFor="magnet" className="text-xs font-normal text-muted-foreground" title="Snap to the frame centre, edges and other items while dragging. Hold Alt to move freely.">Magnet</Label>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs font-normal text-muted-foreground"><Smartphone className="size-3.5" />Safe zones</Label>
            <Select value={safeZone} onValueChange={(v) => setSafeZone(v as SafeZoneId | 'off')}>
              <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                {(Object.keys(SAFE_ZONES) as SafeZoneId[]).map((k) => <SelectItem key={k} value={k}>{SAFE_ZONES[k].label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Select value={project.aspectRatio} onValueChange={(v) => useEditor.getState().update((p) => ({ ...p, aspectRatio: v as AspectRatio }))}>
            <SelectTrigger size="sm" className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(['original', '9:16', '4:5', '1:1', '16:9'] as AspectRatio[]).map((r) => <SelectItem key={r} value={r}>{r === 'original' ? 'Original' : r}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">{out.width}×{out.height}</span>
        </div>
      </div>
    </div>
  );
}
