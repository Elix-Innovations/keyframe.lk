import type { Project } from '@/types';
import { loadSourceAudio, prepareClipAudio, scheduleClipAudio } from './clips';
import { trackSegments } from './mix';
import { encodeWav } from './denoise';

/** The timeline's audio clips and sound tracks (no effects) as a mono 16 kHz WAV, e.g. for transcription of an edited timeline. */
export async function renderVoiceWav(project: Project): Promise<Blob> {
  const rate = 16000;
  const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil(project.duration * rate)), rate);
  scheduleClipAudio(ctx, project, ctx.destination, await prepareClipAudio(project), 0, 0);
  // Sound tracks added from the Sounds tab (a voice-over, say) are speech to caption too, at their timeline position.
  for (const track of project.audio.tracks.filter((t) => !t.muted)) {
    const buf = await loadSourceAudio(track.assetId);
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
