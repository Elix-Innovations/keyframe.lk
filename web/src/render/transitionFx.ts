import type { Ctx2D } from './captions';

/** Light-based transition overlays, painted over the frame. `q` is 1 at the cut and 0 once settled; `sweep` runs 0..1 in time order. */
export type LightKind = 'fire' | 'lensFlare' | 'lightLeak' | 'anamorphic' | 'sparkle' | 'lightning' | 'prism' | 'sunrise';

const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export function drawLight(ctx: Ctx2D, W: number, H: number, kind: LightKind, q: number, sweep: number) {
  if (q <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const R = Math.hypot(W, H);
  switch (kind) {
    case 'fire': {
      // Flames licking up from the bottom edge, flickering; heat tints the whole frame.
      const g = ctx.createLinearGradient(0, H, 0, H * (1 - 0.9 * q));
      g.addColorStop(0, `rgba(255,230,120,${0.95 * q})`);
      g.addColorStop(0.35, `rgba(255,110,20,${0.8 * q})`);
      g.addColorStop(1, 'rgba(120,10,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, H);
      const n = 14, f = Math.floor(sweep * 40);
      for (let i = 0; i <= n; i++) {
        const x = (i / n) * W;
        const h = H * q * (0.35 + 0.6 * hash(i * 3.1 + f)) * (0.6 + 0.4 * Math.sin(i * 1.7 + sweep * 30));
        ctx.lineTo(x, H - h);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(255,90,10,${0.25 * q})`;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'lensFlare': {
      // A bright orb crosses the frame; ghost discs trail along the line through the centre.
      const x = W * (-0.1 + 1.2 * sweep), y = H * (0.3 + 0.1 * Math.sin(sweep * 3));
      const g = ctx.createRadialGradient(x, y, 0, x, y, R * 0.28 * (0.6 + q));
      g.addColorStop(0, `rgba(255,255,240,${q})`);
      g.addColorStop(0.2, `rgba(255,210,120,${0.7 * q})`);
      g.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const cols = ['255,120,60', '120,200,255', '255,230,120', '170,120,255'];
      for (let i = 0; i < 4; i++) {
        const k = 0.35 + i * 0.45;
        const gx = x + (W / 2 - x) * k, gy = y + (H / 2 - y) * k, r = R * (0.03 + 0.02 * i);
        const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
        gg.addColorStop(0, `rgba(${cols[i]},${0.55 * q})`); gg.addColorStop(1, `rgba(${cols[i]},0)`);
        ctx.fillStyle = gg; ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
      }
      const sg = ctx.createLinearGradient(0, y, W, y);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(Math.min(0.99, Math.max(0.01, x / W)), `rgba(255,240,200,${0.6 * q})`); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg; ctx.fillRect(0, y - H * 0.004 * (1 + q * 2), W, H * 0.008 * (1 + q * 2));
      break;
    }
    case 'lightLeak': {
      const x = W * (1.1 - 1.3 * sweep);
      const g = ctx.createRadialGradient(x, H * 0.4, 0, x, H * 0.4, R * 0.7);
      g.addColorStop(0, `rgba(255,170,60,${0.9 * q})`);
      g.addColorStop(0.5, `rgba(255,60,90,${0.5 * q})`);
      g.addColorStop(1, 'rgba(255,60,90,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'anamorphic': {
      const y = H / 2, h = H * 0.05 * (0.5 + q);
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, 'rgba(80,140,255,0)'); g.addColorStop(0.5, `rgba(150,200,255,${0.95 * q})`); g.addColorStop(1, 'rgba(80,140,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, y - h / 2, W, h);
      const c = ctx.createRadialGradient(W / 2, y, 0, W / 2, y, R * 0.2);
      c.addColorStop(0, `rgba(255,255,255,${q})`); c.addColorStop(1, 'rgba(120,170,255,0)');
      ctx.fillStyle = c; ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'sparkle': {
      const f = Math.floor(sweep * 24);
      for (let i = 0; i < 22; i++) {
        const x = hash(i + 1) * W, y = hash(i + 50) * H;
        const tw = Math.max(0, Math.sin((sweep * 10 + hash(i + 99) * 6) * Math.PI)) * q;
        const r = (W * 0.025 + hash(i + f) * W * 0.02) * tw;
        if (r < 1) continue;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(255,255,255,${tw})`); g.addColorStop(1, 'rgba(255,240,180,0)');
        ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.fillStyle = `rgba(255,255,255,${tw * 0.8})`;
        ctx.fillRect(x - r * 1.6, y - 0.5, r * 3.2, 1); ctx.fillRect(x - 0.5, y - r * 1.6, 1, r * 3.2);
      }
      break;
    }
    case 'lightning': {
      const f = Math.floor(sweep * 18);
      if (hash(f + 7) > 0.35 + 0.4 * (1 - q)) { ctx.fillStyle = `rgba(210,225,255,${0.7 * q})`; ctx.fillRect(0, 0, W, H); }
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = `rgba(240,245,255,${q})`; ctx.shadowColor = 'rgba(150,180,255,1)'; ctx.shadowBlur = W * 0.02; ctx.lineWidth = Math.max(1.5, W * 0.004);
      ctx.beginPath();
      let x = W * (0.25 + 0.5 * hash(f + 3)), y = 0;
      ctx.moveTo(x, y);
      while (y < H) { y += H / 9; x += (hash(f * 13 + y) - 0.5) * W * 0.12; ctx.lineTo(x, y); }
      ctx.stroke();
      break;
    }
    case 'prism': {
      const bands = ['255,0,80', '255,170,0', '60,255,120', '0,160,255', '170,60,255'];
      const w = W * 0.22;
      bands.forEach((c, i) => {
        const x = W * (1.15 - 1.4 * sweep) + (i - 2) * w * 0.5;
        const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
        g.addColorStop(0, `rgba(${c},0)`); g.addColorStop(0.5, `rgba(${c},${0.45 * q})`); g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g; ctx.fillRect(x - w, 0, w * 2, H);
      });
      break;
    }
    case 'sunrise': {
      const g = ctx.createRadialGradient(W / 2, H * (1.1 - 0.5 * (1 - q)), 0, W / 2, H, R * 0.8);
      g.addColorStop(0, `rgba(255,240,170,${q})`); g.addColorStop(0.4, `rgba(255,150,60,${0.6 * q})`); g.addColorStop(1, 'rgba(255,80,40,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      break;
    }
  }
  ctx.restore();
}
