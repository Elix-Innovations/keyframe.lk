import { BufferTarget, CanvasSource, Output, QUALITY_VERY_HIGH, WebMOutputFormat } from 'mediabunny';
import type { MotionScene, Project } from '../types';
import { drawScene, sceneFontIds } from '../render/scene';
import { ensureFonts } from './fonts';
import { downloadBlob, projectFontIds, safeFilename } from './util';

const FPS = 30;

/** Render one motion scene alone, on a transparent background, to a VP9 WebM with alpha. */
export async function renderSceneWebm(scene: MotionScene, project: Project, onProgress?: (p: number) => void): Promise<Blob> {
  await ensureFonts([...projectFontIds(project), ...sceneFontIds(scene)]);
  const frame = scene.frame ?? { w: 1080, h: 1920 };
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const width = even(frame.w), height = even(frame.h);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('Could not create a 2D canvas.');
  const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
  const vsrc = new CanvasSource(canvas, { codec: 'vp9', bitrate: QUALITY_VERY_HIGH, alpha: 'keep' });
  output.addVideoTrack(vsrc, { frameRate: FPS });
  await output.start();
  try {
    const frames = Math.max(1, Math.round(scene.duration * FPS));
    for (let k = 0; k < frames; k++) {
      ctx.clearRect(0, 0, width, height);
      drawScene(ctx, width, height, scene, Math.min(k / FPS, scene.duration - 0.001), { fonts: { english: project.style.text.englishFont, sinhala: project.style.text.sinhalaFont } });
      await vsrc.add(k / FPS, 1 / FPS);
      if (k % 8 === 0) onProgress?.(k / frames);
    }
    vsrc.close();
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => {});
    throw e;
  }
  onProgress?.(1);
  return new Blob([(output.target as BufferTarget).buffer!], { type: 'video/webm' });
}

/** Render a scene and save it as `<name>.webm`. */
export async function downloadScene(scene: MotionScene, project: Project, onProgress?: (p: number) => void) {
  const blob = await renderSceneWebm(scene, project, onProgress);
  downloadBlob(blob, `${safeFilename(scene.name)}.webm`);
}
