import { useEditor } from '@/store';
import { buildMixPlan } from './mix';
import { loadAudioAsset, masterLimiter, scheduleMix, type ScheduledNodes } from './graph';
import { prepareClipAudio, scheduleClipAudio } from './clips';
import { getSfx } from './sfx';
import { currentTime } from '@/lib/player';
import { beforeProject } from '@/lib/before';
import { laneOf } from '@/lib/videoFx';

/**
 * Live soundtrack for the editor preview. Every sound is scheduled from the project: audio clips
 * (the video's own voice included, time-stretched for speed), music tracks and effects, through a limiter.
 * The video elements are muted. Re-scheduled on play, seek and edits.
 */
class PreviewAudio {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  private running: ScheduledNodes | null = null;
  private token = 0;
  /** Timeline time `from` is rendered at context time `at` (set once the current schedule is running). */
  private sched: { from: number; at: number } | null = null;

  private ensure() {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    const limiter = masterLimiter(ctx);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    limiter.connect(this.analyser).connect(ctx.destination);
    this.bus = ctx.createGain();
    this.bus.connect(limiter);
    this.ctx = ctx;
    return ctx;
  }

  async start() {
    const st = useEditor.getState();
    const p = st.project && (st.before ? beforeProject(st.project) : st.project);
    if (!p) return;
    const ctx = this.ensure();
    await ctx.resume();
    this.stop();
    const my = ++this.token;
    const plan = buildMixPlan(p);
    // Warm caches first so the start time we compute below is accurate.
    const [prepared] = await Promise.all([
      prepareClipAudio(p),
      ...plan.tracks.map((t) => loadAudioAsset(t.track.assetId).catch(() => null)),
      ...[...new Set(plan.sfx.map((e) => e.id))].map(getSfx),
    ]);
    if (my !== this.token || !useEditor.getState().playing) return;
    const at = ctx.currentTime + 0.03;
    // Sound leaves the speakers some time after it is rendered (about 20 ms wired, 150 ms or more over Bluetooth).
    // Start the audio that much further ahead so there is no jump when the player switches to heardTime() below.
    const from = currentTime() + 0.03 + this.latency(ctx);
    const clipNodes = scheduleClipAudio(ctx, p, this.bus!, prepared, from, at);
    const mixNodes = await scheduleMix(ctx, plan, this.bus!, from, at);
    this.running = { stop: () => { clipNodes.stop(); mixNodes.stop(); } };
    if (my !== this.token) { this.running.stop(); this.running = null; return; }
    this.sched = { from, at };
  }

  stop() {
    this.token++;
    this.running?.stop();
    this.running = null;
    this.sched = null;
  }

  /** Output delay of the audio device: base (processing) plus output (hardware/Bluetooth) latency. */
  private latency(ctx: AudioContext) {
    return Math.min(0.5, Math.max(0, (ctx.baseLatency || 0) + (ctx.outputLatency || 0)));
  }

  /**
   * The timeline time that is coming out of the speakers right now, from the audio hardware clock, or null when no
   * soundtrack is playing. The player follows this while playing, so captions and picture match what is heard,
   * whatever the device latency and however the audio clock drifts against the system clock.
   */
  heardTime(): number | null {
    const ctx = this.ctx, s = this.sched;
    if (!ctx || !s || ctx.state !== 'running') return null;
    const ts = ctx.getOutputTimestamp?.();
    const ctxNow = ts && ts.contextTime !== undefined && ts.performanceTime
      // contextTime is being heard at performanceTime; carry it forward to now.
      ? ts.contextTime + (performance.now() - ts.performanceTime) / 1000
      : ctx.currentTime - this.latency(ctx);
    if (ctxNow < s.at) return null; // not audible yet
    return s.from + (ctxNow - s.at);
  }

  /** Current output level in dBFS (for the meter). */
  level(): number {
    if (!this.analyser) return -Infinity;
    const d = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(d);
    let p = 0;
    for (const v of d) { const a = Math.abs(v); if (a > p) p = a; }
    return p > 0 ? 20 * Math.log10(p) : -Infinity;
  }
}

export const previewAudio = new PreviewAudio();

// Re-schedule when anything that affects the soundtrack changes during playback.
let timer: ReturnType<typeof setTimeout> | null = null;
useEditor.subscribe((s, prev) => {
  if (s.before !== prev.before && s.playing) void previewAudio.start();
  const p = s.project, q = prev.project;
  if (!p || !q || p === q) return;
  const changed = p.clips !== q.clips || laneOf(p, 'audio').muted !== laneOf(q, 'audio').muted || p.audio.original !== q.audio.original || p.audio.tracks !== q.audio.tracks || p.audio.ducking !== q.audio.ducking ||
    p.audio.normalize !== q.audio.normalize || p.audio.sfx !== q.audio.sfx || (p.audio.sfx.enabled && (p.captions !== q.captions || p.hook !== q.hook)) ||
    (p.audio.ducking.enabled && p.captions !== q.captions);
  if (!changed || !s.playing) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void previewAudio.start(), 150);
});
