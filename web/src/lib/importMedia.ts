import { nanoid } from 'nanoid';
import type { LibraryItem, MusicTrack } from '../types';
import { freeLayer } from './sounds';
import { brollOverlay } from './overlays';
import { analyzeTrack, loadAudioAsset } from '../audio/graph';
import { hasAudio } from '../audio/decode';
import { useEditor } from '../store';
import { makeAudioClip, makeVideoClip, videoClips, clipEnd, freeVideoTrack } from './clips';
import * as db from './db';
import { imageThumb, probeVideo } from './media';
import { currentTime } from './player';
import { freeLayerRow } from './layers';

export type MediaKind = 'video' | 'audio' | 'image';

export const kindOf = (f: Blob): MediaKind | null =>
  f.type.startsWith('video/') ? 'video' : f.type.startsWith('audio/') ? 'audio' : f.type.startsWith('image/') ? 'image' : null;

/** Append a video to the timeline as a video clip plus a linked audio clip (when the file has sound). */
export async function addVideo(file: File, handle?: FileSystemFileHandle | null, pos?: { start: number; track: number }, stored?: string, range?: { in: number; out: number }): Promise<void> {
  const st = useEditor.getState();
  if (!st.project) return;
  const meta = await probeVideo(file);
  const assetId = stored ?? (handle ? await db.putFileHandle(handle, file) : await db.putBlob(file));
  const sound = await hasAudio(file);
  const name = file.name.replace(/\.[^.]+$/, '');
  const mainClips = videoClips(st.project.clips ?? []).filter((c) => (c.track ?? 0) === 0);
  const last = mainClips.at(-1);
  const start = pos ? pos.start : last ? clipEnd(last) : 0;
  const linkId = sound ? nanoid(6) : undefined;
  const dur = range ? range.out - range.in : meta.duration;
  const track = pos ? freeVideoTrack(st.project.clips ?? [], start, dur, pos.track, undefined, st.project.overlays) : 0;
  const v = { ...makeVideoClip({ assetId, name, sourceDuration: meta.duration, start, width: meta.width, height: meta.height, linkId }), track };
  const a = sound ? makeAudioClip({ assetId, name: `${name} audio`, sourceDuration: meta.duration, start, linkId, fromVideo: true }) : null;
  if (range) {
    for (const c of a ? [v, a] : [v]) { c.in = range.in; c.duration = range.out - range.in; }
  }
  st.setClips((c) => [...c, v, ...(a ? [a] : [])]);
  if (!last) st.patchSilently({ thumbnail: meta.thumbnail ?? st.project.thumbnail });
  st.selectClip(v.id);
}

/** Add a file to the open project: video becomes clips, audio a music track, an image b-roll at the playhead. */
export async function importMedia(file: File, handle?: FileSystemFileHandle | null, pos?: { start: number; track: number }, stored?: string, range?: { in: number; out: number }): Promise<MediaKind | null> {
  const st = useEditor.getState();
  const kind = kindOf(file);
  if (!kind || !st.project) return null;
  if (kind === 'video') {
    await addVideo(file, handle, pos, stored, range);
  } else if (kind === 'audio') {
    const assetId = stored ?? (handle ? await db.putFileHandle(handle, file) : await db.putBlob(file));
    let buf: AudioBuffer, analysis: Awaited<ReturnType<typeof analyzeTrack>>;
    try {
      buf = await loadAudioAsset(assetId);
      analysis = await analyzeTrack(file, buf);
    } catch (e) {
      if (!stored) await db.deleteBlob(assetId).catch(() => {}); // an undecodable file must not leave an unreferenced copy in storage
      throw e;
    }
    const start = pos?.start ?? 0;
    const room = st.project.duration - start;
    const dur = range ? range.out - range.in : room > 0.1 ? room : buf.duration;
    const t: MusicTrack = {
      id: nanoid(8), assetId, name: file.name.replace(/\.[^.]+$/, ''), source: 'upload', fileDuration: buf.duration,
      start, offset: range?.in ?? 0, duration: dur, volume: 0, fadeIn: 0.5, fadeOut: 2, loop: !range && buf.duration < dur, analysis,
      layer: freeLayer(st.project.audio.tracks, start, dur),
    };
    st.update((p) => ({ ...p, audio: { ...p.audio, tracks: [...p.audio.tracks, t] } }));
  } else {
    const assetId = stored ?? await db.putBlob(file);
    const at = pos?.start ?? currentTime();
    const bmp = await createImageBitmap(file).catch(() => null);
    const dims = bmp ? { w: bmp.width, h: bmp.height } : undefined;
    bmp?.close();
    const id = nanoid(8);
    st.update((p) => {
      const o = brollOverlay({ assetId, start: at, end: at + 3, mode: 'fullscreen', note: file.name.replace(/\.[^.]+$/, '') }, p.overlays ?? [], { w: p.videoWidth || 1080, h: p.videoHeight || 1920 }, dims);
      // Dropped at a position: land on the row under the cursor (first free one at or above it), not an auto-chosen row.
      const track = pos ? freeLayerRow(p, o.start, o.duration, Math.max(1, pos.track)) : o.track;
      return { ...p, overlays: [...(p.overlays ?? []), { ...o, id, track }] };
    });
    st.selectOverlay(id);
  }
  return kind;
}

/** Store a file in the project's media library without touching the timeline. */
export async function importToLibrary(file: File, handle?: FileSystemFileHandle | null): Promise<MediaKind | null> {
  const st = useEditor.getState();
  const kind = kindOf(file);
  if (!kind || !st.project) return null;
  let duration = 0;
  let thumb: string | undefined;
  // Validate before storing, so an unreadable file leaves nothing behind in storage.
  if (kind === 'video') {
    const meta = await probeVideo(file, 320);
    duration = meta.duration;
    thumb = meta.thumbnail ?? undefined;
  }
  const assetId = handle ? await db.putFileHandle(handle, file) : await db.putBlob(file);
  if (kind === 'audio') {
    try {
      duration = (await loadAudioAsset(assetId)).duration;
    } catch (e) {
      await db.deleteBlob(assetId).catch(() => {});
      throw e;
    }
  } else if (kind === 'image') {
    duration = 3;
    thumb = (await imageThumb(file, 320).catch(() => null)) ?? undefined;
  }
  const item: LibraryItem = { id: nanoid(8), kind, name: file.name.replace(/\.[^.]+$/, ''), assetId, duration, thumb };
  st.update((p) => ({ ...p, library: [...(p.library ?? []), item] }));
  return kind;
}

/** Put a library item on the timeline: at `pos` when dropped, else after the last clip (video) or at the playhead (image). */
export async function addLibraryItem(item: LibraryItem, pos?: { start: number; track: number }): Promise<void> {
  const blob = await db.getBlob(item.assetId);
  if (!blob) throw new Error(`“${item.name}” is no longer stored. Import it again.`);
  const file = blob instanceof File ? blob : new File([blob], item.name, { type: blob.type });
  await importMedia(file, null, pos, item.assetId, item.kind === 'image' ? undefined : item.range);
}

export { imageThumb };
