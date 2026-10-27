import { useEffect, useMemo, useRef, useState } from 'react';
import { Film, ImagePlus, Plus, Trash2, Upload } from '@/components/icons';
import { Music } from '@/components/icons-audio';
import { useEditor } from '@/store';
import { getBlob } from '@/lib/db';
import { addLibraryItem, imageThumb, importToLibrary, kindOf, type MediaKind } from '@/lib/importMedia';
import { probeVideo } from '@/lib/media';
import { seek } from '@/lib/player';
import { clipOps } from '../ClipLane';
import { overlayOps } from '../OverlayLane';
import { DRAG_MIME } from '@/lib/timelineGeo';
import { formatClock } from '@/lib/srt';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Empty, Section } from '../controls';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Plays the stored file of a media item. For library items, I / O (or the buttons) mark the part to use, like a source monitor. */
function MediaViewer({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const update = useEditor((s) => s.update);
  const lib = useEditor((s) => (item?.source === 'library' ? s.project?.library?.find((l) => l.id === item.id) : undefined));
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!item) return;
    let live = true;
    let made: string | null = null;
    getBlob(item.assetId).then((b) => { if (live && b) { made = URL.createObjectURL(b); setUrl(made); } }).catch(() => {});
    return () => { live = false; setUrl(null); if (made) URL.revokeObjectURL(made); };
  }, [item?.assetId]); // eslint-disable-line react-hooks/exhaustive-deps
  const timed = !!lib && lib.kind !== 'image';
  const setRange = (range: { in: number; out: number } | undefined) =>
    lib && update((p) => ({ ...p, library: (p.library ?? []).map((l) => (l.id === lib.id ? { ...l, range } : l)) }));
  const markIn = () => {
    if (!lib || !media.current) return;
    const t = media.current.currentTime;
    setRange({ in: t, out: lib.range && lib.range.out > t + 0.05 ? lib.range.out : lib.duration });
  };
  const markOut = () => {
    if (!lib || !media.current) return;
    const t = media.current.currentTime;
    setRange({ in: lib.range && lib.range.in < t - 0.05 ? lib.range.in : 0, out: t });
  };
  // Premiere-style: playing from In stops at Out.
  useEffect(() => {
    const el = media.current;
    if (!el || !lib?.range) return;
    const r = lib.range;
    const tick = () => { setNow(el.currentTime); if (!el.paused && el.currentTime >= r.out) { el.pause(); el.currentTime = r.out; } };
    el.addEventListener('timeupdate', tick);
    return () => el.removeEventListener('timeupdate', tick);
  }, [lib?.range?.in, lib?.range?.out, url]); // eslint-disable-line react-hooks/exhaustive-deps
  const onKey = (e: React.KeyboardEvent) => {
    if (e.code === 'KeyI' || e.code === 'KeyO') e.stopPropagation(); // keep the timeline's own I / O out of this dialog
    if (!timed) return;
    if (e.code === 'KeyI' && e.altKey) { e.preventDefault(); setRange(undefined); }
    else if (e.code === 'KeyI') { e.preventDefault(); markIn(); }
    else if (e.code === 'KeyO') { e.preventDefault(); markOut(); }
  };
  const total = lib?.duration || 0;
  const r = lib?.range;
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl" onKeyDown={onKey}>
        <DialogHeader><DialogTitle className="truncate">{item?.name}</DialogTitle></DialogHeader>
        {item && !url && <div className="grid h-40 place-items-center text-xs text-muted-foreground">Loading…</div>}
        {item && url && item.kind === 'video' && <video ref={media} src={url} controls autoPlay className="max-h-[60vh] w-full rounded-lg bg-black" />}
        {item && url && item.kind === 'audio' && <audio ref={media} src={url} controls autoPlay className="w-full" />}
        {item && url && item.kind === 'image' && <img src={url} alt="" className="max-h-[60vh] w-full rounded-lg bg-black object-contain" />}
        {timed && total > 0 && (
          <div className="flex flex-col gap-2">
            <div className="relative h-2 rounded-full bg-muted">
              <div className="absolute inset-y-0 rounded-full bg-primary/60" style={{ left: `${((r?.in ?? 0) / total) * 100}%`, width: `${(((r?.out ?? total) - (r?.in ?? 0)) / total) * 100}%` }} />
              <div className="absolute -top-0.5 h-3 w-0.5 bg-foreground" style={{ left: `${(now / total) * 100}%` }} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Button variant="outline" size="xs" onClick={markIn}>Mark In <kbd className="font-mono opacity-60">I</kbd></Button>
              <Button variant="outline" size="xs" onClick={markOut}>Mark Out <kbd className="font-mono opacity-60">O</kbd></Button>
              <Button variant="ghost" size="xs" disabled={!r} onClick={() => setRange(undefined)}>Clear</Button>
              <span className="ml-auto font-mono text-muted-foreground">
                {formatClock(r?.in ?? 0, false)} – {formatClock(r?.out ?? total, false)} · {formatClock((r?.out ?? total) - (r?.in ?? 0), false)}
              </span>
              <Button size="xs" onClick={() => { addLibraryItem(lib!).catch((e) => useEditor.getState().notify((e as Error).message, 'error')); onClose(); }}><Plus />Add to timeline</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type Filter = 'all' | MediaKind;
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'video', label: 'Video' }, { id: 'audio', label: 'Audio' }, { id: 'image', label: 'Images' },
];

interface Item { id: string; kind: MediaKind; name: string; duration: number; thumb?: string; at: number; assetId: string; source: 'clip' | 'track' | 'broll' | 'library' }

/** Project media bin: the main video, music tracks and b-roll images, with import and drag-and-drop. */
export function MediaPanel() {
  const project = useEditor((s) => s.project)!;
  const update = useEditor((s) => s.update);
  const notify = useEditor((s) => s.notify);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState<Item | null>(null);

  const images = (project.overlays ?? []).filter((o) => o.kind === 'image' && o.assetId);
  const brollIds = images.map((o) => o.assetId).join('|');
  useEffect(() => {
    let live = true;
    for (const o of images) {
      const id = o.assetId!;
      if (thumbs[id]) continue;
      getBlob(id).then((blob) => blob && imageThumb(blob, 640)).then((u) => { if (live && u) setThumbs((t) => ({ ...t, [id]: u })); }).catch(() => {});
    }
    return () => { live = false; };
  }, [brollIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // One poster frame per video file, so several videos are told apart.
  const videoIds = [...new Set((project.clips ?? []).filter((c) => c.kind === 'video').map((c) => c.assetId))].join('|');
  useEffect(() => {
    let live = true;
    for (const id of videoIds ? videoIds.split('|') : []) {
      if (thumbs[id]) continue;
      getBlob(id).then((blob) => blob && probeVideo(blob as File, 640)).then((m) => { if (live && m?.thumbnail) setThumbs((t) => ({ ...t, [id]: m.thumbnail! })); }).catch(() => {});
    }
    return () => { live = false; };
  }, [videoIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const l of project.library ?? []) out.push({ id: l.id, kind: l.kind, name: l.name, duration: l.range ? l.range.out - l.range.in : l.duration, thumb: l.thumb, at: 0, assetId: l.assetId, source: 'library' });
    const inLibrary = new Set((project.library ?? []).map((l) => l.assetId));
    for (const c of project.clips ?? []) {
      if (inLibrary.has(c.assetId)) continue;
      out.push({ id: c.id, kind: c.kind, name: c.name, duration: c.duration, thumb: c.kind === 'video' ? thumbs[c.assetId] ?? project.thumbnail ?? undefined : undefined, at: c.start, assetId: c.assetId, source: 'clip' });
    }
    for (const t of project.audio.tracks) if (!inLibrary.has(t.assetId)) out.push({ id: t.id, kind: 'audio', name: t.name, duration: t.duration, at: t.start, assetId: t.assetId, source: 'track' });
    for (const o of images) if (!inLibrary.has(o.assetId!)) out.push({ id: o.id, kind: 'image', name: o.text || 'Image', duration: o.duration, thumb: thumbs[o.assetId!], at: o.start, assetId: o.assetId!, source: 'broll' });
    return out;
  }, [project.library, project.clips, project.thumbnail, project.audio.tracks, project.overlays, thumbs]);

  const counts: Record<Filter, number> = { all: items.length, video: 0, audio: 0, image: 0 };
  for (const i of items) counts[i.kind]++;
  const shown = items.filter((i) => filter === 'all' || i.kind === filter);

  const addFiles = async (files: FileList | File[]) => {
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        if (!kindOf(f)) { notify(`“${f.name}” is not a video, audio or image file.`, 'error'); continue; }
        await importToLibrary(f);
      }
    } catch (e) {
      notify((e as Error).message || 'Could not import that file.', 'error');
    } finally { setBusy(false); }
  };

  const remove = (i: Item) => {
    if (i.source === 'library') update((p) => ({ ...p, library: (p.library ?? []).filter((l) => l.id !== i.id) }));
    else if (i.source === 'clip') clipOps.remove(i.id);
    else if (i.kind === 'audio') update((p) => ({ ...p, audio: { ...p.audio, tracks: p.audio.tracks.filter((t) => t.id !== i.id) } }));
    else if (i.kind === 'image') overlayOps.remove(i.id);
  };

  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); void addFiles(e.dataTransfer.files); }} className={cn('min-h-full', over && 'bg-primary/5')}>
      <Section title="Import" right={<span className="text-[11px] text-muted-foreground">{items.length} items</span>}>
        <button onClick={() => input.current?.click()} disabled={busy}
          className="flex h-16 w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-xs text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-foreground">
          <Upload className="size-4" />{busy ? 'Importing…' : 'Import or drop video, audio, images'}
        </button>
        <input ref={input} type="file" multiple accept="video/*,audio/*,image/*" hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
      </Section>
      <div className="flex gap-1 border-b px-3 py-2">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
            className={cn('flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors', filter === f.id ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:bg-sidebar-accent')}>
            {f.label}<span className="font-mono text-[10px] opacity-60">{counts[f.id]}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <Empty icon={<Film className="size-6" />} title="Nothing here yet">Import media above. It stays here until you drag it onto the timeline or press +.</Empty>
      ) : (
        <div className="grid grid-cols-4 gap-1.5 p-2">
          {shown.map((i) => (
            <div key={i.id} className="group relative overflow-hidden rounded-xl border bg-card" draggable={i.source === 'clip' || i.source === 'library'}
              onDragStart={(e) => { if (i.source !== 'clip' && i.source !== 'library') return; e.dataTransfer.setData(DRAG_MIME, JSON.stringify(i.source === 'library' ? { type: 'library', id: i.id } : { type: 'media', clipId: i.id })); e.dataTransfer.effectAllowed = 'copy'; }}>
              <button onClick={() => { if (i.source !== 'library') seek(i.at); }} onDoubleClick={() => setViewing(i)} className="block w-full text-left" title={i.source === 'library' ? 'Double-click to preview. Drag onto the timeline, or press + to add' : 'Double-click to preview'}>
                <div className="relative grid aspect-video place-items-center bg-muted">
                  {i.thumb ? <img src={i.thumb} alt="" className="absolute inset-0 size-full object-cover" /> : i.kind === 'audio' ? <Music className="size-6 text-primary" /> : <ImagePlus className="size-6 text-muted-foreground" />}
                  <span className="absolute bottom-1 right-1 rounded bg-black/65 px-1 font-mono text-[10px] text-white">{formatClock(i.duration, false)}</span>
                </div>
                <div className="truncate px-2 py-1.5 text-xs">{i.name}</div>
              </button>
              {(i.source !== 'clip' || true) && (
                <Button variant="secondary" size="icon-xs" aria-label="Remove" className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 hover:text-destructive" onClick={() => remove(i)}><Trash2 /></Button>
              )}
              {i.source === 'library' && (
                <Button variant="secondary" size="icon-xs" aria-label="Add to timeline" className="absolute left-1 top-1 opacity-0 group-hover:opacity-100"
                  onClick={() => { const l = project.library?.find((x) => x.id === i.id); if (l) addLibraryItem(l).catch((e) => notify((e as Error).message, 'error')); }}><Plus /></Button>
              )}
              {i.kind === 'image' && i.source !== 'library' && (
                <Button variant="secondary" size="icon-xs" aria-label="Add again at playhead" className="absolute left-1 top-1 opacity-0 group-hover:opacity-100"
                  onClick={() => { overlayOps.duplicate(i.id); }}><Plus /></Button>
              )}
            </div>
          ))}
        </div>
      )}
      <MediaViewer item={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
