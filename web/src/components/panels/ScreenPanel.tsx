import { useMemo, useRef } from 'react';
import { nanoid } from 'nanoid';
import { Trash2 } from '@/components/icons';
import { clipOps } from '@/components/ClipLane';
import { trackOf, videoClips } from '@/lib/clips';
import { toast } from 'sonner';
import { useEditor } from '@/store';
import type { FeedPost, OverlayItem, ScreenSpec } from '@/types';
import { putBlob } from '@/lib/db';
import { currentTime, seek } from '@/lib/player';
import { quadAt, setQuadAt } from '@/lib/screen';
import { EASES } from '@/lib/videoFx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Row, Section, Slider } from '../controls';

const num = (v: string, fallback: number) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fallback; };
const NONE = '__none__';
const UPLOADED = '__uploaded__';

/** A photo for a post or the page avatar: one from the media library, or a file from the computer. */
function PhotoPick({ assetId, onPick }: { assetId?: string; onPick: (a: { assetId?: string; w?: number; h?: number }) => void }) {
  const lib = useEditor((s) => s.project?.library); // select the stored reference: a fresh [] from the selector would loop forever
  const library = useMemo(() => (lib ?? []).filter((i) => i.kind === 'image'), [lib]);
  const notify = useEditor((s) => s.notify);
  const input = useRef<HTMLInputElement>(null);
  const upload = async (f: File) => {
    try {
      const bmp = await createImageBitmap(f);
      const id = await putBlob(f);
      onPick({ assetId: id, w: bmp.width, h: bmp.height });
      bmp.close();
    } catch (e) { notify((e as Error).message || 'Could not add that image.', 'error'); }
  };
  const choose = async (id: string) => {
    if (id === UPLOADED) return;
    if (id === NONE) { onPick({}); return; }
    const item = library.find((i) => i.assetId === id);
    const { getBlob } = await import('@/lib/db');
    const blob = await getBlob(id);
    const bmp = blob ? await createImageBitmap(blob).catch(() => null) : null;
    onPick({ assetId: item?.assetId ?? id, w: bmp?.width, h: bmp?.height });
    bmp?.close();
  };
  return (
    <div className="flex items-center gap-1.5">
      <Select value={!assetId ? NONE : library.some((i) => i.assetId === assetId) ? assetId : UPLOADED} onValueChange={(v) => void choose(v)}>
        <SelectTrigger size="sm" className="w-32"><SelectValue placeholder={assetId ? 'Uploaded image' : 'No photo'} /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No photo</SelectItem>
          {assetId && !library.some((i) => i.assetId === assetId) && <SelectItem value={UPLOADED}>Uploaded image</SelectItem>}
          {library.map((i) => <SelectItem key={i.id} value={i.assetId}>{i.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button size="xs" variant="secondary" onClick={() => input.current?.click()}>Upload</Button>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
    </div>
  );
}

/** The selected phone-screen layer: the feed's posts and ad, when it scrolls and stops, and the pinned corners. */
export function ScreenEdit({ o, patch }: { o: OverlayItem; patch: (p: Partial<OverlayItem>, key?: string) => void }) {
  useEditor((s) => s.time); // re-render as the playhead moves so the pin highlight follows it
  const spec = o.screen;
  if (!spec) return null;
  const set = (fn: (s: ScreenSpec) => ScreenSpec, key?: string) => patch({ screen: fn(spec) }, key && `scr-${key}`);
  const ltNow = () => Math.min(o.duration, Math.max(0, currentTime() - o.start)); // read at click time, not render time
  const lt = ltNow();
  const editPost = (id: string, p: Partial<FeedPost>, key?: string) => set((s) => ({ ...s, feed: { ...s.feed, posts: s.feed.posts.map((x) => (x.id === id ? { ...x, ...p } : x)) } }), key);
  const pins = [...spec.quad].sort((a, b) => a.t - b.t);
  const pinHere = () => { const t = ltNow(); set((s) => ({ ...s, quad: setQuadAt(s.quad, t, quadAt(s.quad, t)) })); };
  const posts = spec.feed.posts;
  const keepHands = () => {
    const st = useEditor.getState();
    const end = o.start + o.duration;
    const under = videoClips(st.project?.clips ?? []).filter((c) => !c.cutout && c.start < end && c.start + c.duration > o.start && trackOf(c) <= o.track)
      .sort((a, b) => a.start - b.start);
    if (!under.length) { toast.error('No video clip is under this screen layer.'); return; }
    // One hands layer per clip the screen runs over, so every part of the shot (including a frozen end) keeps its fingers in front.
    for (const c of under) clipOps.createCutout(c.id, { hands: true, above: o.track + 1, from: o.start, to: end });
  };
  return (
    <>
      <Section title="Hands">
        <p className="text-[11px] text-muted-foreground">Make a copy of the video that keeps only the hands and fingers, placed in front of this screen so they cover the feed. Use it after the corners are pinned.</p>
        <Button size="xs" variant="secondary" onClick={keepHands}>Keep hands in front</Button>
      </Section>
      <Section title="Screen corners" right={<Button size="xs" variant="secondary" onClick={pinHere}>◆ Pin at playhead</Button>}>
        <p className="text-[11px] text-muted-foreground">Drag the four dots in the preview onto the corners of the phone screen. Move the playhead and drag them again as the phone moves; the feed follows between pins.</p>
        <div className="flex flex-wrap gap-1">
          {pins.map((k) => (
            <button key={k.id} type="button" onClick={() => seek(o.start + k.t)}
              className={`rounded-md px-2 py-0.5 font-mono text-[11px] ${Math.abs(k.t - lt) < 0.05 ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>◆ {k.t.toFixed(2)}s</button>
          ))}
        </div>
        {pins.length > 1 && (
          <div className="flex justify-end gap-1">
            <Button size="xs" variant="ghost" className="hover:text-destructive" disabled={!pins.some((k) => Math.abs(k.t - lt) < 0.05)}
              onClick={() => { const t = ltNow(); set((s) => ({ ...s, quad: s.quad.filter((k) => Math.abs(k.t - t) >= 0.05) })); }}><Trash2 />Delete pin here</Button>
          </div>
        )}
        <Row label="Screen corners"><Slider value={spec.corner} min={0} max={20} format={(v) => `${v}%`} onChange={(corner) => set((s) => ({ ...s, corner }), 'corner')} /></Row>
      </Section>
      <Section title="Scroll">
        <Row label="Starts (s)"><Input type="number" step={0.1} min={0} className="h-7 w-24 text-xs" value={Number(spec.scroll.start.toFixed(2))}
          onChange={(e) => set((s) => ({ ...s, scroll: { ...s.scroll, start: Math.max(0, Math.min(s.scroll.stop - 0.1, num(e.target.value, s.scroll.start))) } }), 'ss')} /></Row>
        <Row label="Stops (s)" hint="The feed settles on the ad at this moment and stays there.">
          <Input type="number" step={0.1} min={0.1} className="h-7 w-24 text-xs" value={Number(spec.scroll.stop.toFixed(2))}
            onChange={(e) => set((s) => ({ ...s, scroll: { ...s.scroll, stop: Math.max(s.scroll.start + 0.1, num(e.target.value, s.scroll.stop)) } }), 'se')} />
          <Button size="xs" variant="secondary" onClick={() => set((s) => ({ ...s, scroll: { ...s.scroll, stop: Math.max(s.scroll.start + 0.1, ltNow()) } }))}>At playhead</Button>
        </Row>
        <Row label="Easing">
          <Select value={spec.scroll.ease} onValueChange={(ease) => set((s) => ({ ...s, scroll: { ...s.scroll, ease: ease as ScreenSpec['scroll']['ease'] } }))}>
            <SelectTrigger size="sm" className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{EASES.filter((e) => e.id !== 'hold').map((e) => <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>)}</SelectContent>
          </Select>
        </Row>
      </Section>
      <Section title="Page">
        <Row label="Page name"><Input className="h-7 text-xs" value={spec.feed.pageName} onChange={(e) => set((s) => ({ ...s, feed: { ...s.feed, pageName: e.target.value } }), 'name')} /></Row>
        <Row label="Avatar"><PhotoPick assetId={spec.feed.avatarAssetId} onPick={(a) => set((s) => ({ ...s, feed: { ...s.feed, avatarAssetId: a.assetId } }))} /></Row>
      </Section>
      <Section title="Posts" right={<Button size="xs" variant="secondary"
        onClick={() => set((s) => { const p = s.feed.posts; const add: FeedPost = { id: nanoid(6), text: 'New post', likes: 56, comments: 4, time: '2d' }; return { ...s, feed: { ...s.feed, posts: [...p.slice(0, -1), add, ...p.slice(-1)] } }; })}>Add post</Button>}>
        {posts.map((p, i) => {
          const ad = i === posts.length - 1;
          return (
            <div key={p.id} className="space-y-1.5 rounded-lg border p-2">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{ad ? 'Ad (the scroll stops here)' : `Post ${i + 1}`}</span>
                {posts.length > 1 && <Button size="icon-xs" variant="ghost" className="hover:text-destructive" onClick={() => set((s) => ({ ...s, feed: { ...s.feed, posts: s.feed.posts.filter((x) => x.id !== p.id) } }))}><Trash2 /></Button>}
              </div>
              <Row label="Posted by"><Input className="h-7 text-xs" placeholder="Name" value={p.author ?? ''} onChange={(e) => editPost(p.id, { author: e.target.value }, `a${p.id}`)} /></Row>
              <Textarea className="min-h-12 text-xs" value={p.text} onChange={(e) => editPost(p.id, { text: e.target.value }, `t${p.id}`)} />
              <Row label="Photo"><PhotoPick assetId={p.assetId} onPick={(a) => editPost(p.id, { assetId: a.assetId, imgW: a.w, imgH: a.h })} /></Row>
              <div className="flex gap-1.5">
                <Input type="number" min={0} className="h-7 w-20 text-xs" title="Likes" value={p.likes} onChange={(e) => editPost(p.id, { likes: Math.max(0, Math.round(num(e.target.value, p.likes))) }, `l${p.id}`)} />
                <Input type="number" min={0} className="h-7 w-20 text-xs" title="Comments" value={p.comments} onChange={(e) => editPost(p.id, { comments: Math.max(0, Math.round(num(e.target.value, p.comments))) }, `c${p.id}`)} />
                <Input className="h-7 w-20 text-xs" title="Posted" value={p.time} onChange={(e) => editPost(p.id, { time: e.target.value }, `m${p.id}`)} />
              </div>
            </div>
          );
        })}
      </Section>
    </>
  );
}
