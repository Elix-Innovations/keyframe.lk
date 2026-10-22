import type { Clip, Project } from '@/types';
import { getBlob } from '@/lib/db';
import { audioClips } from '@/lib/clips';
import { laneOf } from '@/lib/videoFx';
import { decodeOriginal } from './decode';
import { loadAudioAsset, voiceChain, type ScheduledNodes } from './graph';
import { dbToGain } from './mix';
import { timeStretch } from './stretch';

/** Decoded audio of a clip's source file (null when the file has no audio). Cached per asset. */
const sources = new Map<string, Promise<AudioBuffer | null>>();
export function loadSourceAudio(assetId: string): Promise<AudioBuffer | null> {
  let p = sources.get(assetId);
  if (!p) {
    p = (async () => {
      const blob = await getBlob(assetId);
      if (!blob) return null;
      return decodeOriginal(blob);
    })();
    p.catch(() => sources.delete(assetId));
    sources.set(assetId, p);
  }
  return p;
}

const stretched = new WeakMap<AudioBuffer, Map<number, Promise<AudioBuffer>>>();
function stretchedFor(buf: AudioBuffer, speed: number): Promise<AudioBuffer> {
  let m = stretched.get(buf);
  if (!m) { m = new Map(); stretched.set(buf, m); }
  const key = Math.round(speed * 1000) / 1000;
  let p = m.get(key);
  if (!p) { p = timeStretch(buf, key); m.set(key, p); }
  return p;
}

/** The buffer a clip plays: noise-removed audio for clips from the denoised video, stretched for speed. */
async function clipBuffer(project: Project, c: Clip): Promise<AudioBuffer | null> {
  const dn = project.audio.original.denoise;
  const from = dn && c.fromVideo && (dn.sourceAssetId ?? project.videoAssetId) === c.assetId;
  const base = from ? await loadAudioAsset(dn!.assetId).catch(() => null) : await loadSourceAudio(c.assetId).catch(() => null);
  if (!base) return null;
  return c.speed === 1 ? base : stretchedFor(base, c.speed);
}

/** Decode and stretch everything the audio clips need, so scheduling afterwards is synchronous. */
export async function prepareClipAudio(project: Project): Promise<Map<string, AudioBuffer>> {
  const out = new Map<string, AudioBuffer>();
  await Promise.all(audioClips(project.clips ?? []).map(async (c) => {
    if (c.muted) return;
    const b = await clipBuffer(project, c);
    if (b) out.set(c.id, b);
  }));
  return out;
}

/** Schedule the audio clips from timeline time `from`, starting at context time `at`. */
export function scheduleClipAudio(
  ctx: BaseAudioContext, project: Project, dest: AudioNode, prepared: Map<string, AudioBuffer>, from: number, at: number,
): ScheduledNodes {
  const nodes: AudioNode[] = [];
  const srcs: AudioBufferSourceNode[] = [];
  const o = project.audio.original;
  if (laneOf(project, 'audio').muted) return { stop: () => {} };
  for (const c of audioClips(project.clips ?? [])) {
    const buf = prepared.get(c.id);
    const end = c.start + c.duration;
    if (!buf || end <= from) continue;
    if (c.fromVideo && o.muted) continue;
    const gain = dbToGain(c.volume + (c.fromVideo ? o.volume : 0));
    const skip = Math.max(0, from - c.start);
    const t0 = at + Math.max(0, c.start - from);
    const t1 = at + (end - from);
    const g = ctx.createGain();
    g.gain.setValueAtTime(c.fadeIn > 0 && skip < c.fadeIn ? 0.0001 : gain, t0);
    if (c.fadeIn > 0 && skip < c.fadeIn) g.gain.linearRampToValueAtTime(gain, t0 + c.fadeIn - skip);
    if (c.fadeOut > 0) { g.gain.setValueAtTime(gain, Math.max(t0, t1 - c.fadeOut)); g.gain.linearRampToValueAtTime(0.0001, t1); }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (c.fromVideo) {
      const chain = voiceChain(ctx, o.enhance);
      src.connect(chain.input);
      chain.output.connect(g);
      nodes.push(chain.output);
    } else src.connect(g);
    g.connect(dest);
    // The stretched buffer is already at clip speed, so source offset scales by 1/speed.
    const offset = c.in / c.speed + skip;
    src.start(t0, Math.min(offset, Math.max(0, buf.duration - 0.001)), c.duration - skip);
    srcs.push(src);
    nodes.push(g);
  }
  return {
    stop: () => {
      srcs.forEach((s) => { try { s.stop(); } catch { /* not started */ } s.disconnect(); });
      nodes.forEach((n) => n.disconnect());
    },
  };
}
