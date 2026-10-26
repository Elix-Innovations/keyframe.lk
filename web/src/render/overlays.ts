import type { Caption, CaptionStyle, OverlayItem, Project, Word } from '../types';
import { cssFamily, ensureFonts, getFont } from '../lib/fonts';
import { unicodeToFM } from '../lib/fm';
import { laneOf } from '../lib/videoFx';
import { overlayClock, overlayPose, overlaysAt } from '../lib/overlays';
import { IDENTITY, transformAt } from '../lib/videoFx';
import { renderCaptionAt, type Ctx2D } from './captions';
import { drawScene } from './scene';

/** Where an overlay was painted, in canvas pixels, so the preview can select and drag it. `w` and `h` are before rotation. */
export interface OverlayHit {
  id: string; cx: number; cy: number; w: number; h: number; rot: number;
  /** Set for a video layer (the id is the clip's): the preview moves its transform instead of an overlay's position. */
  clipId?: string;
  /** Video layers with a cut-out: is the subject (not the empty area) under this canvas point? */
  solidAt?: (x: number, y: number) => boolean;
}

export const overlayLane = (track: number) => (track === 0 ? 'overlay' : `overlay:${track}`);

const EMOJI_STACK = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const hasSinhala = (s: string) => /[඀-෿]/.test(s);

/** Font ids an overlay needs loaded before it is drawn. */
export const overlayFontIds = (list: OverlayItem[] | undefined) => (list ?? []).flatMap((o) => (o.kind === 'text' && o.fontId ? [o.fontId] : []));

function textFont(o: OverlayItem, project: Project) {
  const sin = getFont(o.fontId && getFont(o.fontId).script !== 'english' ? o.fontId : project.style.text.sinhalaFont);
  const en = getFont(o.fontId && getFont(o.fontId).script !== 'sinhala' ? o.fontId : project.style.text.englishFont);
  const primary = o.fontId ? getFont(o.fontId) : hasSinhala(o.text) ? sin : en;
  return { primary, family: o.fontId ? cssFamily(primary) : `${cssFamily(en)}, ${cssFamily(sin)}` };
}

function setSpacing(ctx: Ctx2D, px: number) {
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`;
}

function roundRectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, rr);
}

interface Body { w: number; h: number; paint: (c: Ctx2D, color: string | null, reveal: number, byWord: boolean) => void }

/** Measure an overlay and return a painter that draws it centred on the origin. */
function bodyOf(ctx: Ctx2D, o: OverlayItem, W: number, H: number, project: Project, image: ImageBitmap | HTMLImageElement | undefined): Body | null {
  const ref = Math.min(W, H) / 1080;
  if (o.kind === 'image') {
    if (!image) return null;
    const iw = 'naturalWidth' in image ? image.naturalWidth : image.width;
    const ih = 'naturalHeight' in image ? image.naturalHeight : image.height;
    if (!iw || !ih) return null;
    const w = Math.min(W, H) * 0.7 * o.scale, h = w * (ih / iw);
    return {
      w, h, paint: (c, tint) => {
        if (tint) return; // ghost copies of an image add nothing
        c.save();
        if (o.corner) { roundRectPath(c, -w / 2, -h / 2, w, h, (o.corner / 100) * Math.min(w, h)); c.clip(); }
        c.drawImage(image, -w / 2, -h / 2, w, h);
        c.restore();
      },
    };
  }
  const sticker = o.kind === 'sticker';
  const size = (sticker ? 190 : 64) * ref * o.scale;
  const { primary, family } = sticker ? { primary: null, family: EMOJI_STACK } : textFont(o, project);
  const raw = o.text || (sticker ? '' : 'Text');
  const text = primary?.legacy ? unicodeToFM(raw) : raw;
  ctx.save();
  ctx.font = `${o.italic ? 'italic ' : ''}${o.bold && !sticker ? (primary?.boldWeight ?? 800) : 500} ${size}px ${family}`;
  setSpacing(ctx, (o.letterSpacing ?? 0) * ref * o.scale);
  const maxW = W * 0.86;
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const test = line + word;
      if (line && ctx.measureText(test.trimEnd()).width > maxW && word.trim()) { lines.push(line.trimEnd()); line = word.trimStart(); } else line = test;
    }
    lines.push(line.trimEnd());
  }
  const lh = size * (sticker ? 1.1 : 1.22);
  const widths = lines.map((l) => ctx.measureText(l).width);
  const tw = Math.max(1, ...widths);
  ctx.restore();
  const padX = o.bg ? size * 0.4 : 0, padY = o.bg ? size * 0.2 : 0;
  const w = tw + padX * 2, h = lines.length * lh + padY * 2;
  const total = lines.reduce((n, l) => n + l.length, 0);
  const font = `${o.italic ? 'italic ' : ''}${o.bold && !sticker ? (primary?.boldWeight ?? 800) : 500} ${size}px ${family}`;
  return {
    w, h, paint: (c, tint, reveal, byWord) => {
      c.save();
      c.font = font;
      setSpacing(c, (o.letterSpacing ?? 0) * ref * o.scale);
      c.textBaseline = 'middle';
      c.lineJoin = 'round';
      const align = o.align ?? 'center';
      c.textAlign = align;
      const ax = align === 'left' ? -tw / 2 : align === 'right' ? tw / 2 : 0;
      if (o.bg && !tint) {
        c.save();
        c.globalAlpha *= o.bg.opacity;
        c.fillStyle = o.bg.color;
        roundRectPath(c, -w / 2, -h / 2, w, h, o.bg.radius * Math.min(w, h));
        c.fill();
        c.restore();
      }
      let left = Math.ceil(total * reveal);
      if (byWord && reveal < 1) { // snap to the end of the word being shown
        const ends: number[] = [];
        let off = 0;
        for (const ln of lines) { for (const m of ln.matchAll(/\S+/g)) ends.push(off + m.index! + m[0].length); off += ln.length; }
        left = Math.ceil(ends.length * reveal) <= 0 ? 0 : ends[Math.ceil(ends.length * reveal) - 1];
      }
      lines.forEach((ln, i) => {
        if (left <= 0) return;
        const shown = ln.slice(0, left);
        left -= ln.length;
        const y = -h / 2 + padY + lh * (i + 0.5);
        if (!sticker && o.strokeWidth > 0 && !tint) {
          c.strokeStyle = o.strokeColor;
          c.lineWidth = o.strokeWidth * ref * o.scale * 2;
          c.strokeText(shown, ax, y);
        }
        if (o.shadow && !tint && !o.glow) {
          c.shadowColor = 'rgba(0,0,0,0.65)';
          c.shadowBlur = size * 0.18;
          c.shadowOffsetY = size * 0.05;
        }
        if (o.glow && !tint) {
          c.shadowColor = o.glow.color;
          c.shadowBlur = size * 0.35 * o.glow.radius;
          c.fillStyle = o.glow.color;
          c.fillText(shown, ax, y); // a second pass thickens the glow
        }
        c.fillStyle = tint ?? o.color;
        c.fillText(shown, ax, y);
      });
      c.restore();
    },
  };
}

/** Paint every overlay active at t, lowest track first. Fills `hits` with where each one landed. */
/** A text-template layer: the template's caption look drawn from the overlay's own text, size, position and timing. */
function drawTemplateOverlay(ctx: Ctx2D, W: number, H: number, o: OverlayItem, t: number, hits?: OverlayHit[]) {
  const style = o.tpl!.style;
  void ensureFonts([style.text.sinhalaFont, style.text.englishFont, ...(style.creative?.lines.map((l) => l.font) ?? [])]);
  // *Starred* words are the emphasised ones; nothing is picked automatically, so a plain line is not coloured by guesswork.
  const raw = (o.text.trim() || 'Text').split(/\s+/);
  const parts = raw.map((w) => w.replace(/^\*+|\*+$/g, '') || w);
  const creative = !!style.creative;
  // A plain caption template keeps its display mode (word by word, highlight, box, emphasis): spread the words over the layer so they play out.
  const step = creative ? 0 : (o.duration / parts.length) * 0.85;
  const words: Word[] = parts.map((text, i) => ({ id: `${o.id}-${i}`, text, start: o.start + i * step, end: i === parts.length - 1 ? o.start + o.duration : o.start + (i + 1) * step, ...(!creative && /^\*[^*]+\*?$|^[^*]+\*$/.test(raw[i]) ? { emphasize: true } : {}) }));
  const caption: Caption = { id: o.id, start: o.start, end: o.start + o.duration, words };
  const look: CaptionStyle = {
    ...style, ...(creative ? { displayMode: 'natural' as const, wordsPerChunk: 0 } : {}),
    text: { ...style.text, fontSize: style.text.fontSize * o.scale, opacity: style.text.opacity * o.opacity },
    layout: { ...style.layout, x: o.x, y: o.y },
  };
  ctx.save();
  if (o.rotation) { const cx = (o.x / 100) * W, cy = (o.y / 100) * H; ctx.translate(cx, cy); ctx.rotate((o.rotation * Math.PI) / 180); ctx.translate(-cx, -cy); }
  if (o.blend && o.blend !== 'normal') ctx.globalCompositeOperation = o.blend;
  const r = renderCaptionAt(ctx, W, H, [caption], look, t);
  ctx.restore();
  if (r.bbox) hits?.push({ id: o.id, cx: r.bbox.x + r.bbox.w / 2, cy: r.bbox.y + r.bbox.h / 2, w: r.bbox.w, h: r.bbox.h, rot: o.rotation });
}

export function drawOverlays(
  ctx: Ctx2D, W: number, H: number, project: Project, t: number,
  images: Map<string, ImageBitmap | HTMLImageElement> | undefined, hits?: OverlayHit[],
  /** Draw only the overlays this accepts, and record them in `drawn`: used to paint overlays that sit behind a video layer. */
  only?: (o: OverlayItem) => boolean, drawn?: Set<string>,
) {
  const list = project.overlays;
  if (!list?.length) return;
  for (const o of overlaysAt(list, t)) {
    if (only && !only(o)) continue;
    drawn?.add(o.id);
    if (laneOf(project, overlayLane(o.track)).hidden) continue;
    if (o.kind === 'motion' && o.scene) {
      // A motion graphic / transition: the scene's own clock starts with the layer; the layer's position, size, rotation and opacity move it as a whole.
      ctx.save();
      ctx.globalAlpha *= Math.max(0, Math.min(1, o.opacity));
      if (o.blend && o.blend !== 'normal') ctx.globalCompositeOperation = o.blend;
      const cx = W / 2 + ((o.x - 50) / 100) * W, cy = H / 2 + ((o.y - 50) / 100) * H;
      ctx.translate(cx, cy);
      if (o.rotation) ctx.rotate((o.rotation * Math.PI) / 180);
      ctx.scale(o.scale, o.scale);
      ctx.translate(-W / 2, -H / 2);
      drawScene(ctx, W, H, o.scene, Math.max(0, (t - o.start) * (o.speed ?? 1)), { fonts: { english: project.style.text.englishFont, sinhala: project.style.text.sinhalaFont } });
      ctx.restore();
      continue;
    }
    if (o.tpl) { drawTemplateOverlay(ctx, W, H, o, t, hits); continue; }
    const body = bodyOf(ctx, o, W, H, project, o.assetId ? images?.get(o.assetId) : undefined);
    if (!body) continue;
    const pose = overlayPose(o, t - o.start);
    const kf = o.keyframes?.length ? transformAt(o.keyframes, overlayClock(o, t - o.start), IDENTITY) : IDENTITY;
    const cx = ((o.x + kf.x) / 100 + pose.dx) * W, cy = ((o.y + kf.y) / 100 + pose.dy) * H;
    const rot = o.rotation + kf.rotation + pose.rot;
    const sc = pose.scale * kf.scale;
    hits?.push({ id: o.id, cx, cy, w: body.w * sc * pose.sx, h: body.h * sc * pose.sy, rot });
    const alpha = Math.max(0, Math.min(1, o.opacity * pose.alpha * kf.opacity));
    if (alpha <= 0) continue;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (o.blend && o.blend !== 'normal') ctx.globalCompositeOperation = o.blend;
    if (pose.blur > 0 && typeof (ctx as { filter?: unknown }).filter === 'string') ctx.filter = `blur(${(pose.blur * W / 1080).toFixed(1)}px)`;
    ctx.translate(cx, cy);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(sc * pose.sx * (o.flipH && o.kind !== 'text' ? -1 : 1), sc * pose.sy);
    if (pose.wipe < 1) { ctx.beginPath(); ctx.rect(-body.w / 2, -body.h / 2, body.w * pose.wipe, body.h); ctx.clip(); }
    if (pose.split > 0) {
      const d = pose.split * body.h;
      ctx.save(); ctx.globalAlpha *= 0.75; ctx.translate(-d, 0); body.paint(ctx, '#FF2D55', pose.reveal, pose.byWord); ctx.restore();
      ctx.save(); ctx.globalAlpha *= 0.75; ctx.translate(d, 0); body.paint(ctx, '#18D2FF', pose.reveal, pose.byWord); ctx.restore();
    }
    body.paint(ctx, null, pose.reveal, pose.byWord);
    ctx.restore();
  }
}
