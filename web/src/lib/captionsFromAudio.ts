import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import type { Word } from '../types';
import { alignmentNote, transcribe } from './api';
import { loadSourceAudio } from '../audio/clips';
import { loadAudioAsset } from '../audio/graph';
import { bufferSpanWav } from '../audio/voice';
import { normalizeCaptions, segmentWords } from './segment';
import { useEditor } from '../store';
import { curveDuration } from './speedCurve';

/** The stretch of a stored file that sits on the timeline: file seconds [from, to) land at `at` onwards, `rate` file seconds per timeline second. */
export interface AudioSpan { assetId: string; name: string; from: number; to: number; at: number; rate: number;
  /** 'clip' audio is decoded like the clip lane plays it, 'track' like the music/sound track mix. */
  kind: 'clip' | 'track';
  /** File second -> timeline second. Differs from the linear `rate` mapping when the clip has a speed curve. */
  toTimeline: (srcSec: number) => number }

/** The span a timeline audio clip or music track covers, or null when the id is not one. */
export function audioSpanOf(id: string): AudioSpan | null {
  const p = useEditor.getState().project;
  if (!p) return null;
  const c = p.clips?.find((x) => x.id === id);
  if (c) {
    const from = c.in, to = c.in + c.duration * c.speed;
    const curve = c.curve;
    return {
      assetId: c.assetId, name: c.name, from, to, at: c.start, rate: c.speed, kind: 'clip',
      // With a speed curve `speed` is only the average: timeline time is the integral of 1 / speed.
      toTimeline: curve
        ? (s) => c.start + curveDuration({ curve, in: c.in, sourceDuration: c.sourceDuration }, from, Math.min(to, Math.max(from, s)))
        : (s) => c.start + (s - from) / c.speed,
    };
  }
  const t = p.audio.tracks.find((x) => x.id === id);
  if (t) return { assetId: t.assetId, name: t.name, kind: 'track', from: t.offset, to: t.offset + Math.min(t.duration, t.fileDuration - t.offset), at: t.start, rate: 1, toTimeline: (s) => t.start + (s - t.offset) };
  return null;
}

/** Transcribe the audio of a timeline clip or track and write captions at its position, replacing captions already under it. */
export async function generateCaptionsFromAudio(id: string): Promise<void> {
  const span = audioSpanOf(id);
  const st = useEditor.getState();
  if (!span || !st.project) return;
  const pid = st.project.id;
  // Transcribe the span exactly as it is decoded for playback, so word times share the preview's time base.
  let blob: Blob | undefined;
  try {
    const buf = span.kind === 'clip' ? await loadSourceAudio(span.assetId) : await loadAudioAsset(span.assetId);
    if (buf) blob = await bufferSpanWav(buf, span.from, span.to);
  } catch (e) { st.notify((e as Error).message || 'Could not read that audio.', 'error'); return; }
  if (!blob) { st.notify('Could not read that audio.', 'error'); return; }
  const lang = st.project.language === 'en' ? 'en' : 'si';
  const toastId = toast.loading(`Transcribing “${span.name}”…`);
  try {
    const res = await transcribe(blob, { language: lang, provider: 'auto', onUpload: () => undefined });
    toast.dismiss(toastId);
    // The upload takes seconds: the clip may have moved or another project been opened since.
    const now = useEditor.getState().project;
    const fresh = audioSpanOf(id);
    if (!now || now.id !== pid || !fresh || fresh.assetId !== span.assetId || fresh.at !== span.at || fresh.from !== span.from || fresh.to !== span.to) {
      st.notify('The clip changed while transcribing, so no captions were added. Try again.', 'error');
      return;
    }
    const at = span.at;
    const end = span.toTimeline(span.to);
    // The upload was only [from, to) of the file, so its times are relative to `from`.
    const words: Word[] = res.words
      .map((w) => ({ ...w, start: w.start + span.from, end: w.end + span.from }))
      .filter((w) => w.end > span.from && w.start < span.to)
      .map((w) => ({
        id: nanoid(8), text: w.text,
        start: span.toTimeline(Math.max(w.start, span.from)),
        end: span.toTimeline(Math.min(w.end, span.to)),
      }));
    if (!words.length) { st.notify('No speech was detected in that audio.', 'error'); return; }
    st.update((p) => ({
      ...p,
      words: [...p.words.filter((w) => w.end <= at || w.start >= end), ...words].sort((a, b) => a.start - b.start),
      captions: normalizeCaptions([...p.captions.filter((c) => c.end <= at || c.start >= end), ...segmentWords(words, p.segmentation)]),
    }));
    st.notify(`Added captions for ${words.length} words.${alignmentNote(res)}`, res.alignment && res.alignment.aligned < res.alignment.total ? 'info' : 'success');
  } catch (e) {
    toast.dismiss(toastId);
    st.notify((e as Error).message || 'Could not generate captions.', 'error');
  }
}
