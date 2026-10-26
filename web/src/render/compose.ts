import type { AdjClip, AspectRatio, Clip, FitMode, Project } from '../types';
import { FILTER_PRESETS, blendFilters, cssFilter, hasCrop, isNeutral, laneOf, migrateVideo, needsGrade, transformAt, transitionAt } from '../lib/videoFx';
import { drawLight } from './transitionFx';
import { drawGraded } from './grade';
import { sourceTimeAt, videoLayersAt } from '../lib/clips';
import { overlayPose } from '../lib/overlays';
import { adjAt } from '../lib/adj';
import { applyEffectPass, drawEffectOverlays, drawVideoWithEffects, effectTransform } from './effects';
import { needsMatte, processSource } from './matte';
import { drawOverlays, type OverlayHit } from './overlays';
import { renderCaptionAt, renderHook, type CaptionRenderResult, type Ctx2D, type Rect } from './captions';

export type DrawVideo = (ctx: Ctx2D, dx: number, dy: number, dw: number, dh: number) => void;

const RATIOS: Record<Exclude<AspectRatio, 'original'>, [number, number]> = {
  '9:16': [9, 16], '1:1': [1, 1], '4:5': [4, 5], '16:9': [16, 9],
};

/** Output frame size for a project. `longSide` caps the larger dimension (1920 = 1080p). */
export function outputSize(p: Pick<Project, 'aspectRatio' | 'videoWidth' | 'videoHeight'>, longSide = 1920) {
  let rw: number, rh: number;
  if (p.aspectRatio === 'original') {
    rw = p.videoWidth || 1080;
    rh = p.videoHeight || 1920;
  } else {
    [rw, rh] = RATIOS[p.aspectRatio];
  }
  const s = longSide / Math.max(rw, rh);
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return { width: even(rw * s), height: even(rh * s) };
}

function fitRect(sw: number, sh: number, W: number, H: number, cover: boolean): Rect {
  const s = cover ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
  const w = sw * s, h = sh * s;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

/** One decoded source frame of a clip, ready to draw. */
export interface FrameSource {
  draw: DrawVideo; w: number; h: number;
  /** Cut-out frames: 0..1 opacity of the processed frame at (u, v) in 0..1, for clicking the subject rather than the empty area. */
  alphaAt?: (u: number, v: number) => number;
}

export interface ComposeOptions {
  brollImages?: Map<string, ImageBitmap | HTMLImageElement>;
  hideCaptions?: boolean;
  /** Solid fill behind everything (default black). A chroma color gives a green/blue-screen frame; 'transparent' leaves it clear. */
  background?: string;
  hideBroll?: boolean;
  /** Skip text / sticker / image overlays (effect and filter tile previews). */
  hideOverlays?: boolean;
  /** Filled with where each overlay was painted, so the preview can select and drag them. Images come from `brollImages`. */
  overlayHits?: OverlayHit[];
  /** Pixel size of the source frame being drawn (clips can differ). Defaults to the project's video size. */
  videoSize?: { w: number; h: number };
  /** Source frame for each video clip (several tracks can be visible at once). Without it, `drawVideo` feeds the lowest layer only. */
  frameFor?: (clip: Clip) => FrameSource | null;
}

// Off-screen buffers for adjustment tracks: the scene is painted once, then each filter / effect re-draws it.
const buffers: OffscreenCanvas[] = [];
function buffer(i: number, W: number, H: number) {
  let c = buffers[i];
  if (!c || c.width !== W || c.height !== H) { c = new OffscreenCanvas(W, H); buffers[i] = c; }
  const x = c.getContext('2d')!;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalAlpha = 1;
  x.globalCompositeOperation = 'source-over';
  x.filter = 'none';
  x.clearRect(0, 0, W, H);
  return { c, x };
}

const trackLane = (track: number) => (track === 0 ? 'video' : `video:${track}`);

/** Draw one video clip; a clip with a colour grade is painted into a buffer first and graded as one image. */
function drawLayer(
  ctx: Ctx2D, W: number, H: number, project: Project, t: number, clip: Clip | null, src: FrameSource, main: boolean, fxOn: boolean, hits?: OverlayHit[],
) {
  const f = fxOn ? migrateVideo(clip?.fx ?? project.video).filters : null;
  if (f && needsGrade(f)) {
    const b = buffer(3, W, H);
    drawLayerRaw(b.x, W, H, project, t, clip, src, main, fxOn, hits);
    if (drawGraded(ctx, b.c, f, t)) return;
    ctx.drawImage(b.c, 0, 0);
    return;
  }
  drawLayerRaw(ctx, W, H, project, t, clip, src, main, fxOn, hits);
}

/** Draw one video clip with its own crop, transform, keyframes, filters, effects and transitions. */
function drawLayerRaw(
  ctx: Ctx2D, W: number, H: number, project: Project, t: number, clip: Clip | null, src: FrameSource, main: boolean, fxOn: boolean, hits?: OverlayHit[],
) {
  const layer = migrateVideo(clip?.fx ?? project.video);
  const lt = clip ? t - clip.start : t; // time inside the clip (effects, transitions and keyframes are clip-relative)
  const clipDur = clip ? clip.duration : project.duration;
  const vw = src.w || project.videoWidth || W, vh = src.h || project.videoHeight || H;
  const matted = needsMatte(layer) ? processSource(clip?.id ?? 'main', src, layer, lt, clip ? { asset: clip.assetId, srcT: sourceTimeAt(clip, t), cutout: clip.cutout } : undefined) : src;
  const drawVideo = matted.draw;
  const fit: FitMode = main || clip?.cutout ? project.fit : project.fit === 'cover' ? 'cover' : 'contain';
  if (main && project.fit === 'blur') {
    const c = fitRect(vw, vh, W, H, true);
    ctx.save();
    const supportsFilter = typeof (ctx as { filter?: unknown }).filter === 'string';
    if (supportsFilter) ctx.filter = `blur(${Math.round(Math.min(W, H) / 30)}px) brightness(0.6)`;
    drawVideo(ctx, c.x - 40, c.y - 40, c.w + 80, c.h + 80);
    ctx.restore();
    if (!supportsFilter) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H); }
  }
  // Crop, quarter-turn and flips change the shape of what is shown; fit that shape, not the source.
  const cr = layer.crop!;
  const cw = vw * (1 - (cr.l + cr.r) / 100), ch = vh * (1 - (cr.t + cr.b) / 100);
  const turned = layer.rot90 === 90 || layer.rot90 === 270;
  const r = fitRect(turned ? ch : cw, turned ? cw : ch, W, H, fit === 'cover');
  const shaped = hasCrop(cr) || !!layer.rot90 || layer.flipH || layer.flipV;
  const draw: DrawVideo = !shaped ? drawVideo : (c, dx, dy, dw, dh) => {
    // The destination rect is the bounding box of the shaped image.
    const bw = turned ? dh : dw, bh = turned ? dw : dh;
    const s = bw / cw;
    c.save();
    c.translate(dx + dw / 2, dy + dh / 2);
    c.rotate(((layer.rot90 ?? 0) * Math.PI) / 180);
    c.scale(layer.flipH ? -1 : 1, layer.flipV ? -1 : 1);
    c.beginPath();
    c.rect(-bw / 2, -bh / 2, bw, bh);
    c.clip();
    drawVideo(c, -bw / 2 - vw * (cr.l / 100) * s, -bh / 2 - vh * (cr.t / 100) * s, vw * s, vh * s);
    c.restore();
  };
  const tf = transformAt(layer.keyframes, lt, layer.base!);
  const fxT = fxOn ? effectTransform(layer.effects, lt, clipDur) : { scale: 1, x: 0, y: 0, rotation: 0 };
  const none = (x: { id: string; duration: number }) => ({ ...x, id: 'none' as const });
  const tr = transitionAt(fxOn ? layer : { ...layer, transitionIn: none(layer.transitionIn), transitionOut: none(layer.transitionOut) }, lt, clipDur);
  const px = W / 1080;
  const an = fxOn && (layer.animIn?.id !== undefined && layer.animIn.id !== 'none' || layer.animOut?.id !== undefined && layer.animOut.id !== 'none' || (layer.loop ?? 'none') !== 'none')
    ? overlayPose({ animIn: layer.animIn ?? { id: 'none', duration: 0 }, animOut: layer.animOut ?? { id: 'none', duration: 0 }, loop: layer.loop ?? 'none', duration: clipDur, speed: 1 }, lt) : null;
  ctx.save();
  if (an && an.wipe < 1) { ctx.beginPath(); ctx.rect(0, 0, W * an.wipe, H); ctx.clip(); }
  if (tr.clip) {
    const p = tr.clip.p;
    ctx.beginPath();
    if (tr.clip.kind === 'circle') ctx.arc(W / 2, H / 2, Math.hypot(W, H) / 2 * p, 0, Math.PI * 2);
    else if (tr.clip.kind === 'l') ctx.rect(0, 0, W * p, H);
    else if (tr.clip.kind === 'r') ctx.rect(W * (1 - p), 0, W * p, H);
    else if (tr.clip.kind === 'h') ctx.rect(W * (1 - p) / 2, 0, W * p, H);
    else if (tr.clip.kind === 'u') ctx.rect(0, 0, W, H * p);
    else ctx.rect(0, H * (1 - p), W, H * p);
    ctx.clip();
  }
  ctx.globalAlpha = Math.max(0, Math.min(1, tf.opacity * tr.alpha * (an?.alpha ?? 1)));
  const supportsFilter = typeof (ctx as { filter?: unknown }).filter === 'string';
  if (supportsFilter && fxOn) {
    const f = { ...layer.filters, blur: layer.filters.blur + tr.blur + (an?.blur ?? 0) };
    const css = isNeutral(f) ? 'none' : cssFilter(f, px);
    if (css !== 'none') ctx.filter = css;
  }
  const cx = W / 2 + ((tf.x + fxT.x) / 100) * W + tr.dx * W + (an?.dx ?? 0) * W, cy = H / 2 + ((tf.y + fxT.y) / 100) * H + tr.dy * H + (an?.dy ?? 0) * H;
  ctx.translate(cx, cy);
  ctx.rotate(((tf.rotation + fxT.rotation + tr.rot + (an?.rot ?? 0)) * Math.PI) / 180);
  const sc = tf.scale * fxT.scale * tr.scale * (an?.scale ?? 1) * (an?.sy ?? 1);
  ctx.scale(sc * tr.sx * (an ? an.sx / an.sy : 1), sc);
  ctx.translate(-W / 2, -H / 2);
  const effects = tr.split > 0 ? [...(fxOn ? layer.effects : []), { id: 'tr-split', effectId: 'rgbSplit', intensity: tr.split }] : fxOn ? layer.effects : [];
  drawVideoWithEffects(ctx, draw, r, W, H, effects, lt);
  ctx.restore();
  if (hits && clip && ((clip.track ?? 0) > 0 || clip.cutout)) {
    // Where this video layer landed, so the preview can select, move, resize and rotate it like an overlay.
    const rot = tf.rotation + fxT.rotation + tr.rot + (an?.rot ?? 0), a = (rot * Math.PI) / 180, k = sc * tr.sx * (an ? an.sx / an.sy : 1);
    const mid = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    const hit: OverlayHit = { id: clip.id, clipId: clip.id, cx: cx + (mid.x - W / 2) * k * Math.cos(a) - (mid.y - H / 2) * sc * Math.sin(a), cy: cy + (mid.x - W / 2) * k * Math.sin(a) + (mid.y - H / 2) * sc * Math.cos(a), w: r.w * k, h: r.h * sc, rot };
    if (matted.alphaAt) {
      const alphaAt = matted.alphaAt;
      hit.solidAt = (x, y) => {
        // Canvas point -> the layer's own (untransformed) frame -> the cut-out frame.
        const px = x - cx, py = y - cy, cos = Math.cos(-a), sin = Math.sin(-a);
        const lx = (px * cos - py * sin) / k + W / 2, ly = (px * sin + py * cos) / sc + H / 2;
        return alphaAt((lx - r.x) / r.w, (ly - r.y) / r.h) > 0.15;
      };
    }
    hits.push(hit);
  }
  if (fxOn && layer.filters.vignette > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${(layer.filters.vignette / 100) * 0.85})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (fxOn) drawEffectOverlays(ctx, W, H, layer.effects, lt);
  if (tr.light) drawLight(ctx, W, H, tr.light.kind, tr.light.q, tr.light.sweep);
  if (tr.flash > 0) { ctx.fillStyle = `rgba(${tr.flashColor},${tr.flash})`; ctx.fillRect(0, 0, W, H); }
}

/** Paint a full output frame: background, every video track, b-roll, then filter and effect tracks, captions and the hook. */
export function composeFrame(
  ctx: Ctx2D, W: number, H: number, project: Project, t: number, drawVideo: DrawVideo | null,
  opts: ComposeOptions = {},
): CaptionRenderResult {
  const fxOn = !laneOf(project, 'fx').hidden;
  const adj = fxOn ? adjAt(project.adj ?? [], t).filter((a) => !laneOf(project, a.track === 0 ? 'fx' : `adj:${a.track}`).hidden) : [];

  const scene = (c: Ctx2D) => {
    if (opts.background === 'transparent') c.clearRect(0, 0, W, H);
    else { c.fillStyle = opts.background ?? '#000'; c.fillRect(0, 0, W, H); }
    const clips = project.clips ?? [];
    const layers = videoLayersAt(clips, t);
    const fallback: FrameSource | null = drawVideo ? { draw: drawVideo, w: opts.videoSize?.w || project.videoWidth || W, h: opts.videoSize?.h || project.videoHeight || H } : null;
    if (layers.length === 0 && clips.length === 0 && fallback && !laneOf(project, 'video').hidden) drawLayer(c, W, H, project, t, null, fallback, true, fxOn);
    // One stack of rows: every overlay on a lower row than a video layer is painted before that layer.
    const placed = new Set<string>();
    const below = (row: number) => { if (!opts.hideOverlays) drawOverlays(c, W, H, project, t, opts.brollImages, opts.overlayHits, (o) => o.track < row && !placed.has(o.id), placed); };
    layers.forEach((clip, i) => {
      if (laneOf(project, trackLane(clip.track ?? 0)).hidden) return;
      below(clip.track ?? 0);
      const src = opts.frameFor ? opts.frameFor(clip) : i === 0 ? fallback : null;
      if (src && !migrateVideo(clip.fx).hidden) drawLayer(c, W, H, project, t, clip, src, (clip.track ?? 0) === 0 && i === 0, fxOn, opts.overlayHits);
    });

    for (const b of opts.hideBroll || laneOf(project, 'broll').hidden ? [] : project.broll) {
      if (t < b.start || t >= b.end) continue;
      const img = opts.brollImages?.get(b.assetId);
      if (!img) continue;
      const iw = 'naturalWidth' in img ? img.naturalWidth : img.width;
      const ih = 'naturalHeight' in img ? img.naturalHeight : img.height;
      const fade = Math.min(1, (t - b.start) / 0.2, (b.end - t) / 0.2);
      const zoom = 1 + 0.06 * ((t - b.start) / Math.max(0.1, b.end - b.start)); // gentle Ken Burns
      c.save();
      c.globalAlpha = fade;
      if (b.mode === 'fullscreen') {
        const r = fitRect(iw, ih, W, H, true);
        const cx = W / 2, cy = H / 2;
        c.translate(cx, cy); c.scale(zoom, zoom); c.translate(-cx, -cy);
        c.drawImage(img, r.x, r.y, r.w, r.h);
      } else {
        const bw = W * 0.8, bh = Math.min(H * 0.4, bw * (ih / iw));
        const box: Rect = { x: (W - bw) / 2, y: H * 0.1, w: bw, h: bh };
        const r = fitRect(iw, ih, box.w, box.h, true);
        c.beginPath();
        c.roundRect(box.x, box.y, box.w, box.h, Math.min(W, H) * 0.03);
        c.clip();
        c.drawImage(img, box.x + r.x, box.y + r.y, r.w, r.h);
      }
      c.restore();
    }
    if (!opts.hideOverlays) drawOverlays(c, W, H, project, t, opts.brollImages, opts.overlayHits, (o) => !placed.has(o.id), placed);
  };

  if (!adj.length) scene(ctx);
  else {
    // Scene into a buffer, then every active filter / effect track re-draws it, lowest track first.
    let cur = buffer(0, W, H);
    scene(cur.x);
    let spare = buffer(1, W, H);
    for (const a of adj) {
      spare = a === adj[0] ? spare : buffer(cur.c === buffers[1] ? 2 : 1, W, H);
      if (a.kind === 'filter') applyFilterPass(spare.x, cur.c, W, H, a, project);
      else applyEffectPass(spare.x, cur.c, W, H, a.refId, Math.max(0, Math.min(1, a.intensity / 100)), t - a.start, a.duration);
      cur = spare;
    }
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (opts.background === 'transparent') ctx.clearRect(0, 0, W, H);
    ctx.drawImage(cur.c, 0, 0);
    ctx.restore();
  }

  const res = opts.hideCaptions || laneOf(project, 'captions').hidden
    ? { bbox: null, captionId: null }
    : renderCaptionAt(ctx, W, H, project.captions, project.style, t);
  renderHook(ctx, W, H, project.hook, project.style, t);
  return res;
}

/** A filter clip: re-draw the scene through the preset at the clip's strength. */
function applyFilterPass(out: Ctx2D, src: OffscreenCanvas, W: number, H: number, a: AdjClip, project: Project) {
  void project;
  const preset = FILTER_PRESETS.find((p) => p.id === a.refId);
  const f = blendFilters(preset?.filters ?? {}, a.intensity);
  out.save();
  if (!isNeutral(f) && typeof (out as { filter?: unknown }).filter === 'string') out.filter = cssFilter(f, W / 1080);
  out.drawImage(src, 0, 0);
  out.restore();
  if (needsGrade(f)) {
    const b = buffer(3, W, H);
    b.x.drawImage((out as unknown as { canvas: OffscreenCanvas }).canvas, 0, 0);
    out.clearRect(0, 0, W, H);
    drawGraded(out, b.c, f, a.start);
  }
  if (f.vignette > 0) {
    const g = out.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${(f.vignette / 100) * 0.85})`);
    out.fillStyle = g;
    out.fillRect(0, 0, W, H);
  }
}
