import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import type { Word } from '../types';
import { transcribe } from './api';
import { getBlob } from './db';
import { normalizeCaptions, segmentWords } from './segment';
import { useEditor } from '../store';

/** The stretch of a stored file that sits on the timeline: file seconds [from, to) land at `at` onwards, `rate` file seconds per timeline second. */
export interface AudioSpan { assetId: string; name: string; from: number; to: number; at: number; rate: number }

/** The span a timeline audio clip or music track covers, or null when the id is not one. */
export function audioSpanOf(id: string): AudioSpan | null {
  const p = useEditor.getState().project;
  if (!p) return null;
  const c = p.clips?.find((x) => x.id === id);
  if (c) return { assetId: c.assetId, name: c.name, from: c.in, to: c.in + c.duration * c.speed, at: c.start, rate: c.speed };
  const t = p.audio.tracks.find((x) => x.id === id);
  if (t) return { assetId: t.assetId, name: t.name, from: t.offset, to: t.offset + Math.min(t.duration, t.fileDuration - t.offset), at: t.start, rate: 1 };
  return null;
}

/** Transcribe the audio of a timeline clip or track and write captions at its position, replacing captions already under it. */
export async function generateCaptionsFromAudio(id: string): Promise<void> {
  const span = audioSpanOf(id);
  const st = useEditor.getState();
  if (!span || !st.project) return;
  const blob = await getBlob(span.assetId);
  if (!blob) { st.notify('Could not read that audio.', 'error'); return; }
  const lang = st.project.language === 'en' ? 'en' : 'si';
  const toastId = toast.loading(`Transcribing “${span.name}”…`);
  try {
    const res = await transcribe(blob, { language: lang, provider: 'auto', onUpload: () => undefined });
    const end = span.at + (span.to - span.from) / span.rate;
    const words: Word[] = res.words
      .filter((w) => w.end > span.from && w.start < span.to)
      .map((w) => ({
        id: nanoid(8), text: w.text,
        start: span.at + (Math.max(w.start, span.from) - span.from) / span.rate,
        end: span.at + (Math.min(w.end, span.to) - span.from) / span.rate,
      }));
    toast.dismiss(toastId);
    if (!words.length) { st.notify('No speech was detected in that audio.', 'error'); return; }
    st.update((p) => ({
      ...p,
      words: [...p.words.filter((w) => w.end <= span.at || w.start >= end), ...words].sort((a, b) => a.start - b.start),
      captions: normalizeCaptions([...p.captions.filter((c) => c.end <= span.at || c.start >= end), ...segmentWords(words, p.segmentation)]),
    }));
    st.notify(`Added captions for ${words.length} words.`, 'success');
  } catch (e) {
    toast.dismiss(toastId);
    st.notify((e as Error).message || 'Could not generate captions.', 'error');
  }
}
