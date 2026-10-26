import { nanoid } from 'nanoid';
import type { Clip, Project } from '../types';
import { DEFAULT_MATTE, migrateVideo } from './videoFx';

/** Pure clip logic: no React, no storage. Every function returns new arrays and never mutates its input. */

export const MIN_CLIP = 0.1;
export const MIN_SPEED = 0.1;
export const MAX_SPEED = 8;
const EPS = 1e-6;

/** Copy of a clip's fx with keyframe times moved by dt (keyframes are relative to the clip start). */
function shiftFx(fx: Clip['fx'], dt: number): Clip['fx'] {
  if (!fx) return fx;
  return { ...fx, keyframes: fx.keyframes.map((k) => ({ ...k, id: nanoid(8), t: k.t + dt })), effects: fx.effects.map((e) => ({ ...e, id: nanoid(8) })) };
}

export const clipEnd = (c: Clip) => c.start + c.duration;
/** Source time shown or heard at timeline time t. */
export const sourceTimeAt = (c: Clip, t: number) => (c.freeze ? c.in : c.in + (t - c.start) * c.speed);
/** Source seconds the clip consumes. */
export const sourceSpan = (c: Clip) => (c.freeze ? 0 : c.duration * c.speed);

export const videoClips = (clips: Clip[]) => clips.filter((c) => c.kind === 'video').sort((a, b) => a.start - b.start);
export const trackOf = (c: Clip) => c.track ?? 0;
/** Clips that share a lane: audio with audio, video with video on the same track. */
export const sameLane = (a: Clip, b: Clip) => a.kind === b.kind && (a.kind === 'audio' || trackOf(a) === trackOf(b));
/** Video clips visible at t, bottom track first (draw order). */
export const videoLayersAt = (clips: Clip[], t: number) =>
  videoClips(clips).filter((c) => t >= c.start - EPS && t < clipEnd(c) - EPS).sort((a, b) => trackOf(a) - trackOf(b));
export const videoTrackCount = (clips: Clip[]) => videoClips(clips).reduce((m, c) => Math.max(m, trackOf(c) + 1), 1);
export const audioClips = (clips: Clip[]) => clips.filter((c) => c.kind === 'audio');
export const clipsAt = (clips: Clip[], t: number) => clips.filter((c) => t >= c.start - EPS && t < clipEnd(c) - EPS);
export const videoClipAt = (clips: Clip[], t: number) => videoLayersAt(clips, t)[0] ?? null;
export const partnerOf = (clips: Clip[], c: Clip) => (c.linkId ? clips.find((x) => x.linkId === c.linkId && x.id !== c.id) ?? null : null);
/** The clip plus its linked partner (if any). */
export const withPartner = (clips: Clip[], c: Clip): Clip[] => { const p = partnerOf(clips, c); return p ? [c, p] : [c]; };

export function timelineEnd(clips: Clip[]) {
  return clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);
}

export function makeVideoClip(o: { assetId: string; name: string; sourceDuration: number; start: number; width: number; height: number; linkId?: string }): Clip {
  return {
    id: nanoid(8), kind: 'video', assetId: o.assetId, name: o.name, sourceDuration: o.sourceDuration, start: o.start, in: 0,
    duration: o.sourceDuration, speed: 1, linkId: o.linkId, volume: 0, fadeIn: 0, fadeOut: 0, width: o.width, height: o.height,
  };
}

export function makeAudioClip(o: { assetId: string; name: string; sourceDuration: number; start: number; linkId?: string; fromVideo?: boolean }): Clip {
  return {
    id: nanoid(8), kind: 'audio', assetId: o.assetId, name: o.name, sourceDuration: o.sourceDuration, start: o.start, in: 0,
    duration: o.sourceDuration, speed: 1, linkId: o.linkId, volume: 0, fadeIn: 0, fadeOut: 0, fromVideo: o.fromVideo,
  };
}

/** Clips for a project saved before the clip model: one video clip plus its linked audio. */
export function clipsFromLegacy(p: Project): Clip[] {
  if (!p.videoAssetId) return [];
  const link = nanoid(6);
  const dur = p.duration || 0;
  const v = makeVideoClip({ assetId: p.videoAssetId, name: 'Video', sourceDuration: dur, start: 0, width: p.videoWidth, height: p.videoHeight, linkId: link });
  const a = makeAudioClip({ assetId: p.videoAssetId, name: 'Video audio', sourceDuration: dur, start: 0, linkId: link, fromVideo: true });
  return [v, a];
}

/** Keep the derived project fields (length, primary video) in step with the clips. */
export function withClips(p: Project, clips: Clip[]): Project {
  const sorted = clips;
  const first = videoClips(sorted).filter((c) => trackOf(c) === 0)[0] ?? videoClips(sorted)[0];
  const end = timelineEnd(sorted);
  return {
    ...p,
    clips: sorted,
    duration: end || p.duration,
    videoAssetId: first?.assetId ?? p.videoAssetId,
    videoWidth: first?.width ?? p.videoWidth,
    videoHeight: first?.height ?? p.videoHeight,
  };
}

const replace = (clips: Clip[], next: Clip[]) => clips.map((c) => next.find((n) => n.id === c.id) ?? c);

/** Move a clip (and its linked partner) by dt seconds. Video clips cannot overlap each other; start is clamped at 0. */
export function moveClips(clips: Clip[], id: string, dt: number): Clip[] {
  const c = clips.find((x) => x.id === id);
  if (!c) return clips;
  const group = withPartner(clips, c);
  let delta = Math.max(dt, -Math.min(...group.map((g) => g.start)));
  for (const g of group) {
    if (g.kind !== 'video') continue;
    const others = videoClips(clips).filter((o) => !group.some((x) => x.id === o.id) && trackOf(o) === trackOf(g));
    const prev = others.filter((o) => clipEnd(o) <= g.start + EPS).at(-1);
    const next = others.find((o) => o.start >= clipEnd(g) - EPS);
    if (prev) delta = Math.max(delta, clipEnd(prev) - g.start);
    if (next) delta = Math.min(delta, next.start - clipEnd(g));
  }
  return replace(clips, group.map((g) => ({ ...g, start: g.start + delta })));
}

/** Trim the left edge by dt (positive shortens). Source time and start advance together; linked partner follows. */
export function trimLeft(clips: Clip[], id: string, dt: number): Clip[] {
  const c = clips.find((x) => x.id === id);
  if (!c) return clips;
  const group = withPartner(clips, c);
  let d = Math.min(dt, c.duration - MIN_CLIP);
  for (const g of group) {
    d = Math.max(d, -g.start, g.freeze ? -Infinity : -g.in / g.speed);
    const prev = g.kind === 'video' ? videoClips(clips).filter((o) => o.id !== g.id && trackOf(o) === trackOf(g) && clipEnd(o) <= g.start + EPS).at(-1) : null;
    if (prev) d = Math.max(d, clipEnd(prev) - g.start);
  }
  return replace(clips, group.map((g) => ({ ...g, start: g.start + d, in: g.freeze ? g.in : g.in + d * g.speed, duration: g.duration - d, fx: g.fx ? { ...g.fx, keyframes: g.fx.keyframes.map((k) => ({ ...k, t: k.t - d })) } : g.fx })));
}

/** Trim the right edge by dt (positive lengthens), limited by the source file and neighbouring video clips. */
export function trimRight(clips: Clip[], id: string, dt: number): Clip[] {
  const c = clips.find((x) => x.id === id);
  if (!c) return clips;
  const group = withPartner(clips, c);
  let d = Math.max(dt, MIN_CLIP - c.duration);
  for (const g of group) {
    if (!g.freeze) d = Math.min(d, (g.sourceDuration - g.in) / g.speed - g.duration);
    const next = g.kind === 'video' ? videoClips(clips).find((o) => o.id !== g.id && trackOf(o) === trackOf(g) && o.start >= clipEnd(g) - EPS) : null;
    if (next) d = Math.min(d, next.start - clipEnd(g));
  }
  return replace(clips, group.map((g) => ({ ...g, duration: g.duration + d })));
}

/** Split at timeline time t. Linked partners split together and stay linked pairwise via fresh link ids. */
export function splitClips(clips: Clip[], ids: string[], t: number): { clips: Clip[]; ids: string[] } {
  const targets = clips.filter((c) => ids.includes(c.id) && t > c.start + MIN_CLIP / 2 && t < clipEnd(c) - MIN_CLIP / 2);
  if (!targets.length) return { clips, ids: [] };
  const expanded = [...new Set(targets.flatMap((c) => withPartner(clips, c)).filter((c) => t > c.start + MIN_CLIP / 2 && t < clipEnd(c) - MIN_CLIP / 2))];
  const relink = new Map<string, string>();
  for (const c of expanded) if (c.linkId && !relink.has(c.linkId)) relink.set(c.linkId, nanoid(6));
  const out: Clip[] = [];
  const created: string[] = [];
  for (const c of clips) {
    if (!expanded.includes(c)) { out.push(c); continue; }
    const cut = t - c.start;
    const right: Clip = {
      ...c, id: nanoid(8), start: t, in: c.freeze ? c.in : c.in + cut * c.speed, duration: c.duration - cut,
      linkId: c.linkId ? relink.get(c.linkId) : undefined, fadeIn: 0, fx: shiftFx(c.fx, -cut),
    };
    out.push({ ...c, duration: cut, fadeOut: 0 }, right);
    created.push(right.id);
  }
  return { clips: out, ids: created };
}

/** Change speed. Source span is kept, so the clip gets shorter when faster. Linked clips follow. */
export function setSpeed(clips: Clip[], id: string, speed: number): Clip[] {
  const c = clips.find((x) => x.id === id);
  if (!c) return clips;
  const s = Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
  const group = withPartner(clips, c);
  return replace(clips, group.map((g) => (g.freeze ? g : { ...g, speed: s, duration: Math.max(MIN_CLIP, (g.duration * g.speed) / s) })));
}

/** After a speed change later clips on the same lane would overlap or leave gaps; close/open the video lane in order. */
export function rippleVideo(clips: Clip[], fromId: string, oldEnd: number): Clip[] {
  const c = clips.find((x) => x.id === fromId);
  if (!c) return clips;
  const delta = clipEnd(c) - oldEnd;
  if (Math.abs(delta) < EPS) return clips;
  return clips.map((x) => (x.id !== c.id && x.start >= oldEnd - EPS && sameLane(x, c) ? { ...x, start: x.start + delta } : x));
}

/** Replace a clip's frame with a held still of `hold` seconds at the playhead, inserted by splitting there. */
export function freezeFrame(clips: Clip[], id: string, t: number, hold = 2): Clip[] {
  const c = clips.find((x) => x.id === id);
  if (!c || c.kind !== 'video' || t <= c.start || t >= clipEnd(c)) return clips;
  const { clips: split } = splitClips(clips, [id], t);
  const right = split.find((x) => x.kind === 'video' && Math.abs(x.start - t) < EPS && x.id !== id);
  if (!right) return clips;
  const still: Clip = { ...right, id: nanoid(8), in: sourceTimeAt(c, t), duration: hold, freeze: true, start: t, linkId: undefined };
  const shifted = split.map((x) => (x.start >= t - EPS && (x.kind === 'audio' || trackOf(x) === trackOf(c)) ? { ...x, start: x.start + hold } : x));
  // The still carries no audio: its linked audio half (if any) is shifted out of the way above, leaving silence under the still.
  return [...shifted, still];
}

export function unlink(clips: Clip[], id: string): Clip[] {
  const c = clips.find((x) => x.id === id);
  if (!c?.linkId) return clips;
  return clips.map((x) => (x.linkId === c.linkId ? { ...x, linkId: undefined } : x));
}

/** Link a video clip with an audio clip. Both must be unlinked. */
export function link(clips: Clip[], a: string, b: string): Clip[] {
  const ca = clips.find((x) => x.id === a), cb = clips.find((x) => x.id === b);
  if (!ca || !cb || ca.kind === cb.kind) return clips;
  const l = nanoid(6);
  return clips.map((x) => (x.id === a || x.id === b ? { ...x, linkId: l } : x));
}

/** Delete clips. With ripple, later clips on the same lane close the gap. */
export function deleteClips(clips: Clip[], ids: string[], ripple: boolean): Clip[] {
  const gone = clips.filter((c) => ids.includes(c.id)).flatMap((c) => withPartner(clips, c));
  const goneIds = new Set(gone.map((c) => c.id));
  let out = clips.filter((c) => !goneIds.has(c.id));
  if (ripple) for (const g of [...gone].sort((a, b) => b.start - a.start)) {
    out = out.map((x) => (sameLane(x, g) && x.start >= clipEnd(g) - EPS ? { ...x, start: x.start - g.duration } : x));
  }
  return out;
}

export function duplicateClip(clips: Clip[], id: string): Clip[] {
  const c = clips.find((x) => x.id === id);
  if (!c) return clips;
  const group = withPartner(clips, c);
  const l = c.linkId ? nanoid(6) : undefined;
  const at = Math.max(...group.map(clipEnd));
  const copies = group.map((g) => ({ ...g, id: nanoid(8), start: at + (g.start - c.start), linkId: g.linkId ? l : undefined }));
  return [...clips, ...copies];
}

/** Audio clips packed into rows so overlapping clips sit on separate lines. */
export function audioRows(clips: Clip[]): { clip: Clip; row: number }[] {
  const rows: number[] = [];
  return [...audioClips(clips)].sort((a, b) => a.start - b.start).map((clip) => {
    let r = rows.findIndex((end) => end <= clip.start + EPS);
    if (r < 0) { r = rows.length; rows.push(0); }
    rows[r] = clipEnd(clip);
    return { clip, row: r };
  });
}

/**
 * True when the timeline is just the original file, untouched: one video clip at full length and speed,
 * plus (optionally) its own audio, also untouched. Such projects can use the fast single-pass export
 * and send the original file for transcription.
 */
export function isSimple(p: Project): boolean {
  const cs = p.clips ?? [];
  const v = cs.filter((c) => c.kind === 'video'), a = cs.filter((c) => c.kind === 'audio');
  if (v.length !== 1 || a.length > 1 || trackOf(v[0]) !== 0 || (p.adj?.length ?? 0) > 0) return false;
  const whole = (c: Clip) => c.start === 0 && c.in === 0 && c.speed === 1 && !c.freeze && Math.abs(c.duration - c.sourceDuration) < 0.05;
  if (!whole(v[0])) return false;
  if (a.length === 0) return true;
  return a[0].assetId === v[0].assetId && whole(a[0]) && !a[0].muted && a[0].volume === 0 && a[0].fadeIn === 0 && a[0].fadeOut === 0 && !p.audio.original.denoise;
}

/** Change speed and keep the lane tight: later clips on the same lane shift by however much the clip grew or shrank. */
export function changeSpeed(clips: Clip[], id: string, speed: number): Clip[] {
  const c = clips.find((x) => x.id === id);
  if (!c) return clips;
  const group = withPartner(clips, c);
  const oldEnds = new Map(group.map((g) => [g.id, clipEnd(g)]));
  let out = setSpeed(clips, id, speed);
  const groupIds = new Set(group.map((g) => g.id));
  for (const g of group) {
    const now = out.find((x) => x.id === g.id)!;
    const delta = clipEnd(now) - oldEnds.get(g.id)!;
    if (Math.abs(delta) < EPS) continue;
    out = out.map((x) => (!groupIds.has(x.id) && sameLane(x, g) && x.start >= oldEnds.get(g.id)! - EPS ? { ...x, start: x.start + delta } : x));
  }
  return out;
}

/** Move a video clip to another track when that spot is free. Its linked audio stays put. */
export function setVideoTrack(clips: Clip[], id: string, track: number): Clip[] {
  const c = clips.find((x) => x.id === id);
  if (!c || c.kind !== 'video' || track < 0 || trackOf(c) === track) return clips;
  const busy = videoClips(clips).some((o) => o.id !== id && trackOf(o) === track && o.start < clipEnd(c) - EPS && c.start < clipEnd(o) - EPS);
  return busy ? clips : clips.map((x) => (x.id === id ? { ...x, track, linkId: x.linkId } : x));
}

/** First track at or above `preferred` where a video clip of this length fits at `start`. */
export function freeVideoTrack(clips: Clip[], start: number, duration: number, preferred: number, ignoreId?: string): number {
  for (let t = Math.max(0, preferred); ; t++) {
    if (!videoClips(clips).some((o) => o.id !== ignoreId && trackOf(o) === t && o.start < start + duration - EPS && start < clipEnd(o) - EPS)) return t;
  }
}

/** Copy a clip, and its linked partner, to `start` (video goes on `track` or the first free track above it). */
export function copyClipTo(clips: Clip[], id: string, start: number, track = 0): { clips: Clip[]; id: string | null } {
  const c = clips.find((x) => x.id === id);
  if (!c) return { clips, id: null };
  const group = withPartner(clips, c);
  const l = c.linkId ? nanoid(6) : undefined;
  const vtrack = freeVideoTrack(clips, start, c.duration, track);
  const copies = group.map((g) => ({ ...g, id: nanoid(8), start: start + (g.start - c.start), linkId: g.linkId ? l : undefined, track: g.kind === 'video' ? vtrack : g.track }));
  return { clips: [...clips, ...copies], id: copies.find((x) => x.kind === c.kind)!.id };
}

/**
 * Make a layer from a clip's cut-out: the video only (no audio, no link) on the first free overlay track above it, with the same
 * timing, framing, grade and keyframes and the AI cut-out switched on. The original clip stays underneath as the full-frame
 * background (its own cut-out is switched off), so overlays can be placed between the two or in front of both.
 */
export function createCutoutLayer(clips: Clip[], id: string): { clips: Clip[]; id: string | null } {
  const c = clips.find((x) => x.id === id);
  if (!c || c.kind !== 'video') return { clips, id: null };
  const track = freeVideoTrack(clips, c.start, c.duration, trackOf(c) + 1);
  const fx = migrateVideo(c.fx);
  const matte = { ...DEFAULT_MATTE, ...fx.matte, mode: 'ai' as const, engine: fx.matte?.engine ?? ('precise' as const), background: 'transparent' as const, invert: false };
  const layer: Clip = {
    ...JSON.parse(JSON.stringify(c)), id: nanoid(8), name: `${c.name} · cut-out`, linkId: undefined, track, cutout: true,
    fx: { ...JSON.parse(JSON.stringify(fx)), matte, transitionIn: { id: 'none', duration: 0.5 }, transitionOut: { id: 'none', duration: 0.5 }, keyframes: fx.keyframes.map((k) => ({ ...k, id: nanoid(8) })), effects: fx.effects.map((e) => ({ ...e, id: nanoid(8) })) },
  };
  return { clips: [...clips.map((x) => (x.id === c.id ? { ...x, fx: { ...fx, matte: undefined } } : x)), layer], id: layer.id };
}
