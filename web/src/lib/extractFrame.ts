import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import type { Clip, LibraryItem } from '../types';
import { useEditor } from '../store';
import { stillAfter, videoLayersAt } from './clips';
import { addLibraryItem } from './importMedia';
import * as db from './db';
import { imageThumb } from './media';
import { currentTime, pause, syncVideos } from './player';
import { peekVideo } from './videoPool';

/** Wait until the element has landed on its current seek target and holds a decoded frame. */
function frameReady(el: HTMLVideoElement): Promise<void> {
  if (!el.seeking && el.readyState >= 2) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { el.removeEventListener('seeked', done); clearTimeout(timer); resolve(); };
    const timer = setTimeout(done, 1500);
    el.addEventListener('seeked', done);
  });
}

type Grab = { blob: Blob; clip: Clip; t: number };

/** Pause and read the source frame under the playhead from the selected clip (or the topmost video layer). */
async function grab(clipId?: string): Promise<Grab | null> {
  const st = useEditor.getState();
  pause();
  const t = currentTime();
  const layers = videoLayersAt(st.project?.clips ?? [], t);
  const want = clipId ?? st.selectedClipId;
  const clip = layers.find((c) => c.id === want) ?? layers.at(-1);
  if (!clip) { toast.error('No video at the playhead.'); return null; }
  syncVideos(t);
  const el = peekVideo(clip.assetId, clip.track ?? 0);
  if (!el || !el.videoWidth) { toast.error('Video is still loading. Try again.'); return null; }
  await frameReady(el);
  const canvas = document.createElement('canvas');
  canvas.width = el.videoWidth; canvas.height = el.videoHeight;
  canvas.getContext('2d')!.drawImage(el, 0, 0);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) { toast.error('Could not read the frame.'); return null; }
  return { blob, clip, t };
}

/** Store the frame as a PNG in the media library. */
async function toLibrary({ blob, clip, t }: Grab): Promise<LibraryItem> {
  const assetId = await db.putBlob(blob);
  const thumb = (await imageThumb(blob, 320).catch(() => null)) ?? undefined;
  const item: LibraryItem = { id: nanoid(8), kind: 'image', name: `${clip.name} frame ${t.toFixed(2)}s`, assetId, duration: 3, thumb };
  useEditor.getState().update((p) => ({ ...p, library: [...(p.library ?? []), item] }));
  return item;
}

export type FrameTarget = 'layer' | 'overlay' | 'save';

/**
 * Extract the frame under the playhead:
 * - layer: a held still right after the clip on the same video layer (no file, same footage)
 * - overlay: a PNG placed on the timeline as an image overlay at the playhead
 * - save: a PNG added to Media and downloaded
 */
export async function extractFrame(clipId: string | undefined, target: FrameTarget): Promise<void> {
  const st = useEditor.getState();
  if (target === 'layer') {
    pause();
    const t = currentTime();
    const clip = videoLayersAt(st.project?.clips ?? [], t).find((c) => c.id === (clipId ?? st.selectedClipId)) ?? videoLayersAt(st.project?.clips ?? [], t).at(-1);
    if (!clip) { toast.error('No video at the playhead.'); return; }
    let newId: string | null = null;
    st.setClips((cs) => { const r = stillAfter(cs, clip.id, t); newId = r.id; return r.clips; });
    if (newId) st.selectClip(newId);
    return;
  }
  const g = await grab(clipId);
  if (!g) return;
  const item = await toLibrary(g);
  if (target === 'overlay') {
    await addLibraryItem(item, { start: g.t, track: 0 });
    toast.success('Frame added as an overlay.');
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(g.blob);
  a.download = `${item.name.replace(/[^\w.-]+/g, '_')}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast.success('Frame saved to Media and downloaded.');
}
