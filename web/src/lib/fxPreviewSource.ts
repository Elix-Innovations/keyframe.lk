import { useSyncExternalStore } from 'react';
import { useEditor } from '../store';
import { videoClipAt, videoClips } from './clips';
import { peekVideo } from './videoPool';

/**
 * One small still of the current video frame, shared by every tile in the Filters, Effects and Transitions
 * panels, so they preview on your own footage. Falls back to the project thumbnail while the video loads.
 */
let bmp: ImageBitmap | null = null;
let version = 0;
const listeners = new Set<() => void>();
let busy = false;
let again = false;

async function grab(): Promise<ImageBitmap | null> {
  const p = useEditor.getState().project;
  if (!p) return null;
  const clips = p.clips ?? [];
  const clip = videoClipAt(clips, useEditor.getState().time) ?? videoClips(clips)[0];
  const el = clip ? peekVideo(clip.assetId, clip.track ?? 0) : null;
  if (el && el.readyState >= 2 && el.videoWidth) {
    try { return await createImageBitmap(el, { resizeWidth: 360, resizeQuality: 'medium' }); } catch { /* fall through */ }
  }
  if (p.thumbnail) {
    try { const blob = await (await fetch(p.thumbnail)).blob(); return await createImageBitmap(blob); } catch { /* none */ }
  }
  return null;
}

export async function refreshPreviewSource() {
  if (busy) { again = true; return; }
  busy = true;
  try {
    const next = await grab();
    if (next) { const old = bmp; bmp = next; version++; listeners.forEach((f) => f()); setTimeout(() => old?.close(), 500); }
  } finally {
    busy = false;
    if (again) { again = false; void refreshPreviewSource(); }
  }
}

export function usePreviewSource() {
  const v = useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => version, () => 0);
  return { bmp, version: v };
}
