import type { EffectInstance } from '../types';
import type { Ctx2D, Rect } from './captions';

type Draw = (ctx: Ctx2D, dx: number, dy: number, dw: number, dh: number) => void;
/** Extra transform: scale multiplies; x, y (% of frame) and rotation (deg) add. */
export interface FxTransform { scale?: number; x?: number; y?: number; rotation?: number }
type Group = 'Motion' | 'Glitch' | 'Light' | 'Texture' | 'Frame';

interface EffectDef {
  id: string;
  label: string;
  group: Group;
  transform?: (t: number, k: number, dur: number) => FxTransform;
  /** Replaces the plain video draw. */
  draw?: (ctx: Ctx2D, draw: Draw, r: Rect, W: number, H: number, t: number, k: number) => void;
  /** Painted over the video, under captions. */
  overlay?: (ctx: Ctx2D, W: number, H: number, t: number, k: number) => void;
}

// Deterministic noise so preview, scrubbing and export agree frame for frame.
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const frac = (x: number) => x - Math.floor(x);
const supportsFilter = (ctx: Ctx2D) => typeof (ctx as { filter?: unknown }).filter === 'string';

function ghost(ctx: Ctx2D, draw: Draw, r: Rect, dx: number, filter: string, alpha: number, op: GlobalCompositeOperation) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.globalCompositeOperation = op;
  if (filter && supportsFilter(ctx)) ctx.filter = filter;
  draw(ctx, r.x + dx, r.y, r.w, r.h);
  ctx.restore();
}
function rgbSplit(ctx: Ctx2D, draw: Draw, r: Rect, off: number) {
  draw(ctx, r.x, r.y, r.w, r.h);
  ghost(ctx, draw, r, -off, 'sepia(1) saturate(6) hue-rotate(-50deg)', 0.5, 'screen');
  ghost(ctx, draw, r, off, 'sepia(1) saturate(6) hue-rotate(150deg)', 0.5, 'screen');
}
function specks(ctx: Ctx2D, W: number, H: number, seed: number, n: number, size: number, style: string) {
  ctx.fillStyle = style;
  for (let i = 0; i < n; i++) ctx.fillRect(hash(seed + i * 2.1) * W, hash(seed + i * 3.7 + 9) * H, size, size);
}
function vignette(ctx: Ctx2D, W: number, H: number, a: number) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
function lines(ctx: Ctx2D, W: number, H: number, gap: number, style: string) {
  ctx.fillStyle = style;
  for (let y = 0; y < H; y += gap * 2) ctx.fillRect(0, y, W, gap);
}
function blend(ctx: Ctx2D, op: GlobalCompositeOperation, fn: () => void) {
  ctx.save(); ctx.globalCompositeOperation = op; fn(); ctx.restore();
}

let tmp: OffscreenCanvas | null = null;

const E = (e: EffectDef) => e;
export const EFFECTS: EffectDef[] = [
  // Motion
  E({ id: 'shake', label: 'Shake', group: 'Motion', transform: (t, k) => ({ scale: 1 + 0.03 * k, x: (hash(t * 30) - 0.5) * 3 * k, y: (hash(t * 30 + 5) - 0.5) * 3 * k, rotation: (hash(t * 30 + 9) - 0.5) * 2 * k }) }),
  E({ id: 'jitter', label: 'Jitter', group: 'Motion', transform: (t, k) => { const s = Math.floor(t * 12); return { scale: 1 + 0.02 * k, x: (hash(s) - 0.5) * 2.4 * k, y: (hash(s + 3) - 0.5) * 2.4 * k }; } }),
  E({ id: 'heartbeat', label: 'Heartbeat', group: 'Motion', transform: (t, k) => ({ scale: 1 + 0.07 * k * Math.pow(Math.max(0, Math.sin(frac(t / 0.9) * Math.PI * 2)), 3) }) }),
  E({ id: 'zoomPunch', label: 'Zoom punch', group: 'Motion', transform: (t, k) => ({ scale: 1 + 0.14 * k * Math.exp(-frac(t) * 6) }) }),
  E({ id: 'kenIn', label: 'Slow zoom in', group: 'Motion', transform: (t, k, d) => ({ scale: 1 + 0.3 * k * Math.min(1, t / Math.max(1, d)) }) }),
  E({ id: 'kenOut', label: 'Slow zoom out', group: 'Motion', transform: (t, k, d) => ({ scale: 1 + 0.3 * k * (1 - Math.min(1, t / Math.max(1, d))) }) }),
  E({ id: 'panLeft', label: 'Pan left', group: 'Motion', transform: (t, k, d) => ({ scale: 1 + 0.16 * k, x: (0.5 - Math.min(1, t / Math.max(1, d))) * 10 * k }) }),
  E({ id: 'panRight', label: 'Pan right', group: 'Motion', transform: (t, k, d) => ({ scale: 1 + 0.16 * k, x: (Math.min(1, t / Math.max(1, d)) - 0.5) * 10 * k }) }),
  E({ id: 'panUp', label: 'Pan up', group: 'Motion', transform: (t, k, d) => ({ scale: 1 + 0.16 * k, y: (0.5 - Math.min(1, t / Math.max(1, d))) * 10 * k }) }),
  E({ id: 'spin', label: 'Spin', group: 'Motion', transform: (t, k) => ({ rotation: t * 40 * k, scale: 1 + 0.4 * k }) }),
  E({ id: 'wobble', label: 'Wobble', group: 'Motion', transform: (t, k) => ({ rotation: Math.sin(t * 4) * 4 * k, scale: 1 + 0.06 * k }) }),
  E({ id: 'sway', label: 'Sway', group: 'Motion', transform: (t, k) => ({ x: Math.sin(t * 2) * 3 * k, rotation: Math.sin(t * 2) * 1.5 * k, scale: 1 + 0.05 * k }) }),
  E({ id: 'bounce', label: 'Bounce', group: 'Motion', transform: (t, k) => ({ y: -Math.abs(Math.sin(t * 3.2)) * 4 * k, scale: 1 + 0.05 * k }) }),
  E({ id: 'float', label: 'Float', group: 'Motion', transform: (t, k) => ({ y: Math.sin(t * 1.5) * 2.5 * k, scale: 1 + 0.05 * k }) }),
  E({ id: 'tiltShake', label: 'Tilt shake', group: 'Motion', transform: (t, k) => ({ rotation: (hash(Math.floor(t * 16)) - 0.5) * 6 * k, scale: 1 + 0.06 * k }) }),
  E({ id: 'swing', label: 'Swing', group: 'Motion', transform: (t, k) => ({ rotation: Math.sin(t * 2.5) * 8 * k, scale: 1 + 0.12 * k }) }),
  // Glitch
  E({ id: 'rgbSplit', label: 'RGB split', group: 'Glitch', draw: (c, d, r, W, _H, _t, k) => rgbSplit(c, d, r, W * 0.012 * k) }),
  E({ id: 'glitch', label: 'Glitch', group: 'Glitch', draw: (c, d, r, W, H, t, k) => {
    const step = Math.floor(t * 8);
    const on = hash(step) < 0.55;
    rgbSplit(c, d, r, W * (on ? 0.03 : 0.008) * k);
    if (!on) return;
    for (let i = 0; i < 3; i++) {
      const y = hash(step + i * 7) * H, h = H * (0.03 + hash(step + i * 11) * 0.08), dx = (hash(step + i * 13) - 0.5) * W * 0.12 * k;
      c.save(); c.beginPath(); c.rect(0, y, W, h); c.clip(); d(c, r.x + dx, r.y, r.w, r.h); c.restore();
    }
  } }),
  E({ id: 'mirror', label: 'Mirror', group: 'Glitch', draw: (c, d, r, W, H) => {
    c.save(); c.beginPath(); c.rect(0, 0, W / 2, H); c.clip(); d(c, r.x, r.y, r.w, r.h); c.restore();
    c.save(); c.translate(W, 0); c.scale(-1, 1); c.beginPath(); c.rect(0, 0, W / 2, H); c.clip(); d(c, r.x, r.y, r.w, r.h); c.restore();
  } }),
  E({ id: 'mirrorV', label: 'Mirror vertical', group: 'Glitch', draw: (c, d, r, W, H) => {
    c.save(); c.beginPath(); c.rect(0, 0, W, H / 2); c.clip(); d(c, r.x, r.y, r.w, r.h); c.restore();
    c.save(); c.translate(0, H); c.scale(1, -1); c.beginPath(); c.rect(0, 0, W, H / 2); c.clip(); d(c, r.x, r.y, r.w, r.h); c.restore();
  } }),
  E({ id: 'pixelate', label: 'Pixelate', group: 'Glitch', draw: (c, d, r, W, H, _t, k) => {
    const size = Math.max(2, Math.round(W * 0.03 * (0.3 + k)));
    const w = Math.max(1, Math.round(W / size)), h = Math.max(1, Math.round(H / size));
    if (!tmp || tmp.width !== w || tmp.height !== h) tmp = new OffscreenCanvas(w, h);
    const tc = tmp.getContext('2d')!;
    tc.clearRect(0, 0, w, h);
    d(tc, r.x / size, r.y / size, r.w / size, r.h / size);
    c.save(); c.imageSmoothingEnabled = false; c.drawImage(tmp, 0, 0, w, h, 0, 0, W, H); c.restore();
  } }),
  E({ id: 'ghost', label: 'Double vision', group: 'Glitch', draw: (c, d, r, W, _H, t, k) => {
    d(c, r.x, r.y, r.w, r.h);
    ghost(c, d, r, Math.sin(t * 3) * W * 0.02 * k + W * 0.01 * k, '', 0.4 * k + 0.1, 'source-over');
  } }),
  // Light
  E({ id: 'strobe', label: 'Strobe', group: 'Light', overlay: (c, W, H, t, k) => { if (frac(t * 4) < 0.08) { c.fillStyle = `rgba(255,255,255,${0.8 * k})`; c.fillRect(0, 0, W, H); } } }),
  E({ id: 'flicker', label: 'Flicker', group: 'Light', overlay: (c, W, H, t, k) => { c.fillStyle = `rgba(0,0,0,${hash(Math.floor(t * 20)) * 0.3 * k})`; c.fillRect(0, 0, W, H); } }),
  E({ id: 'lightLeak', label: 'Light leak', group: 'Light', overlay: (c, W, H, t, k) => blend(c, 'screen', () => {
    const x = W * (0.5 + 0.45 * Math.sin(t * 0.8)), g = c.createRadialGradient(x, H * 0.15, 0, x, H * 0.15, Math.max(W, H) * 0.7);
    g.addColorStop(0, `rgba(255,150,60,${0.75 * k})`); g.addColorStop(0.5, `rgba(255,60,90,${0.3 * k})`); g.addColorStop(1, 'rgba(255,60,90,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }) }),
  E({ id: 'bloom', label: 'Bloom', group: 'Light', overlay: (c, W, H, _t, k) => blend(c, 'screen', () => {
    const g = c.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, Math.max(W, H) * 0.7);
    g.addColorStop(0, `rgba(255,240,220,${0.35 * k})`); g.addColorStop(1, 'rgba(255,240,220,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }) }),
  E({ id: 'tealOrange', label: 'Teal & orange', group: 'Light', overlay: (c, W, H, _t, k) => blend(c, 'soft-light', () => {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(0,150,190,${k})`); g.addColorStop(1, `rgba(255,140,50,${k})`);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }) }),
  E({ id: 'rainbow', label: 'Rainbow', group: 'Light', overlay: (c, W, H, t, k) => blend(c, 'overlay', () => {
    const g = c.createLinearGradient(0, 0, W, H), o = frac(t * 0.15);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsla(${(frac(o + i / 6) * 360).toFixed(0)},90%,55%,${0.55 * k})`);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }) }),
  E({ id: 'pulseVignette', label: 'Pulse vignette', group: 'Light', overlay: (c, W, H, t, k) => vignette(c, W, H, (0.35 + 0.35 * Math.sin(t * 3)) * k + 0.1) }),
  // Texture
  E({ id: 'grain', label: 'Film grain', group: 'Texture', overlay: (c, W, H, t, k) => {
    const s = Math.floor(t * 24) * 17, px = Math.max(1, W / 540);
    specks(c, W, H, s, Math.round(900 * k), px, 'rgba(255,255,255,0.18)');
    specks(c, W, H, s + 500, Math.round(900 * k), px, 'rgba(0,0,0,0.22)');
  } }),
  E({ id: 'dust', label: 'Dust', group: 'Texture', overlay: (c, W, H, t, k) => specks(c, W, H, Math.floor(t * 8) * 31, Math.round(40 * k), Math.max(1.5, W / 400), 'rgba(255,255,255,0.55)') }),
  E({ id: 'scanlines', label: 'Scanlines', group: 'Texture', overlay: (c, W, H, _t, k) => lines(c, W, H, Math.max(1, W / 360), `rgba(0,0,0,${0.3 * k})`) }),
  E({ id: 'vhs', label: 'VHS', group: 'Texture', overlay: (c, W, H, t, k) => {
    lines(c, W, H, Math.max(1, W / 300), `rgba(0,0,0,${0.22 * k})`);
    const y = frac(t * 0.25) * H * 1.2 - H * 0.1;
    c.fillStyle = `rgba(255,255,255,${0.1 * k})`; c.fillRect(0, y, W, H * 0.06);
    specks(c, W, H, Math.floor(t * 30) * 13, Math.round(120 * k), Math.max(1, W / 540), 'rgba(255,255,255,0.15)');
  } }),
  E({ id: 'crt', label: 'CRT', group: 'Texture', overlay: (c, W, H, _t, k) => { lines(c, W, H, Math.max(1, W / 420), `rgba(0,0,0,${0.16 * k})`); vignette(c, W, H, 0.65 * k); } }),
  // Frame
  E({ id: 'letterbox', label: 'Letterbox', group: 'Frame', overlay: (c, W, H, _t, k) => { const b = H * 0.11 * (0.4 + k); c.fillStyle = '#000'; c.fillRect(0, 0, W, b); c.fillRect(0, H - b, W, b); } }),
  E({ id: 'polaroid', label: 'Polaroid frame', group: 'Frame', overlay: (c, W, H, _t, k) => {
    const s = W * 0.04 * (0.4 + k); c.fillStyle = '#f7f4ec';
    c.fillRect(0, 0, W, s); c.fillRect(0, 0, s, H); c.fillRect(W - s, 0, s, H); c.fillRect(0, H - s * 3.2, W, s * 3.2);
  } }),
  // Trending on TikTok, Reels and Shorts
  E({ id: 'zoomBeat', label: 'Beat zoom', group: 'Motion', transform: (t, k) => ({ scale: 1 + 0.12 * k * Math.exp(-frac(t * 2) * 9) }) }),
  E({ id: 'drift', label: 'Drift', group: 'Motion', transform: (t, k) => ({ scale: 1 + 0.12 * k, x: Math.sin(t * 0.6) * 2 * k, y: Math.cos(t * 0.5) * 1.5 * k, rotation: Math.sin(t * 0.4) * 0.8 * k }) }),
  E({ id: 'wave', label: 'Wave warp', group: 'Glitch', draw: (c, d, r, W, H, t, k) => {
    const n = 28, h = H / n;
    for (let i = 0; i < n; i++) {
      c.save(); c.beginPath(); c.rect(0, i * h, W, h + 1); c.clip();
      d(c, r.x + Math.sin(t * 5 + i * 0.6) * W * 0.014 * k, r.y, r.w, r.h);
      c.restore();
    }
  } }),
  E({ id: 'tvStatic', label: 'TV static', group: 'Glitch', overlay: (c, W, H, t, k) => {
    const s = Math.floor(t * 30) * 19, px = Math.max(1.5, W / 270);
    specks(c, W, H, s, Math.round(2600 * k), px, 'rgba(255,255,255,0.5)');
    specks(c, W, H, s + 900, Math.round(2600 * k), px, 'rgba(0,0,0,0.5)');
  } }),
  E({ id: 'sparkle', label: 'Sparkle', group: 'Light', overlay: (c, W, H, t, k) => blend(c, 'screen', () => {
    for (let i = 0; i < 22; i++) {
      const ph = Math.sin((t * 1.4 + hash(i * 5.3)) * Math.PI * 2);
      if (ph <= 0) continue;
      const x = hash(i * 7.1) * W, y = hash(i * 3.3 + 2) * H, r = (W / 45) * (0.5 + hash(i + 9)) * ph * (0.5 + k);
      c.fillStyle = `rgba(255,248,214,${0.9 * ph})`;
      c.beginPath();
      c.moveTo(x, y - r * 2); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r * 2); c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r * 2);
      c.fill();
    }
  }) }),
  E({ id: 'confetti', label: 'Confetti', group: 'Light', overlay: (c, W, H, t, k) => {
    const n = Math.round(70 * (0.3 + k));
    for (let i = 0; i < n; i++) {
      const sp = 0.18 + hash(i * 2.9) * 0.25, y = frac(t * sp + hash(i * 1.7)) * (H + 60) - 30;
      const x = hash(i * 4.1) * W + Math.sin(t * 2 + i) * W * 0.02;
      c.save(); c.translate(x, y); c.rotate(t * (2 + hash(i) * 5) + i);
      c.fillStyle = `hsl(${Math.floor(hash(i * 6.7) * 360)},90%,60%)`;
      c.fillRect(-W / 120, -W / 60, W / 60, W / 30); c.restore();
    }
  } }),
  E({ id: 'snow', label: 'Snow', group: 'Light', overlay: (c, W, H, t, k) => {
    const n = Math.round(110 * (0.3 + k));
    c.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < n; i++) {
      const sp = 0.06 + hash(i * 2.3) * 0.1, y = frac(t * sp + hash(i * 1.3)) * H;
      c.beginPath(); c.arc(hash(i * 5.7) * W + Math.sin(t + i) * W * 0.015, y, (0.6 + hash(i + 4) * 1.8) * W / 360, 0, Math.PI * 2); c.fill();
    }
  } }),
  E({ id: 'hearts', label: 'Floating hearts', group: 'Light', overlay: (c, W, H, t, k) => {
    const n = Math.round(16 * (0.4 + k));
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const u = frac(t * (0.12 + hash(i * 3.1) * 0.1) + hash(i * 1.9));
      c.globalAlpha = Math.min(1, u * 4, (1 - u) * 2) * 0.9;
      c.fillStyle = hash(i * 8.3) > 0.5 ? '#FF4D8D' : '#FF8FB8';
      c.font = `${(W / 18) * (0.6 + hash(i + 2))}px sans-serif`;
      c.fillText('♥', hash(i * 6.1) * W + Math.sin(t * 2 + i) * W * 0.03, H * (1.05 - u * 1.1));
    }
  } }),
  E({ id: 'bokeh', label: 'Bokeh', group: 'Light', overlay: (c, W, H, t, k) => blend(c, 'screen', () => {
    for (let i = 0; i < 12; i++) {
      const x = hash(i * 3.7) * W + Math.sin(t * 0.4 + i) * W * 0.04, y = hash(i * 5.1 + 1) * H + Math.cos(t * 0.3 + i) * H * 0.03, r = W * (0.04 + hash(i + 7) * 0.08);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,${200 + Math.floor(hash(i) * 55)},${150 + Math.floor(hash(i + 3) * 100)},${0.5 * k})`); g.addColorStop(1, 'rgba(255,220,180,0)');
      c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }) }),
  E({ id: 'duotone', label: 'Duotone', group: 'Light', overlay: (c, W, H, _t, k) => blend(c, 'color', () => {
    const g = c.createLinearGradient(0, H, W, 0);
    g.addColorStop(0, `rgba(91,43,255,${k})`); g.addColorStop(1, `rgba(255,79,163,${k})`);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }) }),
  E({ id: 'beatFlash', label: 'Beat flash', group: 'Light', overlay: (c, W, H, t, k) => { c.fillStyle = `rgba(255,255,255,${0.55 * k * Math.exp(-frac(t * 2) * 10)})`; c.fillRect(0, 0, W, H); } }),
  E({ id: 'oldFilm', label: 'Old film', group: 'Texture', overlay: (c, W, H, t, k) => {
    blend(c, 'multiply', () => { c.fillStyle = `rgba(214,184,140,${0.45 * k})`; c.fillRect(0, 0, W, H); });
    const s = Math.floor(t * 18);
    specks(c, W, H, s * 23, Math.round(500 * k), Math.max(1, W / 540), 'rgba(255,255,255,0.22)');
    c.fillStyle = `rgba(255,255,255,${0.25 * k})`;
    for (let i = 0; i < 3; i++) if (hash(s + i * 7) > 0.6) c.fillRect(hash(s + i) * W, 0, Math.max(1, W / 540), H);
    c.fillStyle = `rgba(0,0,0,${hash(s) * 0.12 * k})`; c.fillRect(0, 0, W, H);
    vignette(c, W, H, 0.55 * k);
  } }),
  E({ id: 'nightVision', label: 'Night vision', group: 'Texture', overlay: (c, W, H, t, k) => {
    blend(c, 'multiply', () => { c.fillStyle = `rgba(70,255,100,${0.75 * k})`; c.fillRect(0, 0, W, H); });
    lines(c, W, H, Math.max(1, W / 320), `rgba(0,0,0,${0.22 * k})`);
    specks(c, W, H, Math.floor(t * 24) * 11, Math.round(400 * k), Math.max(1, W / 480), 'rgba(160,255,170,0.3)');
    vignette(c, W, H, 0.7 * k);
  } }),
  E({ id: 'camcorder', label: 'Camcorder', group: 'Texture', overlay: (c, W, H, t, k) => {
    const m = W * 0.06, f = Math.max(14, W * 0.04);
    c.font = `600 ${f}px "SF Mono", Menlo, Consolas, monospace`; c.textBaseline = 'top'; c.fillStyle = `rgba(255,255,255,${0.35 + 0.6 * k})`; c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = f * 0.3;
    c.textAlign = 'left'; c.fillText('PLAY ▶', m, m);
    c.textAlign = 'right'; c.fillText(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`, W - m, m);
    if (Math.floor(t * 1.4) % 2 === 0) { c.fillStyle = '#FF2A2A'; c.beginPath(); c.arc(m + f * 0.5, H - m - f * 0.5, f * 0.45, 0, Math.PI * 2); c.fill(); c.fillStyle = `rgba(255,255,255,${0.35 + 0.6 * k})`; c.textAlign = 'left'; c.fillText('REC', m + f * 1.3, H - m - f); }
    lines(c, W, H, Math.max(1, W / 360), `rgba(0,0,0,${0.12 * k})`);
  } }),
  E({ id: 'whiteBorder', label: 'White border', group: 'Frame', overlay: (c, W, H, _t, k) => {
    const s = Math.min(W, H) * 0.035 * (0.4 + k); c.fillStyle = '#fff';
    c.fillRect(0, 0, W, s); c.fillRect(0, H - s, W, s); c.fillRect(0, 0, s, H); c.fillRect(W - s, 0, s, H);
  } }),
  E({ id: 'roundedFrame', label: 'Rounded corners', group: 'Frame', overlay: (c, W, H, _t, k) => {
    const m = Math.min(W, H) * 0.02 * k, r = Math.min(W, H) * (0.03 + 0.07 * k);
    c.fillStyle = '#000'; c.beginPath(); c.rect(0, 0, W, H); c.roundRect(m, m, W - m * 2, H - m * 2, r); c.fill('evenodd');
  } }),
  E({ id: 'viewfinder', label: 'Viewfinder', group: 'Frame', overlay: (c, W, H, t, k) => {
    const m = Math.min(W, H) * 0.07, l = Math.min(W, H) * 0.06;
    c.strokeStyle = `rgba(255,255,255,${0.5 + 0.5 * k})`; c.lineWidth = Math.max(2, W / 360); c.lineCap = 'square';
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]] as const) {
      c.beginPath(); c.moveTo(x + sx * l, y); c.lineTo(x, y); c.lineTo(x, y + sy * l); c.stroke();
    }
    c.beginPath(); c.moveTo(W / 2 - l / 2, H / 2); c.lineTo(W / 2 + l / 2, H / 2); c.moveTo(W / 2, H / 2 - l / 2); c.lineTo(W / 2, H / 2 + l / 2); c.stroke();
    if (Math.floor(t * 1.4) % 2 === 0) { c.fillStyle = '#FF2A2A'; c.beginPath(); c.arc(m + l * 0.5, m + l * 1.6, l * 0.18, 0, Math.PI * 2); c.fill(); }
  } }),
];

export const TRENDING_EFFECTS = ['zoomBeat', 'rgbSplit', 'glitch', 'vhs', 'camcorder', 'sparkle', 'lightLeak', 'beatFlash', 'viewfinder', 'duotone', 'hearts', 'confetti'];
export const EFFECT_GROUPS: Group[] = ['Motion', 'Glitch', 'Light', 'Texture', 'Frame'];
const BY_ID = new Map(EFFECTS.map((e) => [e.id, e]));
export const effectLabel = (id: string) => BY_ID.get(id)?.label ?? id;

const resolve = (list: EffectInstance[]) => list.flatMap((i) => { const d = BY_ID.get(i.effectId); return d ? [{ d, k: Math.max(0, Math.min(1, i.intensity)) }] : []; });

/** Combined transform of every active motion effect. */
export function effectTransform(list: EffectInstance[], t: number, dur: number) {
  const out = { scale: 1, x: 0, y: 0, rotation: 0 };
  for (const { d, k } of resolve(list)) {
    const v = d.transform?.(t, k, dur);
    if (!v) continue;
    out.scale *= v.scale ?? 1; out.x += v.x ?? 0; out.y += v.y ?? 0; out.rotation += v.rotation ?? 0;
  }
  return out;
}

/** Draw the video through the first glitch-type effect, or plainly when there is none. */
export function drawVideoWithEffects(ctx: Ctx2D, draw: Draw, r: Rect, W: number, H: number, list: EffectInstance[], t: number) {
  const hit = resolve(list).find((e) => e.d.draw);
  if (hit) hit.d.draw!(ctx, draw, r, W, H, t, hit.k);
  else draw(ctx, r.x, r.y, r.w, r.h);
}

export function drawEffectOverlays(ctx: Ctx2D, W: number, H: number, list: EffectInstance[], t: number) {
  for (const { d, k } of resolve(list)) {
    if (!d.overlay) continue;
    ctx.save();
    d.overlay(ctx, W, H, t, k);
    ctx.restore();
  }
}

/** An effect clip on an adjustment track: re-draw the scene `src` through one effect at strength k. */
export function applyEffectPass(out: Ctx2D, src: OffscreenCanvas, W: number, H: number, effectId: string, k: number, lt: number, dur: number) {
  const inst: EffectInstance = { id: 'adj', effectId, intensity: k };
  const tf = effectTransform([inst], lt, dur);
  out.save();
  out.translate(W / 2 + (tf.x / 100) * W, H / 2 + (tf.y / 100) * H);
  out.rotate((tf.rotation * Math.PI) / 180);
  out.scale(tf.scale, tf.scale);
  out.translate(-W / 2, -H / 2);
  drawVideoWithEffects(out, (c, dx, dy, dw, dh) => c.drawImage(src, dx, dy, dw, dh), { x: 0, y: 0, w: W, h: H }, W, H, [inst], lt);
  out.restore();
  drawEffectOverlays(out, W, H, [inst], lt);
}
