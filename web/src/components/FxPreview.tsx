import { useEffect, useRef, useState } from 'react';
import type { Clip, EffectInstance, Project, TransitionId, VideoFilters } from '@/types';
import { useEditor } from '@/store';
import { composeFrame } from '@/render/compose';
import { migrateVideo } from '@/lib/videoFx';
import { refreshPreviewSource, usePreviewSource } from '@/lib/fxPreviewSource';
import { onVideoFrame } from '@/lib/videoPool';
import { cn } from '@/lib/utils';

export interface FxSpec {
  filters?: VideoFilters;
  effects?: EffectInstance[];
  transition?: TransitionId;
}

const W = 168, H = 126, SCALE = 3;

/** Length of the looped preview clip, and the still shown when the tile is not hovered. */
function timing(spec: FxSpec) {
  if (spec.transition) return { dur: 2.4, still: 0.42 };
  if (spec.effects?.length) return { dur: 3, still: 0.9 };
  return { dur: 2, still: 1 };
}

/** A tile that renders your current frame through the real compositor: the same code the preview and export use. */
export function FxPreview({ spec, hover, className }: { spec: FxSpec; hover: boolean; className?: string }) {
  const { bmp, version } = usePreviewSource();
  const ref = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const specKey = JSON.stringify(spec);
  const backdrop = useEditor((st) => `${st.project?.fit}${st.project?.fitColor}`);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !bmp || !visible) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { dur, still } = timing(spec);
    const project = useEditor.getState().project!;
    const clip: Clip = {
      id: 'preview', kind: 'video', assetId: 'preview', name: '', sourceDuration: dur, start: 0, in: 0, duration: dur, speed: 1, volume: 0, fadeIn: 0, fadeOut: 0,
      fx: migrateVideo({
        filters: spec.filters, effects: spec.effects,
        transitionIn: { id: spec.transition ?? 'none', duration: 0.9 },
      }),
    };
    const fake: Project = {
      ...project, clips: [clip], lanes: {}, captions: [], broll: [], overlays: [], hook: { ...project.hook, enabled: false },
      // Transition tiles show the project's own backdrop (blur, colour or black) where the shot moves off the frame.
      fit: spec.transition ? project.fit : 'cover',
      duration: dur, video: undefined, videoWidth: bmp.width, videoHeight: bmp.height,
    };
    const draw = (t: number) => {
      composeFrame(ctx, W * SCALE, H * SCALE, fake, t, (c, dx, dy, dw, dh) => c.drawImage(bmp, dx, dy, dw, dh), {
        hideCaptions: true, hideBroll: true, hideOverlays: true, videoSize: { w: bmp.width, h: bmp.height },
      });
    };
    if (!hover) { draw(still); return; }
    let raf = 0;
    const t0 = performance.now();
    const loop = () => { draw(((performance.now() - t0) / 1000) % dur); raf = requestAnimationFrame(loop); };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [bmp, version, visible, hover, specKey, backdrop]); // eslint-disable-line react-hooks/exhaustive-deps

  return <canvas ref={ref} width={W * SCALE} height={H * SCALE} className={cn('block aspect-[4/3] w-full bg-muted', className)} />;
}

/** Keeps the shared still in step with the playhead while a preview panel is open. */
export function usePreviewSourceSync() {
  const time = useEditor((s) => s.time);
  const playing = useEditor((s) => s.playing);
  const clipKey = useEditor((s) => s.project?.clips?.map((c) => `${c.id}${c.start}${c.in}`).join('|'));
  useEffect(() => {
    if (playing) return;
    const id = setTimeout(() => void refreshPreviewSource(), 200);
    return () => clearTimeout(id);
  }, [time, playing, clipKey]);
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const off = onVideoFrame(() => { clearTimeout(id); id = setTimeout(() => { if (!useEditor.getState().playing) void refreshPreviewSource(); }, 120); });
    void refreshPreviewSource();
    return () => { off(); clearTimeout(id); };
  }, []);
}
