import { nanoid } from 'nanoid';
import type { MusicTrack, SfxId } from '../types';
import { WAVEFORM_RATE } from '../types';
import { useEditor } from '../store';
import { loadAudioAsset } from '../audio/graph';
import { peakOf, waveformOf } from '../audio/loudness';
import { SFX, sfxWav } from '../audio/sfx';
import * as db from './db';
import { currentTime } from './player';

/** What a sound tile carries while it is dragged or clicked. Either a URL to download or a built-in synthesized sound. */
export interface SoundSource { name: string; url?: string; builtin?: SfxId; license?: string; attribution?: string }

/** Peaks for the timeline waveform of a decoded file. Cached per asset; used for tracks saved without analysis. */
const peaks = new Map<string, Promise<number[]>>();
export function waveformForAsset(assetId: string): Promise<number[]> {
  let p = peaks.get(assetId);
  if (!p) {
    p = loadAudioAsset(assetId).then((b) => waveformOf(b, WAVEFORM_RATE));
    p.catch(() => peaks.delete(assetId));
    peaks.set(assetId, p);
  }
  return p;
}

/** Lowest layer where [start, start + duration) overlaps no other track. */
export function freeLayer(tracks: MusicTrack[], start: number, duration: number, exceptId?: string): number {
  const busy = (l: number) => tracks.some((x) => x.id !== exceptId && (x.layer ?? 0) === l && x.start < start + duration && start < x.start + x.duration);
  let l = 0;
  while (busy(l)) l++;
  return l;
}

/** Put a sound on the timeline as its own short audio track starting at `start` (default: the playhead). */
export async function addSound(src: SoundSource, start = currentTime(), layer?: number): Promise<void> {
  const st = useEditor.getState();
  let blob: Blob;
  if (src.builtin) blob = await sfxWav(src.builtin);
  else {
    const res = await fetch(src.url ?? '');
    if (!res.ok) throw new Error('Could not download that sound.');
    blob = await res.blob();
  }
  const assetId = await db.putBlob(blob);
  const buf = await loadAudioAsset(assetId);
  const at = Math.max(0, start);
  const tracks = st.project?.audio.tracks ?? [];
  const t: MusicTrack = {
    id: nanoid(8), assetId, name: src.name, source: 'library', effect: true, layer: layer ?? freeLayer(tracks, at, buf.duration),
    analysis: { bpm: null, beats: [], lufs: null, peak: peakOf(buf), waveform: waveformOf(buf, WAVEFORM_RATE) }, fileDuration: buf.duration, start: at, offset: 0,
    duration: buf.duration, volume: 0, fadeIn: 0, fadeOut: Math.min(0.05, buf.duration / 4), loop: false, license: src.license, attribution: src.attribution,
  };
  st.update((p) => ({ ...p, audio: { ...p.audio, tracks: [...p.audio.tracks, t] } }));
  st.notify(`Added “${src.name}” at ${t.start.toFixed(1)}s.`, 'success');
}

/**
 * Put a built-in sound effect on the timeline at each of `times` (one decode, one undo step).
 * `replace` picks existing tracks to drop first, so applying a template again swaps its sounds instead of piling them up.
 */
export async function addSfxTracks(id: SfxId, times: number[], replace?: (t: MusicTrack) => boolean): Promise<number> {
  const st = useEditor.getState();
  const blob = times.length ? await sfxWav(id) : null;
  const assetId = blob ? await db.putBlob(blob) : null;
  const buf = assetId ? await loadAudioAsset(assetId) : null;
  const label = SFX.find((s) => s.id === id)?.label ?? id;
  st.update((p) => {
    let tracks = replace ? p.audio.tracks.filter((t) => !replace(t)) : p.audio.tracks;
    if (assetId && buf) {
      for (const at of [...times].sort((a, b) => a - b)) {
        const start = Math.max(0, at);
        tracks = [...tracks, {
          id: nanoid(8), assetId, name: label, source: 'library', effect: true, fromTemplate: true, layer: freeLayer(tracks, start, buf.duration),
          fileDuration: buf.duration, start, offset: 0, duration: buf.duration, volume: -4, fadeIn: 0, fadeOut: Math.min(0.05, buf.duration / 4), loop: false,
        }];
      }
    }
    return { ...p, audio: { ...p.audio, tracks } };
  });
  return times.length;
}

/** Edit helpers for audio tracks on the timeline (music and sound effects). All go through the store so they undo. */
export const trackOps = {
  remove(id: string) { const st = useEditor.getState(); st.update((p) => ({ ...p, audio: { ...p.audio, tracks: p.audio.tracks.filter((t) => t.id !== id) } })); st.selectTrack(null); },
  duplicate(id: string) {
    const st = useEditor.getState();
    const t = st.project?.audio.tracks.find((x) => x.id === id);
    if (!t) return;
    const start = t.start + t.duration;
    const copy = { ...t, id: nanoid(8), start, layer: freeLayer(st.project!.audio.tracks, start, t.duration) };
    st.update((p) => ({ ...p, audio: { ...p.audio, tracks: [...p.audio.tracks, copy] } }));
    st.selectTrack(copy.id);
  },
  /** Stretch or trim a track so it ends exactly where the video ends, looping the file when it is too short to fill the gap. */
  fitToVideo(id: string) {
    const st = useEditor.getState();
    const end = st.project?.duration ?? 0;
    const t = st.project?.audio.tracks.find((x) => x.id === id);
    if (!t || end <= t.start + 0.05) return;
    const duration = end - t.start;
    st.update((p) => ({ ...p, audio: { ...p.audio, tracks: p.audio.tracks.map((x) => (x.id === id ? { ...x, duration, loop: x.loop || x.fileDuration - x.offset < duration } : x)) } }));
  },
  toggleMute(id: string) {
    useEditor.getState().update((p) => ({ ...p, audio: { ...p.audio, tracks: p.audio.tracks.map((t) => (t.id === id ? { ...t, muted: !t.muted } : t)) } }));
  },
  canSplit(id: string, at = currentTime()) {
    const t = useEditor.getState().project?.audio.tracks.find((x) => x.id === id);
    return !!t && at > t.start + 0.05 && at < t.start + t.duration - 0.05;
  },
  splitAtPlayhead(id?: string) {
    const st = useEditor.getState();
    const target = id ?? st.selectedTrackId;
    const t = st.project?.audio.tracks.find((x) => x.id === target);
    const at = currentTime();
    if (!t || !trackOps.canSplit(t.id, at)) return false;
    const cut = at - t.start;
    const offset = t.loop ? (t.offset + cut) % t.fileDuration : t.offset + cut;
    const right = { ...t, id: nanoid(8), start: at, offset, duration: t.duration - cut, fadeIn: 0 };
    st.update((p) => ({ ...p, audio: { ...p.audio, tracks: p.audio.tracks.flatMap((x) => (x.id === t.id ? [{ ...t, duration: cut, fadeOut: Math.min(t.fadeOut, 0.03) }, right] : [x])) } }));
    st.selectTrack(right.id);
    return true;
  },
};
