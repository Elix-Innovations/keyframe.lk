import { ALL_FORMATS, BlobSource, BufferTarget, CanvasSink, CanvasSource, Input, Output, QUALITY_HIGH, WebMOutputFormat } from 'mediabunny';
import type { Clip } from '../types';
import { analysisStatus, loadPrecise, loadSegmenter, matteHints, prepareCutout, processSource, yieldToPlayback } from '../render/matte';
import type { FrameSource } from '../render/compose';
import { getBlob, putBlob } from './db';
import { migrateVideo } from './videoFx';
import { sourceTimeAt } from './clips';

const FPS = 30;
const MAX_W = 1080;

/** Clips whose cut-out is being extracted right now; preview playback skips their live matte so it stays smooth. */
export const extracting = new Set<string>();

/**
 * Render a clip's cut-out (its subject on a transparent background, with the clip's matte settings) into a new transparent
 * video file and store it as a new asset. The result is an ordinary video: the layer made from it plays and exports with no live matting.
 */
export async function extractCutout(clip: Clip, onProgress: (p: number) => void, signal?: AbortSignal): Promise<{ assetId: string; width: number; height: number }> {
  const layer = migrateVideo(clip.fx);
  const m = layer.matte;
  if (!m || m.mode === 'none') throw new Error('This layer has no cut-out to extract.');
  const blob = await getBlob(clip.assetId);
  if (!blob) throw new Error('The video file is missing from local storage.');
  const from = clip.in, to = clip.in + clip.duration * clip.speed;
  if (m.mode === 'ai') {
    if ((m.engine ?? 'precise') === 'precise') {
      await loadPrecise();
      if (analysisStatus(clip.assetId).state !== 'done') {
        // Matting is the slow part: it fills the first 80% of the progress.
        const tick = setInterval(() => onProgress(analysisStatus(clip.assetId).progress * 0.8), 300);
        try { await prepareCutout(clip.assetId, blob, from, to); } finally { clearInterval(tick); }
      }
      const st = analysisStatus(clip.assetId);
      if (st.state === 'error') throw new Error(st.error);
    } else await loadSegmenter();
  }
  signal?.throwIfAborted();

  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track || !(await track.canDecode())) throw new Error('This browser cannot decode the video.');
  const sink = new CanvasSink(track, { width: Math.min(MAX_W, track.displayWidth) });
  const n = Math.max(1, Math.round(clip.duration * FPS));
  const ts = Array.from({ length: n }, (_, k) => Math.max(0, Math.min(sourceTimeAt(clip, clip.start + k / FPS), clip.sourceDuration - 0.002)));

  let canvas: OffscreenCanvas | null = null, ctx: OffscreenCanvasRenderingContext2D | null = null;
  let output: Output<WebMOutputFormat, BufferTarget> | null = null, vsrc: CanvasSource | null = null;
  const wasPlaying = matteHints.playing;
  matteHints.playing = false;
  let k = 0;
  let finalized = false;
  try {
    for await (const wrapped of sink.canvasesAtTimestamps(ts)) {
      signal?.throwIfAborted();
      await yieldToPlayback();
      const fc = wrapped?.canvas;
      if (fc) {
        if (!canvas) {
          // Even dimensions for the encoder.
          canvas = new OffscreenCanvas(fc.width & ~1, fc.height & ~1);
          ctx = canvas.getContext('2d', { alpha: true })!;
          output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
          vsrc = new CanvasSource(canvas, { codec: 'vp9', alpha: 'keep', bitrate: QUALITY_HIGH });
          output.addVideoTrack(vsrc, { frameRate: FPS });
          await output.start();
        }
        const src: FrameSource = { w: fc.width, h: fc.height, draw: (x, dx, dy, dw, dh) => x.drawImage(fc, dx, dy, dw, dh) };
        const out = processSource('extract', src, { matte: m, regionBlurs: layer.regionBlurs }, k / FPS, { asset: clip.assetId, srcT: ts[k] });
        ctx!.clearRect(0, 0, canvas.width, canvas.height);
        out.draw(ctx!, 0, 0, canvas.width, canvas.height);
        await vsrc!.add(k / FPS, 1 / FPS);
      }
      k++;
      if (k % 4 === 0) onProgress(0.8 + 0.2 * (k / n));
    }
    if (!output || !vsrc) throw new Error('No frames could be read from the video.');
    vsrc.close();
    await output.finalize();
    finalized = true;
    const assetId = await putBlob(new Blob([output.target.buffer!], { type: 'video/webm' }));
    return { assetId, width: canvas!.width, height: canvas!.height };
  } finally {
    matteHints.playing = wasPlaying;
    if (!finalized) await output?.cancel().catch(() => {});
    input.dispose();
  }
}
