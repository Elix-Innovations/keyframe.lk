import type { Project } from '@/types';
import { prepareClipAudio, scheduleClipAudio } from './clips';
import { trackSegments } from './mix';
import { encodeWav } from './denoise';
import { loadAudioAsset } from './graph';

/**
 * Transcription always gets the audio exactly as the editor plays it (same decoder, same placement), as a mono
 * 16 kHz WAV. Sending the original file instead lets the server's decoder pick a different time origin (audio
 * stream start offsets in WebM/MP4, AAC priming, MP3 encoder delay), which shifts every caption by 20-200 ms.
 */
const RATE = 16000;

/**
 * A copy of the project with every voice audible: muting the voice to preview music, or a muted clip, must not stop
 * its words from being captioned. Placement and decoding are unchanged.
 */
function audible(project: Project): Project {
  const lanes = project.lanes?.audio ? { ...project.lanes, audio: { ...project.lanes.audio, muted: false } } : project.lanes;
  return {
    ...project,
    lanes,
    clips: (project.clips ?? []).map((c) => (c.muted || c.volume < -12 || c.volKf?.length ? { ...c, muted: false, volume: Math.max(c.volume, 0), volKf: undefined } : c)),
    audio: { ...project.audio, original: { ...project.audio.original, muted: false, volume: Math.max(project.audio.original.volume, 0) } },
  };
}

/** The timeline's audio clips and sound tracks (no effects, mutes ignored) as a mono 16 kHz WAV, e.g. for transcription. */
export async function renderVoiceWav(input: Project): Promise<Blob> {
  const project = audible(input);
  const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil(project.duration * RATE)), RATE);
  scheduleClipAudio(ctx, project, ctx.destination, await prepareClipAudio(project), 0, 0);
  // Sound tracks added from the Sounds tab (a voice-over, say) are speech to caption too, at their timeline position.
  for (const track of project.audio.tracks.filter((t) => !t.muted)) {
    // The same decode the preview and export mix use for tracks (graph.ts scheduleMix).
    const buf = await loadAudioAsset(track.assetId).catch(() => null);
    if (!buf) continue;
    for (const seg of trackSegments(track)) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(seg.when, seg.offset, seg.dur);
    }
  }
  return encodeWav(await ctx.startRendering());
}

/** Seconds [from, to) of an already decoded buffer as a mono 16 kHz WAV; word times come back relative to `from`. */
export async function bufferSpanWav(buf: AudioBuffer, from: number, to: number): Promise<Blob> {
  const dur = Math.max(0.05, Math.min(to, buf.duration) - from);
  const ctx = new OfflineAudioContext(1, Math.ceil(dur * RATE), RATE);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start(0, Math.max(0, from), dur);
  return encodeWav(await ctx.startRendering());
}
