import { useEffect, useState } from 'react';
import { getBlob } from './db';

export interface Filmstrip { frames: string[]; step: number; aspect: number }

const H = 96;
const cache = new Map<string, Promise<Filmstrip | null>>();

const seek = (v: HTMLVideoElement, t: number) => new Promise<void>((res) => {
  const done = () => { v.removeEventListener('seeked', done); res(); };
  v.addEventListener('seeked', done);
  v.currentTime = t;
});

/** Frames taken evenly across a video asset (one per `step` seconds, about 8 per video), like CapCut's clip strip. Cached per asset. */
function build(assetId: string, duration: number): Promise<Filmstrip | null> {
  return getBlob(assetId).then(async (blob) => {
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.src = url;
    try {
      await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('load')); });
      const dur = v.duration && Number.isFinite(v.duration) ? v.duration : duration;
      const step = Math.min(15, Math.max(2, dur / 8));
      const aspect = (v.videoWidth || 9) / (v.videoHeight || 16);
      const c = document.createElement('canvas');
      c.height = H; c.width = Math.max(8, Math.round(H * aspect));
      const ctx = c.getContext('2d')!;
      const frames: string[] = [];
      for (let t = 0; t < dur; t += step) {
        await seek(v, Math.min(t + step / 2, Math.max(0, dur - 0.05)));
        ctx.drawImage(v, 0, 0, c.width, c.height);
        frames.push(c.toDataURL('image/jpeg', 0.7));
      }
      return frames.length ? { frames, step, aspect } : null;
    } finally {
      URL.revokeObjectURL(url);
      v.removeAttribute('src'); v.load();
    }
  }).catch(() => null);
}

export function useFilmstrip(assetId: string | undefined, duration: number): Filmstrip | null {
  const [fs, setFs] = useState<Filmstrip | null>(null);
  useEffect(() => {
    let live = true;
    setFs(null);
    if (assetId) {
      let p = cache.get(assetId);
      if (!p) { p = build(assetId, duration); cache.set(assetId, p); }
      void p.then((f) => { if (live) setFs(f); });
    }
    return () => { live = false; };
  }, [assetId, duration]);
  return fs;
}
