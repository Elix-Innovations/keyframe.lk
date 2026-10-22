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
  const ovlDrag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const selOverlay = useEditor((s) => s.selectedOverlayId);
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
      const so = hits.find((h) => h.id === useEditor.getState().selectedOverlayId);
      if (so) {
        ctx.save();
        ctx.translate(so.cx, so.cy);
        ctx.rotate((so.rot * Math.PI) / 180);
        ctx.strokeStyle = 'rgba(99,102,241,0.95)';
        ctx.lineWidth = 2 * dpr;
        ctx.strokeRect(-so.w / 2 - 6 * dpr, -so.h / 2 - 6 * dpr, so.w + 12 * dpr, so.h + 12 * dpr);
        ctx.restore();
      }
      shownRef.current = res.captionId;
      if (res.bbox && (hover || dragging.current)) {
        ctx.save();
        ctx.setLineDash([8 * dpr, 6 * dpr]);
        ctx.strokeStyle = 'rgba(244,63,94,0.95)';
        ctx.lineWidth = 1.5 * dpr;
        ctx.strokeRect(res.bbox.x - 8 * dpr, res.bbox.y - 8 * dpr, res.bbox.w + 16 * dpr, res.bbox.h + 16 * dpr);
        ctx.restore();
      }
      const dragX = dragging.current?.captionId
        ? p.captions.find((c) => c.id === dragging.current!.captionId)?.styleOverride?.layout?.x ?? p.style.layout.x : p.style.layout.x;
      if (dragging.current && Math.abs(dragX - 50) < 0.01) {
        ctx.fillStyle = 'rgba(255,212,0,0.8)';
        ctx.fillRect(W / 2 - dpr / 2, 0, dpr, H);
      }
      if (playing) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [box.w, box.h, playing, project, time, hover, loaded, tick, selOverlay]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drag captions to reposition.
  // A caption that is selected (or already has its own position) moves on its own; otherwise all captions move.
  const dragging = useRef<{ dx: number; dy: number; captionId: string | null } | null>(null);
  const shownRef = useRef<string | null>(null);
  const toCanvas = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const dpr = canvasRef.current!.width / r.width;
    return { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr, W: canvasRef.current!.width, H: canvasRef.current!.height };
  };
  /** Topmost overlay under a canvas point. */
  const overlayAt = (x: number, y: number) => {
    const dpr = canvasRef.current!.width / canvasRef.current!.getBoundingClientRect().width;
    for (const h of [...hitsRef.current].reverse()) {
      const a = (-h.rot * Math.PI) / 180, px = x - h.cx, py = y - h.cy;
      const lx = px * Math.cos(a) - py * Math.sin(a), ly = px * Math.sin(a) + py * Math.cos(a);
      const pad = 6 * dpr;
      if (Math.abs(lx) <= h.w / 2 + pad && Math.abs(ly) <= h.h / 2 + pad) return h;
    }
    return null;
  };
  const onDown = (e: React.PointerEvent) => {
    const { x, y } = toCanvas(e);
    const oh = overlayAt(x, y);
    if (oh) {
      const st = useEditor.getState();
      st.selectOverlay(oh.id);
      st.setPanel('overlay');
      ovlDrag.current = { id: oh.id, dx: x - oh.cx, dy: y - oh.cy };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    const b = bboxRef.current;
    if (b && x >= b.x - 20 && x <= b.x + b.w + 20 && y >= b.y - 20 && y <= b.y + b.h + 20) {
      const { project: p, selectedCaptionId } = useEditor.getState();
      const id = shownRef.current;
      const own = !!id && (id === selectedCaptionId || !!p?.captions.find((c) => c.id === id)?.styleOverride?.layout);
      dragging.current = { dx: x - (b.x + b.w / 2), dy: y - (b.y + b.h / 2), captionId: own ? id : null };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } else {
      togglePlay();
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const { x, y, W, H } = toCanvas(e);
    const od = ovlDrag.current;
    if (od) {
      let nx = ((x - od.dx) / W) * 100;
      const ny = ((y - od.dy) / H) * 100;
      if (Math.abs(nx - 50) < 1.5) nx = 50; // snap to centre
      const pos = { x: Math.round(nx * 10) / 10, y: Math.round(ny * 10) / 10 };
      useEditor.getState().setOverlays((l) => l.map((o) => (o.id === od.id ? { ...o, ...pos } : o)), `ovl-drag-${od.id}`);
      return;
    }
    const b = bboxRef.current;
    if (!dragging.current) {
      setHover(!!overlayAt(x, y) || (!!b && x >= b.x - 20 && x <= b.x + b.w + 20 && y >= b.y - 20 && y <= b.y + b.h + 20));
      return;
    }
    let nx = ((x - dragging.current.dx) / W) * 100;
    const ny = ((y - dragging.current.dy) / H) * 100;
    if (Math.abs(nx - 50) < 1.5) nx = 50; // snap to center
    const pos = { x: Math.round(nx * 10) / 10, y: Math.round(ny * 10) / 10 };
    const id = dragging.current.captionId;
    const st = useEditor.getState();
    if (id) {
      st.setCaptions(st.project!.captions.map((c) => (c.id === id
        ? { ...c, styleOverride: { ...c.styleOverride, layout: { ...c.styleOverride?.layout, ...pos } } } : c)), `drag-caption-${id}`);
    } else {
      st.setStyle((s) => ({ ...s, layout: { ...s.layout, ...pos } }), 'drag-caption');
    }
  };
  const onUp = () => { dragging.current = null; ovlDrag.current = null; };

  const dur = project.duration || 0;
  const noVideo = videoClips(project.clips ?? []).length === 0;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={wrapRef} className="checker relative flex min-h-0 flex-1 items-center justify-center">
        <div className="relative" style={{ width: box.w, height: box.h }}>
          <canvas ref={canvasRef} className={`h-full w-full rounded-lg shadow-2xl shadow-black/30 ring-1 ring-border ${hover ? 'cursor-move' : 'cursor-pointer'}`}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => setHover(false)} />
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
