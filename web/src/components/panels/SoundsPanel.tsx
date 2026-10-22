import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Plus } from '@/components/icons';
import { Search } from '../icons-audio';
import type { SfxResult } from '@/types';
import { useEditor } from '@/store';
import { sfxSearch } from '@/lib/api';
import { SFX, playSfx } from '@/audio/sfx';
import { addSound, type SoundSource } from '@/lib/sounds';
import { DRAG_MIME, type DragPayload } from '@/lib/timelineGeo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Empty, Section, Spinner } from '../controls';

/** Sounds that short-form videos lean on, as one-tap searches. */
const TRENDING = [
  'whoosh', 'pop', 'vine boom', 'bruh', 'record scratch', 'air horn', 'camera shutter', 'notification', 'laugh', 'applause',
  'cash register', 'glitch', 'impact', 'riser', 'heartbeat', 'swoosh', 'ding', 'dramatic hit', 'click', 'typing',
];

/** Sound effects: instant built-in sounds, plus a free search of Creative Commons sounds (Freesound via Openverse). */
export function SoundsPanel() {
  const notify = useEditor((s) => s.notify);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SfxResult[] | null>(null);
  const [page, setPage] = useState({ n: 1, of: 1 });
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const last = useRef('');

  useEffect(() => () => { audio.current?.pause(); }, []);

  const search = async (query: string, n = 1) => {
    const term = query.trim();
    if (!term) return;
    setQ(term); last.current = term; setBusy(true);
    try {
      const r = await sfxSearch(term, n);
      setResults((prev) => (n > 1 && prev ? [...prev, ...r.results] : r.results));
      setPage({ n: r.page, of: r.pageCount });
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally { setBusy(false); }
  };

  const toggle = (r: SfxResult) => {
    if (playing === r.id) { audio.current?.pause(); setPlaying(null); return; }
    audio.current?.pause();
    const a = new Audio(r.previewUrl);
    a.onended = () => setPlaying((p) => (p === r.id ? null : p));
    a.onerror = () => { setPlaying(null); notify('Could not play that sound.', 'error'); };
    audio.current = a;
    setPlaying(r.id);
    void a.play().catch(() => setPlaying(null));
  };

  const add = async (key: string, src: SoundSource) => {
    setAdding(key);
    try { await addSound(src); } catch (e) { notify((e as Error).message || 'Could not add that sound.', 'error'); } finally { setAdding(null); }
  };
  const srcOf = (r: SfxResult): SoundSource => ({ name: r.name, url: r.previewUrl, license: r.license, attribution: r.attribution });
  /** Make a tile draggable onto the timeline. */
  const dragProps = (src: SoundSource) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ type: 'sound', sound: src } satisfies DragPayload)); e.dataTransfer.effectAllowed = 'copy'; },
  });

  return (
    <div>
      <div className="border-b px-3 py-2.5 text-xs text-muted-foreground">Drag a sound onto the timeline where it should play, or press + to add it at the playhead.</div>
      <Section title="Search sounds">
        <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); void search(q); }}>
          <Input className="h-8 text-xs" placeholder="whoosh, vine boom, laugh, camera…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button type="submit" size="sm" className="h-8" disabled={busy || !q.trim()}>{busy && !results ? <Spinner /> : <Search className="size-4" />}</Button>
        </form>
        <div className="flex flex-wrap gap-1">
          {TRENDING.map((t) => (
            <button key={t} type="button" onClick={() => void search(t)}
              className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-primary/15 hover:text-foreground">{t}</button>
          ))}
        </div>
      </Section>
      {results && (
        <Section title="Results" right={<span className="text-[11px] text-muted-foreground">{results.length} sounds · Freesound, free to use</span>}>
          {results.length === 0 && !busy && <Empty icon={<Search />} title="No sounds found">Try a simpler word, like “pop” or “whoosh”.</Empty>}
          <div className="flex flex-col gap-1">
            {results.map((r) => (
              <div key={r.id} {...dragProps(srcOf(r))} className="flex cursor-grab items-center gap-2 rounded-lg border px-2 py-1.5 active:cursor-grabbing">
                <Button variant="secondary" size="icon-xs" aria-label={playing === r.id ? 'Stop' : 'Play'} onClick={() => toggle(r)}>{playing === r.id ? <Pause /> : <Play />}</Button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs">{r.name}</div>
                  <div className="truncate text-[10px] text-muted-foreground">{r.duration.toFixed(1)}s · {r.creator} · {r.license}</div>
                </div>
                <Button variant="ghost" size="icon-xs" aria-label="Add at playhead" title="Add at playhead" disabled={adding === r.id} onClick={() => void add(r.id, srcOf(r))}>{adding === r.id ? <Spinner /> : <Plus />}</Button>
              </div>
            ))}
          </div>
          {page.n < page.of && <Button variant="outline" size="sm" disabled={busy} onClick={() => void search(last.current, page.n + 1)}>{busy ? <Spinner /> : 'Load more'}</Button>}
          <p className="text-[10px] text-muted-foreground">Only licences that allow commercial use are listed. Some need a credit; it is saved with the track in the Audio tab.</p>
        </Section>
      )}
      <Section title="Built-in" right={<span className="text-[11px] text-muted-foreground">{SFX.length} · offline</span>}>
        <div className="grid grid-cols-2 gap-1.5">
          {SFX.map((s) => (
            <div key={s.id} {...dragProps({ name: s.label, builtin: s.id })} className="flex cursor-grab items-center gap-1.5 rounded-lg border px-2 py-1.5 active:cursor-grabbing">
              <Button variant="secondary" size="icon-xs" aria-label={`Play ${s.label}`} onClick={() => void playSfx(s.id)}><Play /></Button>
              <span className="min-w-0 flex-1 truncate text-xs">{s.label}</span>
              <Button variant="ghost" size="icon-xs" aria-label={`Add ${s.label} at playhead`} title="Add at playhead" disabled={adding === s.id} onClick={() => void add(s.id, { name: s.label, builtin: s.id })}>{adding === s.id ? <Spinner /> : <Plus />}</Button>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
