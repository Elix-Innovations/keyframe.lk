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
  const fwd = c.speed === 1 || c.curve ? base : await stretchedFor(base, c.speed);
  return c.reverse ? reversedOf(fwd) : fwd;
}

const reversedCache = new WeakMap<AudioBuffer, AudioBuffer>();
/** A copy of the buffer played back to front. */
function reversedOf(b: AudioBuffer): AudioBuffer {
  let r = reversedCache.get(b);
  if (r) return r;
  r = new AudioBuffer({ length: b.length, numberOfChannels: b.numberOfChannels, sampleRate: b.sampleRate });
  for (let ch = 0; ch < b.numberOfChannels; ch++) r.copyToChannel(b.getChannelData(ch).slice().reverse(), ch);
  reversedCache.set(b, r);
  return r;
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
    if (c.reverse && !c.curve) offset = buf.duration - (c.in / c.speed + c.duration) + skip; // buffer is reversed
    let lead = 0; // silence before the audio starts, when the reversed range reaches past the decoded audio
    if (c.curve) {
      const cv = { ...c, curve: c.curve };
      // A reversed clip walks its curve backwards (like the picture), over a reversed buffer.
      const loc = (tl: number) => (c.reverse ? c.duration - tl : tl);
      offset = c.reverse ? buf.duration - curveSrcAt(cv, loc(skip)) : curveSrcAt(cv, skip);
      // Rate follows the curve in 50 ms steps (pitch moves with it, like a tape).
      src.playbackRate.setValueAtTime(curveSpeedAt(cv, loc(skip)), t0);
      for (let tl = skip + 0.05; tl < c.duration; tl += 0.05) src.playbackRate.linearRampToValueAtTime(curveSpeedAt(cv, loc(tl)), t0 + tl - skip);
    } else if (offset < 0) lead = -offset;
    offset = Math.max(0, Math.min(offset, buf.duration - 0.001));
    const t0s = t0 + lead;
    // start()'s duration is in buffer seconds, so it is only right for the stretched (constant-speed) buffer;
    // a curve clip consumes a different span of source, so it is ended by stop() at the clip's end instead.
    if (t0s < t1) {
      if (c.curve) src.start(t0s, offset);
      else src.start(t0s, offset, c.duration - skip - lead);
      src.stop(t1);
    }
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
