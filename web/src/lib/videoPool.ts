import { getBlob, NeedsPermissionError } from './db';

/**
 * One hidden, muted <video> per source file and video track (two tracks can show the same file at different moments).
 * Sound comes from the audio clips, not from these elements.
 */
interface Entry { el: HTMLVideoElement; url: string; assetId: string; slot: number }
const pool = new Map<string, Entry>();
const pending = new Map<string, Promise<HTMLVideoElement | null>>();
/** Bumped whenever a key is dropped or replaced, so an in-flight ensureVideo knows its result is stale. */
const gen = new Map<string, number>();
const bump = (key: string) => gen.set(key, (gen.get(key) ?? 0) + 1);
/** Make in-flight loads for matching keys stale (they were never in the pool, so the release loops below can't see them). */
function dropPending(drop: (key: string) => boolean) {
  for (const key of [...pending.keys()]) if (drop(key)) { bump(key); pending.delete(key); }
}
const listeners = new Set<() => void>();
const keyOf = (assetId: string, slot: number) => `${assetId}#${slot}`;

export const onVideoFrame = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const emit = () => listeners.forEach((f) => f());

function make(blob: Blob, assetId: string, slot: number): Entry {
  const el = document.createElement('video');
  el.muted = true;
  el.playsInline = true;
  el.preload = 'auto';
  el.style.display = 'none';
  const url = URL.createObjectURL(blob);
  el.src = url;
  for (const ev of ['seeked', 'loadeddata', 'canplay']) el.addEventListener(ev, emit);
  return { el, url, assetId, slot };
}

/** Element for an asset on a track, created on first use. Rejects with NeedsPermissionError when the browser needs the user to re-allow a linked file. */
export function ensureVideo(assetId: string, slot = 0): Promise<HTMLVideoElement | null> {
  const key = keyOf(assetId, slot);
  const have = pool.get(key);
  if (have) return Promise.resolve(have.el);
  let p = pending.get(key);
  if (!p) {
    const g0 = gen.get(key) ?? 0;
    p = getBlob(assetId).then((b) => {
      if (!b || b.size === 0) return null;
      const cur = pool.get(key);
      if (cur) return cur.el;
      if ((gen.get(key) ?? 0) !== g0) return null; // released while loading
      const e = make(b, assetId, slot);
      pool.set(key, e);
      return e.el;
    }).finally(() => { if (pending.get(key) === p) pending.delete(key); });
    pending.set(key, p);
  }
  return p;
}

export function registerVideoBlob(assetId: string, blob: Blob) {
  const slots = [...pool.values()].filter((e) => e.assetId === assetId).map((e) => e.slot);
  release(assetId);
  for (const slot of slots.length ? slots : [0]) pool.set(keyOf(assetId, slot), make(blob, assetId, slot));
  emit();
}

export const peekVideo = (assetId: string, slot = 0) => pool.get(keyOf(assetId, slot))?.el ?? null;
export const allVideos = () => [...pool.values()];

export function release(assetId: string) {
  dropPending((key) => key.startsWith(`${assetId}#`));
  for (const [key, e] of [...pool.entries()]) {
    if (e.assetId !== assetId) continue;
    e.el.pause(); e.el.removeAttribute('src'); e.el.load();
    URL.revokeObjectURL(e.url);
    pool.delete(key);
    bump(key);
  }
}

/** Drop elements whose asset+track pair is no longer used. `keep` holds `${assetId}#${slot}` keys. */
export function releaseUnused(keep: Set<string>) {
  dropPending((key) => !keep.has(key));
  for (const [key, e] of [...pool.entries()]) {
    if (keep.has(key)) continue;
    e.el.pause(); e.el.removeAttribute('src'); e.el.load();
    URL.revokeObjectURL(e.url);
    pool.delete(key);
    bump(key);
  }
}

export { NeedsPermissionError, keyOf };
