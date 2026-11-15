import type { Project, VideoLayer } from '../types';
import { NEUTRAL_FILTERS } from './videoFx';

const bare = (l: VideoLayer): VideoLayer => ({ ...l, filters: NEUTRAL_FILTERS, presetId: null, effects: [], matte: undefined, regionBlurs: undefined, fkf: undefined });

let last: { from: Project; to: Project } | null = null;

/** The project without its enhancements (noise removal, voice enhance, grade, filters, effects, matte, blurs), for the preview's Before toggle. Never exported. */
export function beforeProject(p: Project): Project {
  if (last?.from === p) return last.to;
  const { denoise: _d, denoiseBy: _db, ...original } = p.audio.original;
  const to: Project = {
    ...p,
    audio: { ...p.audio, original: { ...original, enhance: false } },
    video: p.video && bare(p.video),
    clips: p.clips?.map((c) => (c.fx ? { ...c, fx: bare(c.fx) } : c)),
    adj: [],
  };
  last = { from: p, to };
  return to;
}
