import type { FeedPost, ScreenSpec } from '../types';
import type { Ctx2D } from './captions';
import type { Quad } from '../lib/screen';

type Img = ImageBitmap | HTMLImageElement;

/** The feed is painted at this size (a 9:19.5 phone screen) and then warped onto the pinned corners. */
export const FEED_W = 540;
export const FEED_H = 1170;
const BAR = 66;
const FONT = '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const dims = (img: Img) => ('naturalWidth' in img ? { w: img.naturalWidth, h: img.naturalHeight } : { w: img.width, h: img.height });

function wrap(ctx: Ctx2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const test = line + word;
      if (line && ctx.measureText(test.trimEnd()).width > maxW && word.trim()) { out.push(line.trimEnd()); line = word.trimStart(); } else line = test;
    }
    out.push(line.trimEnd());
  }
  return out;
}

/** `bare`: a photo post with no text is drawn as the photo alone (the photo already is a whole post, e.g. a screenshot of the ad). */
const NAMES = ['Kasun Perera', 'Nadeesha Fernando', 'Dilshan Jayasuriya', 'Ishara Wickramasinghe', 'Tharindu Silva', 'Sachini Rajapaksha'];
const AVATAR = ['#3B82F6', '#EC4899', '#F59E0B', '#10B981', '#8B5CF6', '#EF4444'];
const TAIL: FeedPost[] = [
  { id: 'tail1', text: 'Lost in the green hills 🌿', likes: 412, comments: 38, time: '2h', author: 'Dilshan Jayasuriya' },
  { id: 'tail2', text: 'Misty morning at the falls 💧', likes: 96, comments: 7, time: '5h', author: 'Sachini Rajapaksha' },
];
const authorOf = (p: FeedPost, i: number) => p.author?.trim() || NAMES[i % NAMES.length];

interface Card { top: number; height: number; lines: string[]; img?: { w: number; h: number; synth?: boolean }; bare?: boolean }

/** Scroll distance wanted before the ad, in screen heights: a short feed repeats its own posts so there is always a scroll to watch. */
const RUN_UP = 2.2;
const FILLER: FeedPost = { id: 'filler', text: 'Fresh pieces in store this week.', likes: 48, comments: 3, time: '5h' };

/** Stack the post cards from the top of the page, measuring their text. */
function layoutCards(ctx: Ctx2D, spec: ScreenSpec, images: Map<string, Img> | undefined): { posts: FeedPost[]; cards: Card[]; total: number; adIndex: number } {
  ctx.font = `400 25px ${FONT}`;
  let y = 0;
  const fillers = spec.feed.posts.slice(0, -1);
  const ad = spec.feed.posts[spec.feed.posts.length - 1];
  const posts: FeedPost[] = [];
  const cards: Card[] = [];
  const add = (p: FeedPost) => {
    let lines = wrap(ctx, p.text, FEED_W - 40);
    const pic = p.assetId ? images?.get(p.assetId) : undefined;
    let img: Card['img'];
    if (pic) { const d = dims(pic); if (d.w && d.h) img = { w: FEED_W, h: Math.min(FEED_H * 0.78, FEED_W * (d.h / d.w)) }; }
    if (!pic) {
      img = { w: FEED_W, h: 440, synth: true };
      if (lines.length > 1) lines = [`${lines[0].replace(/\s+\S*$/, '')}… See more`];
    }
    const bare = !!img && !img.synth && !p.text.trim();
    const height = bare ? img!.h + 12 : 84 + (lines.length && lines.some(Boolean) ? lines.length * 33 + 16 : 4) + (img ? img.h : 0) + 70 + 12;
    cards.push({ top: y, height, lines, img, bare });
    posts.push(p);
    y += height;
  };
  const pool = fillers.length ? fillers : [FILLER];
  for (let i = 0; i < pool.length || y < FEED_H * RUN_UP; i++) { if (i > 40) break; add(pool[i % pool.length]); }
  if (ad) add(ad);
  const adIndex = posts.length - 1;
  for (const t of TAIL) add(t); // more feed under the ad, so the screen is never empty once it has stopped
  return { posts, cards, total: y, adIndex };
}

function iconLike(ctx: Ctx2D, x: number, y: number, s: number) {
  ctx.strokeRect(x, y + s * 0.45, s * 0.22, s * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + s * 0.3, y + s * 0.48); ctx.lineTo(x + s * 0.5, y + s * 0.1); ctx.quadraticCurveTo(x + s * 0.72, y, x + s * 0.68, y + s * 0.3);
  ctx.lineTo(x + s * 0.66, y + s * 0.42); ctx.lineTo(x + s * 0.9, y + s * 0.42); ctx.quadraticCurveTo(x + s, y + s * 0.45, x + s * 0.97, y + s * 0.56);
  ctx.lineTo(x + s * 0.9, y + s * 0.85); ctx.quadraticCurveTo(x + s * 0.86, y + s * 0.95, x + s * 0.78, y + s * 0.95); ctx.lineTo(x + s * 0.3, y + s * 0.95);
  ctx.closePath(); ctx.stroke();
}
function iconComment(ctx: Ctx2D, x: number, y: number, s: number) {
  ctx.beginPath(); ctx.roundRect(x, y + s * 0.05, s, s * 0.75, s * 0.3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + s * 0.22, y + s * 0.8); ctx.lineTo(x + s * 0.16, y + s); ctx.lineTo(x + s * 0.42, y + s * 0.8); ctx.stroke();
}
function iconShare(ctx: Ctx2D, x: number, y: number, s: number) {
  ctx.beginPath(); ctx.moveTo(x, y + s * 0.9); ctx.quadraticCurveTo(x + s * 0.1, y + s * 0.38, x + s * 0.62, y + s * 0.38); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + s * 0.6, y + s * 0.05); ctx.lineTo(x + s, y + s * 0.38); ctx.lineTo(x + s * 0.6, y + s * 0.7); ctx.closePath(); ctx.stroke();
}

/** Small deterministic random generator so a scene looks the same every frame. */
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

/** Stock photos (public/feed) used for posts that have none; the painted scenes below are only the fallback while these load. */
const STOCK_URLS = ['/feed/p1015.jpg', '/feed/p1018.jpg', '/feed/p1043.jpg', '/feed/p1039.jpg'];
const stock: (HTMLImageElement | null)[] = STOCK_URLS.map(() => null);
let stockLoad: Promise<void> | null = null;
/** Resolves once the stock photos are decoded (never rejects: a missing file keeps the painted scene). */
export function feedPhotosReady(): Promise<void> {
  if (typeof Image === 'undefined') return Promise.resolve();
  stockLoad ??= Promise.all(STOCK_URLS.map((url, k) => new Promise<void>((res) => {
    const im = new Image();
    im.onload = () => { stock[k] = im; res(); };
    im.onerror = () => res();
    im.src = url;
  }))).then(() => undefined);
  return stockLoad;
}
if (typeof Image !== 'undefined') void feedPhotosReady();

/** A painted photo-like scene for a post without a photo: sunset hills, a mountain lake, a night city or a beach. */
function drawScene(ctx: Ctx2D, y: number, h: number, i: number) {
  const photo = stock[i % stock.length];
  if (photo) {
    const sc = Math.max(FEED_W / photo.naturalWidth, h / photo.naturalHeight), sw = FEED_W / sc, sh = h / sc;
    ctx.drawImage(photo, (photo.naturalWidth - sw) / 2, (photo.naturalHeight - sh) / 2, sw, sh, 0, y, FEED_W, h);
    return;
  }
  const W = FEED_W, rnd = rng(i * 97 + 13), kind = i % 4;
  const sky = (stops: [number, string][]) => { const g = ctx.createLinearGradient(0, y, 0, y + h); stops.forEach(([o, c]) => g.addColorStop(o, c)); ctx.fillStyle = g; ctx.fillRect(0, y, W, h); };
  const glow = (cx: number, cy: number, r: number, c: string) => { const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, c); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, y, W, h); };
  const ridge = (base: number, amp: number, color: string, phase: number) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, y + h);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, y + h * base - Math.sin(x / 90 + phase) * amp - Math.sin(x / 37 + phase * 2) * amp * 0.3);
    ctx.lineTo(W, y + h); ctx.closePath(); ctx.fill();
  };
  ctx.save(); ctx.beginPath(); ctx.rect(0, y, W, h); ctx.clip();
  if (kind === 0) {
    sky([[0, '#312e81'], [0.5, '#f97316'], [0.8, '#fde68a'], [1, '#fcd34d']]);
    ctx.fillStyle = '#FEF3C7'; ctx.beginPath(); ctx.arc(W * 0.62, y + h * 0.55, 54, 0, Math.PI * 2); ctx.fill(); glow(W * 0.62, y + h * 0.55, 260, 'rgba(255,200,120,0.65)');
    ridge(0.72, 26, '#7c2d12', 1); ridge(0.82, 22, '#4c1d3a', 3); ridge(0.92, 16, '#1e1b2e', 5);
  } else if (kind === 1) {
    sky([[0, '#60a5fa'], [0.6, '#dbeafe'], [0.6, '#38bdf8'], [1, '#0c4a6e']]);
    ctx.fillStyle = '#64748b'; ctx.beginPath(); ctx.moveTo(0, y + h * 0.6); ctx.lineTo(W * 0.22, y + h * 0.22); ctx.lineTo(W * 0.4, y + h * 0.5); ctx.lineTo(W * 0.62, y + h * 0.12); ctx.lineTo(W * 0.85, y + h * 0.5); ctx.lineTo(W, y + h * 0.34); ctx.lineTo(W, y + h * 0.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#F8FAFC'; for (const [px, py] of [[0.22, 0.22], [0.62, 0.12]]) { ctx.beginPath(); ctx.moveTo(W * px, y + h * py); ctx.lineTo(W * (px - 0.06), y + h * (py + 0.13)); ctx.lineTo(W * (px + 0.06), y + h * (py + 0.13)); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; for (let k = 0; k < 6; k++) ctx.fillRect(W * rnd() * 0.7, y + h * (0.66 + k * 0.05), W * (0.2 + rnd() * 0.3), 3);
    ctx.fillStyle = '#14532d'; for (let k = 0; k < 14; k++) { const px = k * 40 + rnd() * 20, ph = 60 + rnd() * 60; ctx.beginPath(); ctx.moveTo(px, y + h); ctx.lineTo(px + 22, y + h - ph); ctx.lineTo(px + 44, y + h); ctx.closePath(); ctx.fill(); }
  } else if (kind === 2) {
    sky([[0, '#0f172a'], [0.6, '#6d28d9'], [1, '#f472b6']]);
    ctx.fillStyle = '#FFFFFF'; for (let k = 0; k < 40; k++) { ctx.globalAlpha = 0.3 + rnd() * 0.7; ctx.fillRect(rnd() * W, y + rnd() * h * 0.5, 2, 2); } ctx.globalAlpha = 1;
    ctx.fillStyle = '#FDE68A'; ctx.beginPath(); ctx.arc(W * 0.78, y + h * 0.2, 28, 0, Math.PI * 2); ctx.fill();
    for (let x = 0; x < W; ) { const bw = 34 + rnd() * 40, bh = h * (0.25 + rnd() * 0.4); ctx.fillStyle = '#0b1020'; ctx.fillRect(x, y + h - bh, bw, bh); ctx.fillStyle = '#FACC15'; for (let wy = y + h - bh + 12; wy < y + h - 14; wy += 20) for (let wx = x + 7; wx < x + bw - 8; wx += 14) if (rnd() > 0.45) ctx.fillRect(wx, wy, 5, 8); x += bw + 2; }
  } else {
    sky([[0, '#38bdf8'], [0.45, '#fef3c7'], [0.5, '#0ea5e9'], [0.72, '#0369a1'], [0.72, '#fcd34d'], [1, '#f59e0b']]);
    ctx.fillStyle = '#FFFBEB'; ctx.beginPath(); ctx.arc(W * 0.2, y + h * 0.18, 40, 0, Math.PI * 2); ctx.fill(); glow(W * 0.2, y + h * 0.18, 200, 'rgba(255,255,255,0.55)');
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; for (let k = 0; k < 7; k++) ctx.fillRect(rnd() * W, y + h * (0.52 + k * 0.03), 40 + rnd() * 80, 3);
    ctx.strokeStyle = '#78350f'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(W * 0.78, y + h); ctx.quadraticCurveTo(W * 0.72, y + h * 0.6, W * 0.8, y + h * 0.36); ctx.stroke();
    ctx.strokeStyle = '#15803d'; ctx.lineWidth = 8; for (const a of [-2.6, -2.0, -1.4, -0.8, -0.2]) { ctx.beginPath(); ctx.moveTo(W * 0.8, y + h * 0.36); ctx.quadraticCurveTo(W * 0.8 + Math.cos(a) * 60, y + h * 0.36 + Math.sin(a) * 50, W * 0.8 + Math.cos(a) * 110, y + h * 0.36 + Math.sin(a) * 20 + 40); ctx.stroke(); }
  }
  ctx.restore();
}

const initials = (s: string) => (s.trim()[0] ?? 'P').toUpperCase();

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

/**
 * Paint the generated feed: a top bar, then post cards. `progress` 0..1 scrolls from the first card at the top to the last card centred on the screen.
 * The look is generic (no brand marks): a page avatar and name, the post, its photo, and a like / comment / share row.
 */
export function paintFeed(ctx: Ctx2D, spec: ScreenSpec, images: Map<string, Img> | undefined, progress: number) {
  const { posts, cards, adIndex } = layoutCards(ctx, spec, images);
  const body = FEED_H - BAR;
  const last = cards[adIndex];
  const maxScroll = last ? Math.max(0, last.top + last.height / 2 - body / 2) : 0; // the ad ends up centred on the screen
  const scroll = maxScroll * progress;
  const radius = (spec.corner / 100) * FEED_W;

  ctx.save();
  roundRect(ctx, 0, 0, FEED_W, FEED_H, radius);
  ctx.clip();
  ctx.fillStyle = '#18191A';
  ctx.fillRect(0, 0, FEED_W, FEED_H);

  // Cards scroll under the top bar.
  ctx.save();
  ctx.beginPath(); ctx.rect(0, BAR, FEED_W, body); ctx.clip();
  ctx.translate(0, BAR - scroll);
  posts.forEach((p, i) => {
    const c = cards[i];
    if (c.top + c.height < scroll - 4 || c.top > scroll + body + 4) return;
    const top = c.top;
    ctx.fillStyle = '#242526';
    ctx.fillRect(0, top, FEED_W, c.height - 12);
    if (c.bare && c.img) { const pic = images?.get(p.assetId!); if (pic) ctx.drawImage(pic, 0, top, c.img.w, c.img.h); return; }
    // Header: avatar, page name, time.
    const av = spec.feed.avatarAssetId ? images?.get(spec.feed.avatarAssetId) : undefined;
    ctx.save();
    ctx.beginPath(); ctx.arc(46, top + 42, 24, 0, Math.PI * 2); ctx.clip();
    if (av) ctx.drawImage(av, 22, top + 18, 48, 48);
    else { ctx.fillStyle = AVATAR[i % AVATAR.length]; ctx.fillRect(22, top + 18, 48, 48); ctx.fillStyle = '#FFFFFF'; ctx.font = `700 26px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(initials(authorOf(p, i)), 46, top + 43); }
    ctx.restore();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#E4E6EB'; ctx.font = `700 24px ${FONT}`;
    const name = authorOf(p, i);
    ctx.fillText(name, 84, top + 38);
    ctx.fillStyle = '#B0B3B8'; ctx.font = `400 20px ${FONT}`;
    ctx.fillText(`${p.time} · 🌐`, 84, top + 64);
    if (i < posts.length - 1) {
      ctx.font = `700 24px ${FONT}`; const nw = ctx.measureText(name).width;
      ctx.fillStyle = '#B0B3B8'; ctx.fillText('·', 84 + nw + 8, top + 38);
      ctx.fillStyle = '#2D88FF'; ctx.fillText('Follow', 84 + nw + 26, top + 38);
    }
    // Post menu and close.
    ctx.fillStyle = '#B0B3B8';
    for (const dx of [0, 9, 18]) { ctx.beginPath(); ctx.arc(FEED_W - 88 + dx, top + 42, 2.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = '#B0B3B8'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(FEED_W - 48, top + 33); ctx.lineTo(FEED_W - 30, top + 51); ctx.moveTo(FEED_W - 30, top + 33); ctx.lineTo(FEED_W - 48, top + 51); ctx.stroke();
    // Text.
    let y = top + 84;
    ctx.fillStyle = '#E4E6EB'; ctx.font = `400 25px ${FONT}`;
    if (c.lines.some(Boolean)) { for (const ln of c.lines) { ctx.fillText(ln, 20, y + 24); y += 33; } y += 16; } else y += 4;
    // Photo.
    const pic = p.assetId ? images?.get(p.assetId) : undefined;
    if (pic && c.img) { ctx.drawImage(pic, 0, y, c.img.w, c.img.h); y += c.img.h; }
    else if (c.img?.synth) { drawScene(ctx, y, c.img.h, i); y += c.img.h; }
    // Like / comment / share counts with outline icons, reactions on the right.
    const ry = y + 14;
    ctx.strokeStyle = '#B0B3B8'; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.fillStyle = '#B0B3B8'; ctx.font = `500 23px ${FONT}`; ctx.textBaseline = 'middle';
    const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}K` : String(n));
    iconLike(ctx, 22, ry + 6, 30); ctx.fillText(compact(p.likes), 60, ry + 22);
    iconComment(ctx, 160, ry + 6, 30); ctx.fillText(compact(p.comments), 198, ry + 22);
    iconShare(ctx, 290, ry + 6, 30); ctx.fillText(String(Math.max(1, Math.round(p.comments / 3))), 328, ry + 22);
    // Reactions: a blue like badge and a red love badge, overlapped.
    const bx = FEED_W - 52;
    ctx.fillStyle = '#1877F2'; ctx.beginPath(); ctx.arc(bx, ry + 22, 14, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#242526'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.save(); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.6; iconLike(ctx, bx - 7, ry + 14, 14); ctx.restore();
    ctx.fillStyle = '#F33E58'; ctx.beginPath(); ctx.arc(bx + 22, ry + 22, 14, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#242526'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.moveTo(bx + 22, ry + 30); ctx.bezierCurveTo(bx + 11, ry + 22, bx + 14, ry + 13, bx + 22, ry + 19); ctx.bezierCurveTo(bx + 30, ry + 13, bx + 33, ry + 22, bx + 22, ry + 30); ctx.fill();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  });
  ctx.restore();

  // Phone status bar: recording pill with the time, signal, network and battery.
  ctx.fillStyle = '#18191A';
  ctx.fillRect(0, 0, FEED_W, BAR);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#F5222D'; roundRect(ctx, 18, 15, 76, 36, 18); ctx.fill();
  ctx.fillStyle = '#FFFFFF'; ctx.font = `700 24px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('21:16', 56, 34);
  ctx.fillStyle = '#E4E6EB';
  [10, 16, 22, 28].forEach((h, k) => ctx.fillRect(FEED_W - 142 + k * 9, 46 - h, 6, h));
  ctx.textAlign = 'left'; ctx.font = `700 24px ${FONT}`; ctx.fillText('4G', FEED_W - 98, 34);
  ctx.strokeStyle = '#E4E6EB'; ctx.lineWidth = 2; roundRect(ctx, FEED_W - 62, 22, 44, 22, 6); ctx.stroke();
  ctx.fillRect(FEED_W - 59, 25, 30, 16);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#3E4042'; ctx.fillRect(0, BAR - 1, FEED_W, 1);
  ctx.restore();
}

/** Where (x, y, in the unit square) a point of the screen lands under the projective map of the unit square onto `q`. */
function homography(q: Quad) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = Math.abs(den) < 1e-9 ? 0 : (sx * dy2 - dx2 * sy) / den;
  const h = Math.abs(den) < 1e-9 ? 0 : (dx1 * sy - sx * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0;
  const d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
  return (u: number, v: number): [number, number] => {
    const w = g * u + h * v + 1;
    return [(a * u + b * v + c) / w, (d * u + e * v + f) / w];
  };
}

const COLS = 8, ROWS = 14;

/** Draw `src` onto the quad with perspective: the quad is cut into small cells and each is drawn as two affine triangles. */
export function warpToQuad(ctx: Ctx2D, src: CanvasImageSource, sw: number, sh: number, quad: Quad) {
  const map = homography(quad);
  const grid: [number, number][][] = [];
  for (let r = 0; r <= ROWS; r++) { const row: [number, number][] = []; for (let c = 0; c <= COLS; c++) row.push(map(c / COLS, r / ROWS)); grid.push(row); }
  const tri = (s0: number[], s1: number[], s2: number[], d0: [number, number], d1: [number, number], d2: [number, number]) => {
    const ax = s1[0] - s0[0], ay = s1[1] - s0[1], bx = s2[0] - s0[0], by = s2[1] - s0[1];
    const det = ax * by - bx * ay;
    if (Math.abs(det) < 1e-9) return;
    const ux = d1[0] - d0[0], uy = d1[1] - d0[1], vx = d2[0] - d0[0], vy = d2[1] - d0[1];
    const a = (ux * by - vx * ay) / det, c = (vx * ax - ux * bx) / det;
    const b = (uy * by - vy * ay) / det, d = (vy * ax - uy * bx) / det;
    const e = d0[0] - a * s0[0] - c * s0[1], f = d0[1] - b * s0[0] - d * s0[1];
    // Grow the triangle a little so neighbours overlap and no hairline seams show.
    const mx = (d0[0] + d1[0] + d2[0]) / 3, my = (d0[1] + d1[1] + d2[1]) / 3;
    const grow = (p: [number, number]): [number, number] => { const l = Math.hypot(p[0] - mx, p[1] - my) || 1; return [p[0] + ((p[0] - mx) / l) * 0.7, p[1] + ((p[1] - my) / l) * 0.7]; };
    const g0 = grow(d0), g1 = grow(d1), g2 = grow(d2);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(g0[0], g0[1]); ctx.lineTo(g1[0], g1[1]); ctx.lineTo(g2[0], g2[1]); ctx.closePath(); ctx.clip();
    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(src, 0, 0);
    ctx.restore();
  };
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const s = (cc: number, rr: number) => [(cc / COLS) * sw, (rr / ROWS) * sh];
      const p00 = grid[r][c], p10 = grid[r][c + 1], p01 = grid[r + 1][c], p11 = grid[r + 1][c + 1];
      tri(s(c, r), s(c + 1, r), s(c, r + 1), p00, p10, p01);
      tri(s(c + 1, r), s(c + 1, r + 1), s(c, r + 1), p10, p11, p01);
    }
  }
}

let page: HTMLCanvasElement | OffscreenCanvas | null = null;
/** A reusable canvas the feed is painted on before it is warped. */
export function feedCanvas(): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: Ctx2D } | null {
  if (!page) page = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(FEED_W, FEED_H) : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: FEED_W, height: FEED_H }) : null;
  const ctx = page?.getContext('2d') as Ctx2D | null | undefined;
  if (!page || !ctx) return null;
  ctx.clearRect(0, 0, FEED_W, FEED_H);
  return { canvas: page, ctx };
}
