import { useEditor } from '../store';
import { previewAudio } from '../audio/preview';
import { videoLayersAt, sourceTimeAt, videoClips } from './clips';
import { curveSpeedAt } from './speedCurve';
import { allVideos, peekVideo } from './videoPool';

/**
 * Timeline playback. The master clock is wall time while playing; the hidden video elements
 * (see videoPool) are slaved to it, so gaps, cuts and speed changes all play correctly.
 */
let playing = false;
let anchorPerf = 0;
let anchorT = 0;
let stopAt: number | null = null;
let raf = 0;
let lastPush = 0;

const dur = () => useEditor.getState().project?.duration ?? 0;

export function currentTime() {
  if (!playing) return useEditor.getState().time;
  return Math.min(dur(), anchorT + (performance.now() - anchorPerf) / 1000);
}

function pushTime(force = false) {
  const now = performance.now();
  if (force || now - lastPush > 50) { lastPush = now; useEditor.getState().setTime(currentTime()); }
}

// Scrubbing fires seeks faster than a decoder can land them. Keep only the newest target per element and apply it when the current seek ends.
const wantSeek = new WeakMap<HTMLVideoElement, number>();
const hooked = new WeakSet<HTMLVideoElement>();
function seekLatest(el: HTMLVideoElement, t: number) {
  if (!hooked.has(el)) {
    hooked.add(el);
    el.addEventListener('seeked', () => {
      const n = wantSeek.get(el);
      if (n === undefined) return;
      wantSeek.delete(el);
      if (Math.abs(el.currentTime - n) > 0.005) el.currentTime = n;
    });
  }
  if (el.seeking) { wantSeek.set(el, t); return; }
  wantSeek.delete(el);
  el.currentTime = t;
}

/** Point every video element at the right frame for timeline time t (one per visible clip, so overlay tracks decode too). */
export function syncVideos(t = currentTime()) {
  const p = useEditor.getState().project;
  const active = videoLayersAt(p?.clips ?? [], t);
  const used = new Set<HTMLVideoElement>();
  for (const clip of active) {
    const el = peekVideo(clip.assetId, clip.track ?? 0);
    if (!el) continue;
    used.add(el);
    const want = Math.max(0, Math.min(sourceTimeAt(clip, t), (el.duration || clip.sourceDuration) - 0.001));
    if (playing && !clip.freeze && !clip.reverse) { // a reversed clip cannot play forward: it seeks frame by frame below
      const rate = Math.min(16, Math.max(0.0625, clip.curve ? curveSpeedAt({ ...clip, curve: clip.curve }, t - clip.start) : clip.speed));
      if (el.playbackRate !== rate) el.playbackRate = rate;
      if (Math.abs(el.currentTime - want) > 0.25) el.currentTime = want;
      if (el.paused) void el.play().catch(() => {});
    } else {
      if (!el.paused) el.pause();
      if (Math.abs(el.currentTime - want) > 0.005 || el.seeking) seekLatest(el, want);
    }
  }
  for (const { el } of allVideos()) if (!used.has(el) && !el.paused) el.pause();
}

function loop() {
  if (!playing) return;
  const t = currentTime();
  if (t >= dur() - 1e-3 || (stopAt !== null && t >= stopAt)) {
    const end = stopAt;
    pause();
    stopAt = null;
    if (end !== null) { const e = Math.min(end, dur()); useEditor.getState().setTime(e); syncVideos(e); }
    return;
  }
  syncVideos(t);
  pushTime();
  raf = requestAnimationFrame(loop);
}

export function seek(t: number) {
  const d = dur();
  const clamped = Math.max(0, Math.min(t, d || t));
  useEditor.getState().setTime(clamped);
  if (playing) { anchorT = clamped; anchorPerf = performance.now(); void previewAudio.start(); }
  syncVideos(clamped);
}

export function play() {
  if (playing || dur() <= 0) return;
  let t = useEditor.getState().time;
  if (t >= dur() - 0.05) t = 0;
  anchorT = t; anchorPerf = performance.now();
  playing = true;
  useEditor.getState().setTime(t);
  useEditor.getState().setPlaying(true);
  void previewAudio.start();
  loop();
}

export function pause() {
  stopAt = null; // a manual pause must not leave a stale range end for the next play
  if (!playing) return;
  const t = currentTime();
  playing = false;
  cancelAnimationFrame(raf);
  previewAudio.stop();
  useEditor.getState().setTime(t);
  useEditor.getState().setPlaying(false);
  syncVideos(t);
}

export function togglePlay() {
  if (playing) pause(); else play();
}

/** Play a range once (used by "play caption"). */
export function playRange(start: number, end: number) {
  pause();
  seek(start);
  stopAt = end;
  play();
}

/** Play from the In point to the Out point once; a missing mark falls back to the clip start or end. */
export function playInToOut() {
  const { markIn, markOut } = useEditor.getState();
  playRange(markIn ?? 0, markOut ?? dur());
}

export { videoClips };
