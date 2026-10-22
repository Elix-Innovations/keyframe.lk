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
import { snapBox, unionBox, type Box, type Guide } from '../lib/previewSnap';

type Drag =
  | { kind: 'move'; x0: number; y0: number; items: { id: string; x: number; y: number }[]; box0: Box; others: Box[] }
  | { kind: 'caption'; dx: number; dy: number; captionId: string | null; shownId: string | null; w: number; h: number; moved: boolean; others: Box[] }
  | { kind: 'scale'; id: string; cx: number; cy: number; d0: number; s0: number }
  | { kind: 'rotate'; id: string; cx: number; cy: number; r0: number; a0: number }
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
  const [safeZone, setSafeZone] = useState(false);
  const [hover, setHover] = useState(false);
  const bboxRef = useRef<Rect | null>(null);
  const hitsRef = useRef<OverlayHit[]>([]);
  const selOverlay = useEditor((s) => s.selectedOverlayId);
  const selExtra = useEditor((s) => s.extraOverlayIds);
  const selCaption = useEditor((s) => s.selectedCaptionId);
  const [magnet, setMagnetState] = useState(() => { try { return localStorage.getItem('kf-magnet') !== '0'; } catch { return true; } });
  const setMagnet = (v: boolean) => { setMagnetState(v); try { localStorage.setItem('kf-magnet', v ? '1' : '0'); } catch { /* private mode */ } };
  const guidesRef = useRef<Guide[]>([]);
  const magnetRef = useRef(magnet);
  magnetRef.current = magnet;
  const brollRef = useRef(new Map<string, ImageBitmap>());
  const [tick, force] = useState(0);

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
      const picked = [stNow.selectedOverlayId, ...stNow.extraOverlayIds];
      for (const h of hits.filter((x) => picked.includes(x.id))) {
        const primary = h.id === stNow.selectedOverlayId;
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
  }, [box.w, box.h, playing, project, time, hover, loaded, tick, selOverlay, selExtra, selCaption]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const overlayAt = (x: number, y: number, dpr: number) => [...hitsRef.current].reverse().find((h) => inside(h, x, y, 6 * dpr)) ?? null;
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
    const only = picked.length === 1 ? hits.find((h) => h.id === picked[0]) : undefined;
    const o = only && st.project?.overlays?.find((v) => v.id === only.id);
    if (only && o) {
      const knob = knobAt(only, x, y, dpr);
      if (knob === 'rotate') { drag.current = { kind: 'rotate', id: o.id, cx: only.cx, cy: only.cy, r0: o.rotation, a0: Math.atan2(y - only.cy, x - only.cx) }; capture(); return; }
      if (knob === 'scale') { drag.current = { kind: 'scale', id: o.id, cx: only.cx, cy: only.cy, d0: Math.hypot(x - only.cx, y - only.cy) || 1, s0: o.scale }; capture(); return; }
    }

    const oh = overlayAt(x, y, dpr);
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
      const others = [...hits.filter((h) => !ids.includes(h.id)).map(boxOf)];
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
        const hit = hitsRef.current.filter((h) => h.cx + h.w / 2 >= l && h.cx - h.w / 2 <= r && h.cy + h.h / 2 >= t && h.cy - h.h / 2 <= b).map((h) => h.id);
        const ids = [...new Set([...d.base, ...hit.reverse()])];
        const cur = [st.selectedOverlayId, ...st.extraOverlayIds].filter(Boolean).join();
        if (ids.join() !== cur) st.setOverlaySelection(ids);
        if (ids.length) st.setPanel('overlay');
      }
      force((n) => n + 1);
    }
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
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => setHover(false)} onPointerCancel={onUp} />
          {safeZone && (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-0 top-0 h-[12%] bg-destructive/15" />
              <div className="absolute inset-x-0 bottom-0 h-[20%] bg-destructive/15" />
              <div className="absolute bottom-[20%] right-0 top-[40%] w-[14%] bg-destructive/15" />
              <div className="absolute left-2 top-2 rounded bg-black/60 px-1.5 text-[10px] text-white/80">Reels / TikTok UI overlap</div>
            </div>
          )}
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
      <div className="flex h-12 shrink-0 items-center gap-2 border-t bg-card px-3">
        <Button variant="ghost" size="icon-sm" onClick={() => seek(0)} aria-label="Go to start"><SkipBack /></Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" className="rounded-full" onClick={togglePlay} aria-label="Play / pause">{playing ? <Pause /> : <Play className="translate-x-px" />}</Button>
          </TooltipTrigger>
          <TooltipContent className="flex items-center gap-2">Play / pause <Keys keys={['Space']} /></TooltipContent>
        </Tooltip>
        <span className="ml-1 font-mono text-xs tabular-nums"><span>{formatClock(time, true)}</span><span className="text-muted-foreground"> / {formatClock(dur, true)}</span></span>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="magnet" checked={magnet} onCheckedChange={setMagnet} />
            <Label htmlFor="magnet" className="text-xs font-normal text-muted-foreground" title="Snap to the frame centre, edges and other items while dragging. Hold Alt to move freely.">Magnet</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="safe" checked={safeZone} onCheckedChange={setSafeZone} />
            <Label htmlFor="safe" className="text-xs font-normal text-muted-foreground"><Smartphone className="size-3.5" />Safe zones</Label>
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
