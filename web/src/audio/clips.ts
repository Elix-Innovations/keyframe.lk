import type { Clip, Project } from '@/types';
import { getBlob } from '@/lib/db';
import { audioClips } from '@/lib/clips';
import { laneOf, propAt } from '@/lib/videoFx';
import { decodeOriginal } from './decode';
import { loadAudioAsset, voiceChain, type ScheduledNodes } from './graph';
import { dbToGain } from './mix';
import { timeStretch } from './stretch';
import { curveSpeedAt, curveSrcAt } from '@/lib/speedCurve';

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
  const o = project.audio.original;
  const legacy = o.denoise && (o.denoise.sourceAssetId ?? project.videoAssetId) === c.assetId ? o.denoise : undefined;
  const dn = c.fromVideo ? o.denoiseBy?.[c.assetId] ?? legacy : undefined;
  const from = !!dn;
  const base = from ? await loadAudioAsset(dn!.assetId).catch(() => null) : await loadSourceAudio(c.assetId).catch(() => null);
  if (!base) return null;
  // A curved clip plays the raw file and varies the playback rate while scheduled.
  return c.speed === 1 || c.curve ? base : stretchedFor(base, c.speed);
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
    if (c.volKf?.length) {
      // Keyframed volume rides on its own gain stage, relative to the static volume the fades already carry.
      const k = ctx.createGain();
      const rel = (db: number) => dbToGain(db - c.volume);
      const pts = [...c.volKf].sort((a, b) => a.t - b.t);
      const timeOf = (kt: number) => at + (c.start + kt - from);
      k.gain.setValueAtTime(rel(propAt(c.volKf, skip, c.volume)), t0);
      for (const p of pts) if (p.t > skip) k.gain.linearRampToValueAtTime(rel(p.v), timeOf(p.t));
      g.connect(k); k.connect(dest);
      nodes.push(k);
    } else g.connect(dest);
    // The stretched buffer is already at clip speed, so source offset scales by 1/speed.
    let offset = c.in / c.speed + skip;
    if (c.curve) {
      const cv = { ...c, curve: c.curve };
      offset = curveSrcAt(cv, skip);
      // Rate follows the curve in 50 ms steps (pitch moves with it, like a tape).
      src.playbackRate.setValueAtTime(curveSpeedAt(cv, skip), t0);
      for (let tl = skip + 0.05; tl < c.duration; tl += 0.05) src.playbackRate.linearRampToValueAtTime(curveSpeedAt(cv, tl), t0 + tl - skip);
    }
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
