import type { Project } from '@/types';
import { buildMixPlan, dbToGain } from './mix';
import { scheduleMix } from './graph';
import { prepareClipAudio, scheduleClipAudio } from './clips';
import { gainAndLimit, measureLufs } from './loudness';

export const MIX_RATE = 48000;

/**
 * Render the final soundtrack offline (same mix plan as the live preview), then master it:
 * normalize to the target loudness and brick-wall limit at −1 dBFS.
 */
export async function renderSoundtrack(project: Project, _file: Blob | null, duration: number): Promise<AudioBuffer> {
  const plan = buildMixPlan(project);
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * MIX_RATE)), MIX_RATE);
  scheduleClipAudio(ctx, project, ctx.destination, await prepareClipAudio(project), 0, 0);
  await scheduleMix(ctx, plan, ctx.destination, 0, 0);
  const mixed = await ctx.startRendering();

  let gain = 1;
  const n = project.audio.normalize;
  if (n.enabled) {
    const lufs = measureLufs(mixed);
    if (lufs !== null) gain = dbToGain(Math.max(-12, Math.min(18, n.targetLufs - lufs)));
  }
  gainAndLimit(mixed, gain, -1);
  return mixed;
}
