import type { Project } from '@/types';
import { prepareClipAudio, scheduleClipAudio } from './clips';
import { encodeWav } from './denoise';

/** The timeline's audio clips (no music or effects) as a mono 16 kHz WAV, e.g. for transcription of an edited timeline. */
export async function renderVoiceWav(project: Project): Promise<Blob> {
  const rate = 16000;
  const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil(project.duration * rate)), rate);
  scheduleClipAudio(ctx, project, ctx.destination, await prepareClipAudio(project), 0, 0);
  return encodeWav(await ctx.startRendering());
}
