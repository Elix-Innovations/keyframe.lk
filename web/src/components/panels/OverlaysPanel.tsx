import { useRef, useState } from 'react';
import { ImagePlus, Type } from '@/components/icons';
import { useEditor } from '@/store';
import { putBlob } from '@/lib/db';
import { currentTime } from '@/lib/player';
import { BADGES, STICKER_GROUPS, TEXT_PRESETS } from '@/lib/overlays';
import { DRAG_MIME, type DragPayload } from '@/lib/timelineGeo';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Empty, Section, Segmented } from '../controls';
import { overlayOps } from '../OverlayLane';
import type { OverlayItem } from '@/types';

type Tab = 'text' | 'stickers' | 'image';

/** CSS approximation of a text look, for the library tiles. */
function tileStyle(a: Partial<OverlayItem>): React.CSSProperties {
  return {
    color: a.color && a.color.length === 9 ? 'transparent' : a.color ?? '#fff',
    fontWeight: a.bold === false ? 500 : 800,
    fontStyle: a.italic ? 'italic' : undefined,
    WebkitTextStroke: a.strokeWidth ? `${Math.max(1, a.strokeWidth / 4)}px ${a.strokeColor}` : undefined,
    textShadow: a.glow ? `0 0 10px ${a.glow.color}, 0 0 4px ${a.glow.color}` : a.shadow ? '0 2px 6px rgba(0,0,0,0.7)' : undefined,
    background: a.bg ? a.bg.color : undefined,
    borderRadius: a.bg ? `${Math.round(a.bg.radius * 28)}px` : undefined,
    padding: a.bg ? '2px 10px' : undefined,
  };
}

function Tile({ drag, onClick, children, title }: { drag: DragPayload; onClick: () => void; children: React.ReactNode; title: string }) {
  return (
    <button type="button" title={title} draggable onClick={onClick}
      onDragStart={(e) => { e.dataTransfer.setData(DRAG_MIME, JSON.stringify(drag)); e.dataTransfer.effectAllowed = 'copy'; }}
      className="group grid aspect-[3/2] cursor-grab place-items-center overflow-hidden rounded-xl border bg-zinc-800 transition-colors hover:border-primary/60 active:cursor-grabbing">
      {children}
    </button>
  );
}

/** Library of text looks, badges, stickers and image overlays. Click to add at the playhead, or drag onto the timeline. */
export function OverlaysPanel() {
  const [tab, setTab] = useState<Tab>('text');
  const notify = useEditor((s) => s.notify);
  const count = useEditor((s) => s.project!.overlays?.length ?? 0);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const addImages = async (files: FileList | File[]) => {
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        if (!f.type.startsWith('image/')) { notify(`“${f.name}” is not an image.`, 'error'); continue; }
        const bmp = await createImageBitmap(f);
        const assetId = await putBlob(f);
        const st = useEditor.getState();
        overlayOps.add({ kind: 'image', text: f.name.replace(/\.[^.]+$/, ''), assetId, imgW: bmp.width, imgH: bmp.height, start: currentTime(), duration: Math.min(3, Math.max(1, (st.project?.duration ?? 3) - currentTime())) });
        bmp.close();
      }
    } catch (e) {
      notify((e as Error).message || 'Could not add that image.', 'error');
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="border-b px-3 py-2.5">
        <Segmented fill value={tab} onChange={setTab} options={[{ value: 'text', label: 'Text' }, { value: 'stickers', label: 'Stickers' }, { value: 'image', label: 'Image' }]} />
      </div>
      <div className="border-b px-3 py-2.5 text-xs text-muted-foreground">
        Click to add at the playhead, or drag onto the timeline. {count > 0 ? `${count} on the timeline.` : 'Stack several on separate tracks.'}
      </div>
      {tab === 'text' && (
        <>
          <Section title="Add text">
            <Button size="sm" className="h-8" onClick={() => overlayOps.addText('Your text', 'classic')}><Type />New text</Button>
          </Section>
          <Section title="Styles" right={<span className="text-[11px] text-muted-foreground">{TEXT_PRESETS.length}</span>}>
            <div className="grid grid-cols-4 gap-1.5">
              {TEXT_PRESETS.map((p) => (
                <Tile key={p.id} title={p.label} drag={{ type: 'overlay', kind: 'text', text: 'Your text', presetId: p.id }} onClick={() => overlayOps.addText('Your text', p.id)}>
                  <span className="text-base leading-none" style={tileStyle(p.apply)}>{p.sample}</span>
                </Tile>
              ))}
            </div>
          </Section>
          <Section title="Labels" right={<span className="text-[11px] text-muted-foreground">{BADGES.length}</span>}>
            <div className="grid grid-cols-3 gap-1.5">
              {BADGES.map((b) => (
                <Tile key={b.id} title={b.text} drag={{ type: 'overlay', kind: 'text', text: b.text, presetId: b.id }} onClick={() => overlayOps.addText(b.text, b.id)}>
                  <span className="whitespace-nowrap text-[11px] leading-none" style={tileStyle(b.apply)}>{b.text}</span>
                </Tile>
              ))}
            </div>
          </Section>
        </>
      )}
      {tab === 'stickers' && STICKER_GROUPS.map((g) => (
        <Section key={g.label} title={g.label} collapsible>
          <div className="grid grid-cols-8 gap-0.5">
            {g.items.map((s) => (
              <button key={s} type="button" draggable title={s} onClick={() => overlayOps.addSticker(s)}
                onDragStart={(e) => { e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ type: 'overlay', kind: 'sticker', text: s } satisfies DragPayload)); e.dataTransfer.effectAllowed = 'copy'; }}
                className={cn('grid aspect-square cursor-grab place-items-center rounded-md text-xl transition-transform hover:scale-110 hover:bg-sidebar-accent active:cursor-grabbing')}>{s}</button>
            ))}
          </div>
        </Section>
      ))}
      {tab === 'image' && (
        <Section title="Image overlay">
          <button onClick={() => input.current?.click()} disabled={busy}
            className="flex h-14 w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-xs text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-foreground">
            <ImagePlus className="size-4" />{busy ? 'Adding…' : 'Choose images (PNG with transparency works best)'}
          </button>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) void addImages(e.target.files); e.target.value = ''; }} />
          <Empty icon={<ImagePlus />} title="Logos, watermarks, cut-outs">Images sit above the video: move, resize, rotate, fade and animate them like text.</Empty>
        </Section>
      )}
      {tab === 'image' && (
        <Section title="Phone screen">
          <p className="text-[11px] text-muted-foreground">Fill a phone screen in your clip with a scrolling social feed that stops on your ad. Pin its four corners to the screen, then add posts and photos.</p>
          <Button size="sm" className="h-8" onClick={() => overlayOps.addScreen()}>Add phone screen</Button>
        </Section>
      )}
    </div>
  );
}
