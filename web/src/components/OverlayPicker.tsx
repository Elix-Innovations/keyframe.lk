import { useEffect, useRef, useState } from 'react';
import { ChevronsUpDown } from '@/components/icons';
import type { OverlayItem } from '@/types';
import { useEditor } from '@/store';
import { makeOverlay } from '@/lib/overlays';
import { drawOverlays } from '@/render/overlays';
import { getBlob } from '@/lib/db';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';

const W = 320, H = 192, DUR = 2.2;

/** Small bitmaps of the user's own images, shared by every sample tile. */
const thumbs = new Map<string, Promise<ImageBitmap | null>>();
const thumbOf = (id: string) => {
  let p = thumbs.get(id);
  if (!p) { p = getBlob(id).then((b) => (b ? createImageBitmap(b, { resizeWidth: 480, resizeQuality: 'high' }) : null)).catch(() => null); thumbs.set(id, p); }
  return p;
};

/** A small canvas that draws a sample overlay with the real renderer; it plays in a loop while hovered. */
export function OverlaySample({ spec, hover, className }: { spec: Partial<OverlayItem>; hover: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(spec);
  const [img, setImg] = useState<ImageBitmap | null>(null);
  useEffect(() => {
    let live = true;
    if (spec.assetId) void thumbOf(spec.assetId).then((b) => { if (live) setImg(b); });
    return () => { live = false; };
  }, [spec.assetId]);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    const project = useEditor.getState().project;
    if (!ctx || !project) return;
    const item = makeOverlay({ kind: 'text', text: 'Aa', start: 0, duration: DUR, apply: { scale: spec.kind === 'image' ? 0.6 : spec.kind === 'sticker' ? 2.4 : 5.5, x: 50, y: 50, animIn: { id: 'none', duration: 0.5 }, animOut: { id: 'none', duration: 0.5 }, ...spec } }, []);
    const fake = { ...project, overlays: [item], lanes: {} };
    const draw = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#3a4256'); g.addColorStop(1, '#1b1f2a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      drawOverlays(ctx, W, H, fake, t, img && spec.assetId ? new Map([[spec.assetId, img]]) : undefined);
    };
    if (!hover) { draw(DUR * 0.5); return; }
    let raf = 0;
    const t0 = performance.now();
    const loop = () => { draw(((performance.now() - t0) / 1000) % (DUR + 0.4)); raf = requestAnimationFrame(loop); };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [key, hover, img]);
  return <canvas ref={ref} width={W} height={H} className={cn('block aspect-[5/3] w-full rounded-lg', className)} />;
}

export interface PickerOption { id: string; label: string; spec: Partial<OverlayItem> }

/** Dropdown whose options are live previews: hover one to see it play. */
export function PreviewPicker({ value, options, onChange, placeholder, cols = 3, className }: {
  value?: string; options: PickerOption[]; onChange: (id: string) => void; placeholder?: string; cols?: 2 | 3; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hot, setHot] = useState<string | null>(null);
  const cur = options.find((o) => o.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn('flex h-7 w-36 items-center justify-between gap-2 rounded-md bg-muted px-2 text-left text-xs hover:bg-accent', className)}>
          <span className="truncate">{cur?.label ?? placeholder ?? 'Choose'}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <ScrollArea className="h-80">
          <div className={cn('grid gap-2 p-2', cols === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
            {options.map((o) => (
              <button key={o.id} type="button" onMouseEnter={() => setHot(o.id)} onMouseLeave={() => setHot(null)} onClick={() => { onChange(o.id); setOpen(false); }}
                className={cn('overflow-hidden rounded-lg border text-left transition-colors', o.id === value ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/50')}>
                <OverlaySample spec={o.spec} hover={hot === o.id} className="rounded-none" />
                <div className="truncate px-1.5 py-1 text-[11px]">{o.label}</div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
