import { useEffect, useRef } from 'react';
import type { FontDef } from '@/types';
import { cssFamily, ensureFont, onFontsChanged } from '@/lib/fonts';
import { fmPieces } from '@/render/fmShape';

/**
 * FM (legacy-encoded) text drawn on a canvas through the FM mark-positioning engine, so vowel signs sit
 * where they do in exported captions. Plain HTML text would show the fonts' raw, misplaced marks.
 */
export function FmText({ text, font, size = 28, color = '#FFFFFF', className }: { text: string; font: FontDef; size?: number; color?: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = c.clientWidth;
      const ctx = c.getContext('2d')!;
      const family = cssFamily(font);
      ctx.font = `400 ${size}px ${family}`;
      // Greedy word wrap to the canvas width.
      const lines: string[] = [];
      let cur = '';
      for (const w of text.split(/\s+/).filter(Boolean)) {
        const next = cur ? `${cur} ${w}` : w;
        if (cur && ctx.measureText(next).width > W) { lines.push(cur); cur = w; } else cur = next;
      }
      if (cur) lines.push(cur);
      const lh = size * 1.45;
      const H = Math.max(1, lines.length) * lh + size * 0.35;
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `400 ${size}px ${family}`;
      ctx.fillStyle = color;
      ctx.textBaseline = 'alphabetic';
      lines.forEach((line, i) => {
        const y = size * 1.1 + i * lh;
        const pieces = fmPieces(ctx, family, line);
        if (!pieces) ctx.fillText(line, 0, y);
        else for (const p of pieces) ctx.fillText(p.text, p.dx, y + p.dy * size);
      });
    };
    ensureFont(font.id).then(draw);
    const off = onFontsChanged(draw);
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    draw();
    return () => { off(); ro.disconnect(); };
  }, [text, font, size, color]);
  return <canvas ref={ref} className={className} style={{ width: '100%', display: 'block' }} />;
}
