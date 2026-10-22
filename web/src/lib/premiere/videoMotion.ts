import type { AnimKey } from '../../types';

export interface VideoRun { inKeys?: AnimKey[]; outKeys?: AnimKey[]; color: string; glow: string | null; start: number }

interface Frame { t: number; present: boolean; cx: number; cy: number; w: number; h: number; lum: number; count: number; rgb: [number, number, number]; glow: [number, number, number] | null }

const hex = (c: [number, number, number]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;
const FRAME_W = 1920, FRAME_H = 1080, FONT_PX = 64, W = 320, FPS = 15, LUMA = 190;

/** Measure the bright text blob in one frame: where it is, how big, how bright, its colour, and the colour of its glow. */
function measure(img: ImageData, t: number): Frame {
  const { data, width, height } = img;
  let n = 0, minX = width, maxX = 0, minY = height, maxY = 0, sl = 0, sx = 0, sy = 0, r = 0, g = 0, b = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (l <= LUMA) continue;
    n++; sl += l; sx += x; sy += y; r += data[i]; g += data[i + 1]; b += data[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const present = n > 0.0006 * width * height;
  let glow: Frame['glow'] = null;
  if (present) {
    const px = (maxX - minX) * 0.15 + 4, py = (maxY - minY) * 0.4 + 4;
    let gn = 0, gr = 0, gg = 0, gb = 0;
    for (let y = Math.max(0, minY - py | 0); y < Math.min(height, maxY + py); y++) for (let x = Math.max(0, minX - px | 0); x < Math.min(width, maxX + px); x++) {
      const i = (y * width + x) * 4, R = data[i], G = data[i + 1], B = data[i + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B), l = 0.299 * R + 0.587 * G + 0.114 * B;
      if (l > 70 && l <= LUMA && mx > 0 && (mx - mn) / mx > 0.45) { gn++; gr += R; gg += G; gb += B; }
    }
    if (gn > 25) glow = [gr / gn, gg / gn, gb / gn];
  }
  return {
    t, present, cx: n ? sx / n : 0, cy: n ? sy / n : 0, w: maxX - minX, h: maxY - minY, lum: n ? sl / n : 0, count: n,
    rgb: n ? [r / n, g / n, b / n] : [255, 255, 255], glow,
  };
}

/** Keep at most `max` keys, always the first and last. */
const thin = (keys: AnimKey[], max = 14): AnimKey[] => {
  if (keys.length <= max) return keys;
  const step = (keys.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => keys[Math.round(i * step)]);
};

/**
 * Approximate a text animation from a preview video: finds each stretch where bright text is on screen, then reads its
 * entrance and exit from how the text's position, size, brightness and sharpness change until it settles.
 */
export async function analyzeVideo(file: Blob, onProgress?: (f: number) => void): Promise<VideoRun[]> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true; video.preload = 'auto'; video.src = url;
    await new Promise<void>((ok, bad) => { video.onloadedmetadata = () => ok(); video.onerror = () => bad(new Error('The video could not be read.')); });
    const H = Math.round((W * video.videoHeight) / video.videoWidth) || 180;
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const frames: Frame[] = [];
    const total = Math.min(video.duration, 120);
    for (let t = 0; t < total; t += 1 / FPS) {
      await new Promise<void>((ok) => { video.onseeked = () => ok(); video.currentTime = t; });
      ctx.drawImage(video, 0, 0, W, H);
      frames.push(measure(ctx.getImageData(0, 0, W, H), t));
      if (frames.length % 8 === 0) onProgress?.(t / total);
    }
    // Runs of frames with text on screen, bridging single-frame dropouts.
    const runs: Frame[][] = [];
    let cur: Frame[] = [], miss = 0;
    for (const f of frames) {
      if (f.present) { cur.push(f); miss = 0; } else if (cur.length && ++miss > 2) { runs.push(cur); cur = []; miss = 0; }
    }
    if (cur.length) runs.push(cur);
    const out: VideoRun[] = [];
    for (const run of runs.filter((r) => r.length >= 5).slice(0, 40)) {
      const mid = run.slice(Math.floor(run.length / 3), Math.ceil((run.length * 2) / 3) + 1);
      const rest = { cx: median(mid.map((f) => f.cx)), cy: median(mid.map((f) => f.cy)), h: median(mid.map((f) => f.h)) || 1, lum: median(mid.map((f) => f.lum)) || 1, count: median(mid.map((f) => f.count)) || 1 };
      const settled = (f: Frame) => Math.abs(f.cx - rest.cx) < 0.02 * W && Math.abs(f.cy - rest.cy) < 0.02 * H && Math.abs(f.h / rest.h - 1) < 0.06 && f.lum / rest.lum > 0.92 && f.count / rest.count > 0.85;
      let a = run.findIndex(settled), b = run.length - 1 - [...run].reverse().findIndex(settled);
      if (a < 0) a = 0;
      if (b < 0) b = run.length - 1;
      const key = (f: Frame, tt: number, ease: AnimKey['ease']): AnimKey => ({
        t: Number(tt.toFixed(3)), ease, sx: 1, sy: 1, rot: 0,
        alpha: Math.min(1, f.lum / rest.lum), dx: ((f.cx - rest.cx) / W) * (FRAME_W / FONT_PX), dy: ((f.cy - rest.cy) / H) * (FRAME_H / FONT_PX),
        scale: Math.min(5, Math.max(0.05, f.h / rest.h)), blur: 0.3 * (1 - Math.min(1, f.count / rest.count)),
      });
      const inFrames = run.slice(0, a + 1), outFrames = run.slice(b);
      const t0 = run[0].t, t1 = run[run.length - 1].t;
      const color = mid.map((f) => f.rgb), glows = mid.map((f) => f.glow).filter((g): g is [number, number, number] => !!g);
      const avg = (c: [number, number, number][]): [number, number, number] => [0, 1, 2].map((i) => median(c.map((x) => x[i]))) as [number, number, number];
      out.push({
        start: t0, color: hex(avg(color)), glow: glows.length > mid.length / 3 ? hex(avg(glows)) : null,
        inKeys: inFrames.length >= 2 ? thin(inFrames.map((f) => key(f, f.t - t0, 'easeOut'))) : undefined,
        // Exits are stored entrance-shaped (mirrored in time): see CreativeLayout.customOut.
        outKeys: outFrames.length >= 2 ? thin(outFrames.map((f) => key(f, t1 - f.t, 'easeIn')).reverse()) : undefined,
      });
    }
    return out;
  } finally { URL.revokeObjectURL(url); }
}
