import { useEffect, useRef } from 'react';
import type { Caption, CaptionStyle } from '../types';
import { renderCaptionAt } from '../render/captions';
import { ensureFonts, onFontsChanged } from '../lib/fonts';

const SAMPLE: Caption = {
  id: 'sample',
  start: 0,
  end: 3,
  words: [
    { id: 'a', text: 'මේක', start: 0, end: 0.4 },
    { id: 'b', text: 'සුපිරි', start: 0.4, end: 0.8 },
    { id: 'c', text: 'style', start: 0.8, end: 1.2 },
    { id: 'd', text: 'එකක්', start: 1.2, end: 1.8 },
  ],
};

/** Creative layouts need a few words to show their line pattern, with an English key word. */
const SAMPLE_CREATIVE: Caption = {
  id: 'sample-creative',
  start: 0,
  end: 2.7,
  words: [
    { id: 'a', text: 'මේ', start: 0, end: 0.3 },
    { id: 'b', text: 'Effect', start: 0.3, end: 0.7, emphasize: true },
    { id: 'c', text: 'එක', start: 0.7, end: 1.0 },
    { id: 'd', text: 'දැකලා', start: 1.0, end: 1.3 },
    { id: 'e', text: 'තියෙනවා', start: 1.3, end: 1.8 },
  ],
};

/** Small live canvas rendering of a caption style. Animates while `animate` is true. */
export function StylePreview({ style, animate = false, height = 110 }: { style: CaptionStyle; animate?: boolean; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(c.clientWidth * dpr), H = Math.round(height * dpr);
    c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    const refScale = Math.min(W, H) / 1080;
    // Scale from the style's own size (templates normalise it per font), so previews compare fairly.
    const creative = !!style.creative;
    const target = H * (creative ? 0.11 : 0.17) * Math.min(1.35, Math.max(0.7, style.text.fontSize / 64));
    const preview: CaptionStyle = {
      ...style,
      // A still preview shows the settled look, not a frame caught mid-animation.
      ...(animate ? {} : { animation: 'none' as const, wordAnimation: 'none' as const }),
      wordsPerChunk: creative ? 5 : style.displayMode === 'word-by-word' ? Math.max(style.wordsPerChunk, 2) : 4,
      ...(creative && !animate ? { creative: { ...style.creative!, lineAnim: 'none' as const, outAnim: 'none' as const, stagger: 0 } } : {}),
      text: { ...style.text, fontSize: target / refScale },
      layout: { ...style.layout, x: 50, y: 50, maxWidth: 96 },
    };
    let raf = 0;
    let alive = true;
    const start = performance.now();
    const paint = () => {
      if (!alive) return;
      const t = animate ? ((performance.now() - start) / 1000) % (creative ? 3 : 2.2) : 0.55;
      ctx.clearRect(0, 0, W, H);
      renderCaptionAt(ctx, W, H, [creative ? SAMPLE_CREATIVE : SAMPLE], preview, creative ? (animate ? t : 2) : t);
    };
    // One rAF chain per run; font callbacks only repaint (the running loop repaints anyway when animating).
    const tick = () => {
      if (!alive) return;
      paint();
      raf = requestAnimationFrame(tick);
    };
    ensureFonts([style.text.sinhalaFont, style.text.englishFont]).then(paint);
    const off = onFontsChanged(paint);
    if (animate) tick(); else paint();
    return () => { alive = false; cancelAnimationFrame(raf); off(); };
  }, [style, animate, height]);
  return <canvas ref={ref} className="block w-full" style={{ height }} />;
}
