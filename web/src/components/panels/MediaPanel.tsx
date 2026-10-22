import { useEffect, useMemo, useRef, useState } from 'react';
import { Film, ImagePlus, Plus, Trash2, Upload } from '@/components/icons';
import { Music } from '@/components/icons-audio';
import { useEditor } from '@/store';
import { getBlob } from '@/lib/db';
import { imageThumb, importMedia, kindOf, type MediaKind } from '@/lib/importMedia';
import { probeVideo } from '@/lib/media';
import { seek } from '@/lib/player';
import { clipOps } from '../ClipLane';
import { DRAG_MIME } from '@/lib/timelineGeo';
import { formatClock } from '@/lib/srt';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Empty, Section } from '../controls';

type Filter = 'all' | MediaKind;
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'video', label: 'Video' }, { id: 'audio', label: 'Audio' }, { id: 'image', label: 'Images' },
];

interface Item { id: string; kind: MediaKind; name: string; duration: number; thumb?: string; at: number; assetId: string; source: 'clip' | 'track' | 'broll' }

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

  const brollIds = project.broll.map((b) => b.assetId).join('|');
  useEffect(() => {
    let live = true;
    for (const b of project.broll) {
      if (thumbs[b.assetId]) continue;
      getBlob(b.assetId).then((blob) => blob && imageThumb(blob, 160)).then((u) => { if (live && u) setThumbs((t) => ({ ...t, [b.assetId]: u })); }).catch(() => {});
    }
    return () => { live = false; };
  }, [brollIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // One poster frame per video file, so several videos are told apart.
  const videoIds = [...new Set((project.clips ?? []).filter((c) => c.kind === 'video').map((c) => c.assetId))].join('|');
  useEffect(() => {
    let live = true;
    for (const id of videoIds ? videoIds.split('|') : []) {
      if (thumbs[id]) continue;
      getBlob(id).then((blob) => blob && probeVideo(blob as File)).then((m) => { if (live && m?.thumbnail) setThumbs((t) => ({ ...t, [id]: m.thumbnail! })); }).catch(() => {});
    }
    return () => { live = false; };
  }, [videoIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const c of project.clips ?? []) {
      out.push({ id: c.id, kind: c.kind, name: c.name, duration: c.duration, thumb: c.kind === 'video' ? thumbs[c.assetId] ?? project.thumbnail ?? undefined : undefined, at: c.start, assetId: c.assetId, source: 'clip' });
    }
    for (const t of project.audio.tracks) out.push({ id: t.id, kind: 'audio', name: t.name, duration: t.duration, at: t.start, assetId: t.assetId, source: 'track' });
    for (const b of project.broll) out.push({ id: b.id, kind: 'image', name: b.note || 'Image', duration: b.end - b.start, thumb: thumbs[b.assetId], at: b.start, assetId: b.assetId, source: 'broll' });
    return out;
  }, [project.clips, project.thumbnail, project.audio.tracks, project.broll, thumbs]);

  const counts: Record<Filter, number> = { all: items.length, video: 0, audio: 0, image: 0 };
  for (const i of items) counts[i.kind]++;
  const shown = items.filter((i) => filter === 'all' || i.kind === filter);

  const addFiles = async (files: FileList | File[]) => {
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        if (!kindOf(f)) { notify(`“${f.name}” is not a video, audio or image file.`, 'error'); continue; }
        const k = await importMedia(f);
        if (k === 'video') notify('Video added to the timeline with its audio linked. Right-click a clip to unlink.', 'success');
      }
    } catch (e) {
      notify((e as Error).message || 'Could not import that file.', 'error');
    } finally { setBusy(false); }
  };

  const remove = (i: Item) => {
    if (i.source === 'clip') clipOps.remove(i.id);
    else if (i.kind === 'audio') update((p) => ({ ...p, audio: { ...p.audio, tracks: p.audio.tracks.filter((t) => t.id !== i.id) } }));
    else if (i.kind === 'image') update((p) => ({ ...p, broll: p.broll.filter((b) => b.id !== i.id) }));
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
        <Empty icon={<Film className="size-6" />} title="Nothing here yet">Import media above. Images drop onto the timeline at the playhead as b-roll.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-2 p-3">
          {shown.map((i) => (
            <div key={i.id} className="group relative overflow-hidden rounded-xl border bg-card" draggable={i.source === 'clip'}
              onDragStart={(e) => { if (i.source !== 'clip') return; e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ type: 'media', clipId: i.id })); e.dataTransfer.effectAllowed = 'copy'; }}>
              <button onClick={() => seek(i.at)} className="block w-full text-left" title="Jump to this clip">
                <div className="relative grid aspect-video place-items-center bg-muted">
                  {i.thumb ? <img src={i.thumb} alt="" className="absolute inset-0 size-full object-cover" /> : i.kind === 'audio' ? <Music className="size-6 text-primary" /> : <ImagePlus className="size-6 text-muted-foreground" />}
                  <span className="absolute bottom-1 right-1 rounded bg-black/65 px-1 font-mono text-[10px] text-white">{formatClock(i.duration, false)}</span>
                </div>
                <div className="truncate px-2 py-1.5 text-xs">{i.name}</div>
              </button>
              {(i.source !== 'clip' || true) && (
                <Button variant="secondary" size="icon-xs" aria-label="Remove" className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 hover:text-destructive" onClick={() => remove(i)}><Trash2 /></Button>
              )}
              {i.kind === 'image' && (
                <Button variant="secondary" size="icon-xs" aria-label="Add again at playhead" className="absolute left-1 top-1 opacity-0 group-hover:opacity-100"
                  onClick={() => update((p) => { const b = p.broll.find((x) => x.id === i.id)!; const at = useEditor.getState().time; return { ...p, broll: [...p.broll, { ...b, id: `${b.id}-${Date.now().toString(36)}`, start: at, end: at + (b.end - b.start) }] }; })}><Plus /></Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
