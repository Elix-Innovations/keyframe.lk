import type { MotionScene, SceneNode, SceneProp } from '../types';
import { easeFn } from '../lib/ease';
import { cssFamily, ensureFonts, getFont } from '../lib/fonts';
import type { Ctx2D } from './captions';

/**
 * Draws a motion scene (see `MotionScene`) with plain Canvas2D. The scene is laid out in design units, 1080 wide and
 * `scene.frame.h` tall, and scaled to the output frame, so the same scene looks the same in the preview and in an export.
 */

export interface SceneOptions {
  /** Font ids used for text nodes that do not name one: the project's English and Sinhala fonts. */
  fonts?: { english: string; sinhala: string };
}

// ---------- colours ----------

type RGBA = [number, number, number, number];
const colourCache = new Map<string, RGBA>();

function parseColour(c: string): RGBA {
  const hit = colourCache.get(c);
  if (hit) return hit;
  let out: RGBA = [255, 255, 255, 1];
  const s = c.trim().toLowerCase();
  let m: RegExpExecArray | null;
  if ((m = /^#([0-9a-f]{3,8})$/.exec(s))) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h.slice(0, 6), 16);
    out = [(n >> 16) & 255, (n >> 8) & 255, n & 255, h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  } else if ((m = /^rgba?\(([^)]+)\)$/.exec(s))) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    out = [p[0] || 0, p[1] || 0, p[2] || 0, p.length > 3 ? p[3] : 1];
  } else if (s === 'white') out = [255, 255, 255, 1];
  else if (s === 'black') out = [0, 0, 0, 1];
  else if (s === 'transparent') out = [0, 0, 0, 0];
  colourCache.set(c, out);
  return out;
}
const rgbaStr = (c: RGBA) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${Math.max(0, Math.min(1, c[3])).toFixed(3)})`;

// ---------- keyframes ----------

const isKeys = <T,>(p: SceneProp<T> | undefined): p is { keys: { t: number; v: T; ease?: string }[] } =>
  !!p && typeof p === 'object' && !Array.isArray(p) && 'keys' in (p as object);

function sampleNum(p: SceneProp<number> | undefined, t: number, fallback: number): number {
  if (p === undefined) return fallback;
  if (!isKeys(p)) return typeof p === 'number' ? p : fallback;
  const ks = p.keys;
  if (!ks.length) return fallback;
  if (t <= ks[0].t) return ks[0].v;
  const last = ks[ks.length - 1];
  if (t >= last.t) return last.v;
  let i = 0;
  while (i < ks.length - 2 && ks[i + 1].t <= t) i++;
  const a = ks[i], b = ks[i + 1];
  const u = easeFn(a.ease)((t - a.t) / Math.max(1e-6, b.t - a.t));
  return a.v + (b.v - a.v) * u;
}

function sampleColour(p: SceneProp<string> | undefined, t: number): string | null {
  if (p === undefined) return null;
  if (!isKeys(p)) return typeof p === 'string' ? p : null;
  const ks = p.keys;
  if (!ks.length) return null;
  if (t <= ks[0].t) return ks[0].v;
  const last = ks[ks.length - 1];
  if (t >= last.t) return last.v;
  let i = 0;
  while (i < ks.length - 2 && ks[i + 1].t <= t) i++;
  const a = ks[i], b = ks[i + 1];
  const u = easeFn(a.ease)((t - a.t) / Math.max(1e-6, b.t - a.t));
  const x = parseColour(a.v), y = parseColour(b.v);
  return rgbaStr([x[0] + (y[0] - x[0]) * u, x[1] + (y[1] - x[1]) * u, x[2] + (y[2] - x[2]) * u, x[3] + (y[3] - x[3]) * u]);
}

// ---------- drawing ----------

const BLEND: Record<string, GlobalCompositeOperation> = {
  normal: 'source-over', screen: 'screen', multiply: 'multiply', overlay: 'overlay', lighter: 'lighter', difference: 'difference', 'soft-light': 'soft-light',
};

/** Font ids a scene uses, so they can be loaded before it is drawn. */
export const sceneFontIds = (scene: MotionScene): string[] => {
  const out = new Set<string>();
  const walk = (ns: SceneNode[]) => ns.forEach((n) => { if (n.font) out.add(n.font); if (n.children) walk(n.children); });
  walk(scene.layers);
  return [...out];
};

export const sceneFrame = (scene: MotionScene) => scene.frame ?? { w: 1080, h: 1920 };

let aside: HTMLCanvasElement | OffscreenCanvas | null = null;
function scratch(W: number, H: number) {
  if (!aside) aside = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : document.createElement('canvas');
  if (aside.width !== W) aside.width = W;
  if (aside.height !== H) aside.height = H;
  return aside;
}

/** Draw the scene at time `t` (seconds from its start) into a W×H canvas. Everything outside the scene's shapes stays transparent. */
export function drawScene(ctx: Ctx2D, W: number, H: number, scene: MotionScene, t: number, opts: SceneOptions = {}) {
  const adj = scene.adjust;
  if (adj && (adj.hue || (adj.sat ?? 1) !== 1 || (adj.bri ?? 1) !== 1 || (adj.con ?? 1) !== 1 || (adj.speed ?? 1) !== 1)) {
    // Draw the plain scene aside, then lay it down through a colour filter (the nodes use ctx.filter for blur themselves).
    const aside = scratch(W, H);
    const actx = aside.getContext('2d') as Ctx2D;
    actx.clearRect(0, 0, W, H);
    drawScene(actx, W, H, { ...scene, adjust: undefined }, t * (adj.speed ?? 1), opts);
    ctx.save();
    if ('filter' in ctx) (ctx as { filter: string }).filter = `hue-rotate(${adj.hue ?? 0}deg) saturate(${adj.sat ?? 1}) brightness(${adj.bri ?? 1}) contrast(${adj.con ?? 1})`;
    ctx.drawImage(aside as CanvasImageSource, 0, 0);
    ctx.restore();
    return;
  }
  void ensureFonts([...sceneFontIds(scene), opts.fonts?.english, opts.fonts?.sinhala]);
  const frame = sceneFrame(scene);
  const s = W / frame.w;
  ctx.save();
  ctx.scale(s, s);
  const local = { s, DW: frame.w, DH: H / s };
  if (scene.bg) { ctx.fillStyle = scene.bg; ctx.fillRect(0, 0, local.DW, local.DH); }
  for (const n of scene.layers) drawNode(ctx, n, t, scene.duration, local, opts);
  ctx.restore();
}

interface Local { s: number; DW: number; DH: number }

function drawNode(ctx: Ctx2D, n: SceneNode, t: number, duration: number, L: Local, opts: SceneOptions, rel = false) {
  const start = n.start ?? 0, end = n.end ?? duration;
  if (t < start - 1e-6 || t >= end - 1e-6) return;
  const opacity = Math.max(0, Math.min(1, sampleNum(n.opacity, t, 1)));
  if (opacity <= 0.001) return;
  const x = sampleNum(n.x, t, rel ? 0 : L.DW / 2), y = sampleNum(n.y, t, rel ? 0 : L.DH / 2);
  const sc = sampleNum(n.scale, t, 1);
  const sx = sc * sampleNum(n.scaleX, t, 1), sy = sc * sampleNum(n.scaleY, t, 1);
  const rot = (sampleNum(n.rotation, t, 0) * Math.PI) / 180;
  const w = sampleNum(n.w, t, 100), h = sampleNum(n.h, t, 100);
  const ax = n.ax ?? 0.5, ay = n.ay ?? 0.5;

  ctx.save();
  ctx.globalAlpha *= opacity;
  if (n.blend && BLEND[n.blend]) ctx.globalCompositeOperation = BLEND[n.blend];
  const blur = sampleNum(n.blur, t, 0);
  if (blur > 0.2 && 'filter' in ctx) (ctx as { filter: string }).filter = `blur(${(blur * L.s).toFixed(2)}px)`;
  if (n.shadow) { ctx.shadowColor = n.shadow.color; ctx.shadowBlur = n.shadow.blur; ctx.shadowOffsetX = n.shadow.x ?? 0; ctx.shadowOffsetY = n.shadow.y ?? 0; }
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);

  const fill = sampleColour(n.fill, t);
  const paint = (): string | CanvasGradient | null => {
    if (n.gradient && n.gradient.stops.length > 1) {
      const a = (n.gradient.angle * Math.PI) / 180, dx = Math.sin(a), dy = -Math.cos(a);
      const hw = n.type === 'text' ? 200 : w / 2, hh = n.type === 'text' ? 40 : h / 2;
      const len = Math.abs(hw * dx) + Math.abs(hh * dy);
      const g = ctx.createLinearGradient(-dx * len, -dy * len, dx * len, dy * len);
      for (const st of n.gradient.stops) g.addColorStop(Math.max(0, Math.min(1, st.p)), st.c);
      return g;
    }
    return fill;
  };

  if (n.type === 'rect' || n.type === 'ellipse') {
    const left = -ax * w, top = -ay * h;
    const p = paint();
    ctx.beginPath();
    if (n.type === 'ellipse') ctx.ellipse(left + w / 2, top + h / 2, Math.max(0, w / 2), Math.max(0, h / 2), 0, 0, Math.PI * 2);
    else ctx.roundRect(left, top, Math.max(0, w), Math.max(0, h), Math.max(0, sampleNum(n.radius, t, 0)));
    if (p) { ctx.fillStyle = p; ctx.fill(); }
    if (n.stroke) { ctx.strokeStyle = n.stroke; ctx.lineWidth = sampleNum(n.strokeWidth, t, 2); ctx.stroke(); }
    if (!p && !n.stroke) { ctx.fillStyle = '#fff'; ctx.fill(); }
  } else if (n.type === 'line') {
    const x2 = sampleNum(n.x2, t, 100), y2 = sampleNum(n.y2, t, 0), trim = Math.max(0, Math.min(1, sampleNum(n.trim, t, 1)));
    // The line is drawn from the node origin to (x2 - x, y2 - y), so rotation and scale pivot at its start.
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo((x2 - x) * trim, (y2 - y) * trim);
    ctx.strokeStyle = n.stroke ?? fill ?? '#fff';
    ctx.lineWidth = sampleNum(n.strokeWidth, t, 6);
    ctx.lineCap = n.cap ?? 'round';
    ctx.stroke();
  } else if (n.type === 'path' && n.points && n.points.length >= 6) {
    const pts = n.points, m = pts.length / 2, closed = !!n.closed, trim = Math.max(0, Math.min(1, sampleNum(n.trim, t, 1)));
    const P = (i: number) => { const j = closed ? ((i % m) + m) % m : Math.max(0, Math.min(m - 1, i)); return [pts[j * 2], pts[j * 2 + 1]]; };
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    // Catmull-Rom through the points, as cubic beziers.
    const segs = closed ? m : m - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
    if (closed) ctx.closePath();
    const p = paint();
    if (p && n.fill) { ctx.fillStyle = p; ctx.fill(); }
    if (n.stroke) {
      ctx.strokeStyle = n.stroke; ctx.lineWidth = sampleNum(n.strokeWidth, t, 2); ctx.lineJoin = 'round'; ctx.lineCap = n.cap ?? 'round';
      if (trim < 1) {
        let len = 0;
        for (let i = 1; i < m; i++) len += Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
        len *= 1.15;
        ctx.setLineDash([len * trim, len * 2]);
      }
      ctx.stroke();
    }
  } else if (n.type === 'text' && n.text) {
    const size = sampleNum(n.size, t, 64);
    const eng = getFont(n.font ?? opts.fonts?.english), sin = getFont(opts.fonts?.sinhala);
    ctx.font = `${n.italic ? 'italic ' : ''}${n.weight ?? 800} ${size}px ${cssFamily(eng)}, ${cssFamily(sin)}`;
    ctx.textAlign = n.align ?? 'center';
    ctx.textBaseline = 'middle';
    if (n.letterSpacing && 'letterSpacing' in ctx) (ctx as { letterSpacing: string }).letterSpacing = `${n.letterSpacing}px`;
    let txt = n.text;
    if (n.reveal !== undefined) {
      const chars = [...txt], shown = Math.round(chars.length * Math.max(0, Math.min(1, sampleNum(n.reveal, t, 1))));
      txt = chars.slice(0, shown).join('');
    }
    const p = paint() ?? '#fff';
    const lines = txt.split('\n');
    lines.forEach((ln, i) => {
      const ly = (i - (lines.length - 1) / 2) * size * 1.15;
      if (n.stroke) { ctx.strokeStyle = n.stroke; ctx.lineWidth = sampleNum(n.strokeWidth, t, 4); ctx.lineJoin = 'round'; ctx.strokeText(ln, 0, ly); }
      ctx.fillStyle = p;
      ctx.fillText(ln, 0, ly);
    });
  } else if (n.type === 'group') {
    if (n.clip) { ctx.beginPath(); ctx.rect(-ax * w, -ay * h, w, h); ctx.clip(); }
    // Children are positioned relative to the group's origin.
    for (const c of n.children ?? []) drawNode(ctx, c, t, duration, L, opts, true);
  }
  ctx.restore();
}
