import { useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import type { LibraryTrack, MusicTrack, ProjectAudio, SfxId } from '@/types';
import { useEditor } from '@/store';
import { NoiseRemoval } from './NoiseRemoval';
import * as db from '@/lib/db';
import { ai, health, musicSearch } from '@/lib/api';
import { freeLayer } from '@/lib/sounds';
import { analyzeTrack, loadAudioAsset } from '@/audio/graph';
import { SFX, playSfx } from '@/audio/sfx';
import { previewAudio } from '@/audio/preview';
import { formatClock } from '@/lib/srt';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Empty, Row, Section, Slider, Spinner, Toggle } from '../controls';
import { Pause, Play, Plus, Sparkles, Trash2, Upload } from '../icons';
import { Music, Search, Volume, Waveform } from '../icons-audio';

const MOODS = ['Happy', 'Chill', 'Inspiring', 'Energetic', 'Epic', 'Emotional', 'Corporate', 'Lo-fi', 'Cinematic', 'Funky'];
const dbFmt = (v: number) => (v > 0 ? `+${v.toFixed(1)} dB` : `${v.toFixed(1)} dB`);

function useAudio() {
  const audio = useEditor((s) => s.project!.audio);
  const update = useEditor((s) => s.update);
  const set = (fn: (a: ProjectAudio) => ProjectAudio, key?: string) => update((p) => ({ ...p, audio: fn(p.audio) }), key);
  return { audio, set };
}

/** Master output meter (reads the live preview engine). */
function Meter() {
  const bar = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0, hold = -60;
    const tick = () => {
      const db = Math.max(-60, previewAudio.level());
      hold = Math.max(db, hold - 0.6);
      if (bar.current) bar.current.style.width = `${Math.round(((hold + 60) / 60) * 100)}%`;
      if (bar.current) bar.current.style.background = hold > -3 ? 'var(--destructive)' : hold > -12 ? 'var(--warn)' : 'var(--ok)';
      if (label.current) label.current.textContent = hold <= -59 ? '−∞' : `${hold.toFixed(0)} dB`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="flex items-center gap-2 px-3 pt-3">
      <Volume className="size-4 text-muted-foreground" />
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div ref={bar} className="h-full w-0 rounded-full transition-[width] duration-75" /></div>
      <span ref={label} className="w-12 text-right font-mono text-[11px] tabular-nums text-muted-foreground">−∞</span>
    </div>
  );
}

function TrackCard({ t }: { t: MusicTrack }) {
  const { set } = useAudio();
  const duration = useEditor((s) => s.project!.duration);
  const patch = (p: Partial<MusicTrack>, key?: string) => set((a) => ({ ...a, tracks: a.tracks.map((x) => (x.id === t.id ? { ...x, ...p } : x)) }), key && `${key}-${t.id}`);
  const wf = t.analysis?.waveform ?? [];
  const bars = 64;
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border bg-muted/30 p-3">
      <div className="flex items-start gap-2">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"><Music className="size-4" /></div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{t.name}</div>
          <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
            <span>{formatClock(t.fileDuration)}</span>
            {t.analysis?.bpm && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{Math.round(t.analysis.bpm)} BPM</Badge>}
            {t.analysis?.lufs != null && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{t.analysis.lufs.toFixed(1)} LUFS</Badge>}
            {t.license && <Badge variant="outline" className="h-4 px-1.5 text-[10px]">{t.license}</Badge>}
          </div>
        </div>
        <Button variant="ghost" size="icon-xs" className="hover:text-destructive" aria-label="Remove track"
          onClick={() => set((a) => ({ ...a, tracks: a.tracks.filter((x) => x.id !== t.id) }))}><Trash2 /></Button>
      </div>
      {wf.length > 0 && (
        <div className="flex h-8 items-center gap-px">
          {Array.from({ length: bars }, (_, i) => {
            const a = Math.floor((i / bars) * wf.length), b = Math.max(a + 1, Math.floor(((i + 1) / bars) * wf.length));
            let m = 0; for (let k = a; k < b; k++) m = Math.max(m, wf[k] ?? 0);
            return <div key={i} className="flex-1 rounded-sm bg-primary/60" style={{ height: `${Math.max(6, m * 100)}%` }} />;
          })}
        </div>
      )}
      <Row label="Volume"><Slider value={t.volume} min={-36} max={6} step={0.5} onChange={(volume) => patch({ volume }, 'vol')} format={dbFmt} /></Row>
      <Row label="Fade in"><Slider value={t.fadeIn} min={0} max={6} step={0.1} onChange={(fadeIn) => patch({ fadeIn }, 'fi')} format={(v) => `${v.toFixed(1)}s`} /></Row>
      <Row label="Fade out"><Slider value={t.fadeOut} min={0} max={8} step={0.1} onChange={(fadeOut) => patch({ fadeOut }, 'fo')} format={(v) => `${v.toFixed(1)}s`} /></Row>
      <Row label="Start in song" hint="Skip the song's intro"><Slider value={t.offset} min={0} max={Math.max(0, Math.floor(t.fileDuration - 1))} step={0.5} onChange={(offset) => patch({ offset }, 'off')} format={(v) => formatClock(v)} /></Row>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-muted-foreground"><Toggle checked={t.loop} onChange={(loop) => patch({ loop })} /> Loop</div>
        <Button variant="outline" size="xs" onClick={() => patch({ start: 0, duration: Math.max(1, duration), loop: t.fileDuration - t.offset < duration || t.loop, fadeOut: Math.max(t.fadeOut, 2) })}>Fit to video</Button>
      </div>
      {t.attribution && <p className="text-[11px] leading-snug text-muted-foreground">{t.attribution}</p>}
    </div>
  );
}

function Library({ onAdd }: { onAdd: (lt: LibraryTrack) => Promise<void> }) {
  const project = useEditor((s) => s.project)!;
  const notify = useEditor((s) => s.notify);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [q, setQ] = useState('');
  const [mood, setMood] = useState<string | null>(null);
  const [results, setResults] = useState<LibraryTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const audioEl = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { health().then((h) => setConfigured(h ? h.music : false)); return () => audioEl.current?.pause(); }, []);

  const search = async (opts: { q?: string; mood?: string | null; bpmMin?: number; bpmMax?: number } = {}) => {
    setLoading(true);
    try {
      const r = await musicSearch({ q: opts.q ?? q, mood: (opts.mood ?? mood)?.toLowerCase(), bpmMin: opts.bpmMin, bpmMax: opts.bpmMax });
      setConfigured(r.configured);
      setResults(r.tracks);
      if (r.configured && !r.tracks.length) notify('No tracks found. Try another mood or search.', 'info');
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const suggest = async () => {
    setSuggesting(true);
    try {
      const transcript = project.captions.map((c) => c.words.map((w) => w.text).join(' ')).join('\n');
      const r = await ai.musicMood({ transcript, language: project.language === 'en' ? 'en' : 'si' });
      setQ(r.searchQuery);
      setMood(null);
      setReason(`${r.reason} (${r.moods.join(', ')} · ${r.bpmMin}–${r.bpmMax} BPM)`);
      if (configured) await search({ q: r.searchQuery, mood: null, bpmMin: r.bpmMin, bpmMax: r.bpmMax });
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setSuggesting(false);
    }
  };

  const toggle = (t: LibraryTrack) => {
    if (playing === t.id) { audioEl.current?.pause(); setPlaying(null); return; }
    audioEl.current?.pause();
    const a = new Audio(t.previewUrl);
    a.volume = 0.8;
    a.onended = () => setPlaying(null);
    void a.play().catch(() => notify('Could not play that preview.', 'error'));
    audioEl.current = a;
    setPlaying(t.id);
  };

  return (
    <div className="flex flex-col gap-3">
      <Button variant="outline" size="sm" onClick={suggest} disabled={suggesting || !project.captions.length}>
        {suggesting ? <Spinner /> : <Sparkles />}AI: suggest music for this video
      </Button>
      {reason && <p className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-foreground/90">{reason}</p>}
      {configured === false ? (
        <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
          The free music library needs a Jamendo key. Get a free client ID at <b>devportal.jamendo.com</b> and add
          <code className="mx-1 rounded bg-muted px-1">JAMENDO_CLIENT_ID=…</code> to <code className="rounded bg-muted px-1">server/.env</code>.
          AI suggestions still work: search the suggested mood in any library, or import your own file.
        </div>
      ) : (
        <>
          <div className="flex gap-1.5">
            <Input className="h-8" placeholder="Search music…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
            <Button size="icon-sm" onClick={() => search()} disabled={loading} aria-label="Search">{loading ? <Spinner /> : <Search />}</Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {MOODS.map((m) => (
              <button key={m} onClick={() => { const next = mood === m ? null : m; setMood(next); void search({ mood: next }); }}
                className={cn('rounded-full border px-2.5 py-0.5 text-xs transition-colors', mood === m ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-primary/60')}>{m}</button>
            ))}
          </div>
          <div className="flex flex-col divide-y rounded-xl border">
            {results.map((t) => (
              <div key={t.id} className="flex items-center gap-2 px-2.5 py-2">
                <button onClick={() => toggle(t)} className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-muted" aria-label={playing === t.id ? 'Stop preview' : 'Play preview'}
                  style={t.image ? { backgroundImage: `url(${t.image})`, backgroundSize: 'cover' } : undefined}>
                  <span className="grid size-full place-items-center bg-black/40 text-white">{playing === t.id ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}</span>
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{t.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{t.artist} · {formatClock(t.duration)} · {t.license}</div>
                </div>
                <Button size="xs" variant="secondary" disabled={adding === t.id} onClick={async () => { setAdding(t.id); try { await onAdd(t); } finally { setAdding(null); } }}>
                  {adding === t.id ? <Spinner /> : <Plus />}Add
                </Button>
              </div>
            ))}
            {!results.length && !loading && <div className="px-3 py-6 text-center text-xs text-muted-foreground">Pick a mood or search to browse royalty-free tracks.</div>}
          </div>
        </>
      )}
    </div>
  );
}

export function AudioPanel() {
  const { audio, set } = useAudio();
  const project = useEditor((s) => s.project)!;
  const notify = useEditor((s) => s.notify);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const addTrack = async (blob: Blob, name: string, extra: Partial<MusicTrack> = {}, handle?: FileSystemFileHandle | null) => {
    setBusy(true);
    try {
      const assetId = handle && blob instanceof File ? await db.putFileHandle(handle, blob) : await db.putBlob(blob);
      const buf = await loadAudioAsset(assetId);
      const analysis = await analyzeTrack(blob, buf);
      const dur = project.duration || buf.duration;
      const t: MusicTrack = {
        id: nanoid(8), assetId, name, source: 'upload', fileDuration: buf.duration, start: 0, offset: 0,
        duration: dur, volume: 0, fadeIn: 0.5, fadeOut: 2, loop: buf.duration < dur, analysis, layer: freeLayer(audio.tracks, 0, dur), ...extra,
      };
      set((a) => ({ ...a, tracks: [...a.tracks, t] }));
      notify(`Added “${name}”${analysis.bpm ? ` · ${Math.round(analysis.bpm)} BPM` : ''}.`, 'success');
    } catch (e) {
      notify((e as Error).message || 'Could not read that audio file.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const browse = async () => {
    const picker = (window as unknown as { showOpenFilePicker?: (o: object) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker;
    if (!picker) { input.current?.click(); return; }
    try {
      const [h] = await picker({ types: [{ description: 'Audio', accept: { 'audio/*': ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'] } }] });
      if (h) { const f = await h.getFile(); await addTrack(f, f.name.replace(/\.[^.]+$/, ''), {}, h); }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') input.current?.click();
    }
  };

  const addLibrary = async (lt: LibraryTrack) => {
    const res = await fetch(lt.previewUrl);
    if (!res.ok) { notify('Could not download that track.', 'error'); return; }
    await addTrack(await res.blob(), `${lt.name} — ${lt.artist}`, { source: 'library', license: lt.license, attribution: lt.attribution });
  };

  const sfx = audio.sfx;
  const setSfx = (p: Partial<typeof sfx>, key?: string) => set((a) => ({ ...a, sfx: { ...a.sfx, ...p } }), key);
  const SfxSelect = ({ field, label }: { field: 'onWord' | 'onEmphasis' | 'onCaption' | 'onHook'; label: string }) => (
    <Row label={label}>
      <Select value={sfx[field] ?? 'none'} onValueChange={(v) => setSfx({ [field]: v === 'none' ? null : (v as SfxId) })}>
        <SelectTrigger size="sm" className="w-32"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          {SFX.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="icon-xs" disabled={!sfx[field]} onClick={() => sfx[field] && playSfx(sfx[field]!, sfx.volume)} aria-label="Preview"><Play /></Button>
    </Row>
  );

  return (
    <div className="pb-6">
      <Meter />
      <Tabs defaultValue="music" className="gap-0">
        <div className="px-3 pt-3">
          <TabsList className="w-full">
            <TabsTrigger value="music">Music</TabsTrigger>
            <TabsTrigger value="voice">Voice</TabsTrigger>
            <TabsTrigger value="sfx">Effects</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="music">
          <Section title={`Tracks · ${audio.tracks.length}`} right={
            <Button size="xs" onClick={browse} disabled={busy}>{busy ? <Spinner /> : <Upload />}Import</Button>
          }>
            <input ref={input} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void addTrack(f, f.name.replace(/\.[^.]+$/, '')); e.target.value = ''; }} />
            {audio.tracks.length === 0 ? (
              <Empty icon={<Waveform />} title="No music yet">Import an MP3 / WAV / M4A, or pick from the free library below. Music auto-ducks under speech.</Empty>
            ) : audio.tracks.map((t) => <TrackCard key={t.id} t={t} />)}
            {audio.tracks.some((t) => t.analysis?.beats.length) && (
              <Row label="Snap edits to beats" hint="Dragging captions on the timeline snaps their start to the nearest beat.">
                <Toggle checked={audio.snapToBeats} onChange={(snapToBeats) => set((a) => ({ ...a, snapToBeats }))} />
              </Row>
            )}
          </Section>
          <Section title="Free music library"><Library onAdd={addLibrary} /></Section>
        </TabsContent>

        <TabsContent value="voice">
          <Section title="Original audio">
            <Row label="Volume"><Slider value={audio.original.volume} min={-30} max={12} step={0.5} onChange={(volume) => set((a) => ({ ...a, original: { ...a.original, volume } }), 'ovol')} format={dbFmt} /></Row>
            <Row label="Mute original"><Toggle checked={audio.original.muted} onChange={(muted) => set((a) => ({ ...a, original: { ...a.original, muted } }))} /></Row>
            <Row label="Enhance voice" hint="Removes rumble, adds clarity and evens out the level (high-pass, presence EQ, compressor).">
              <Toggle checked={audio.original.enhance} onChange={(enhance) => set((a) => ({ ...a, original: { ...a.original, enhance } }))} />
            </Row>
          </Section>
          <NoiseRemoval />
          <Section title="Auto-ducking" right={<Toggle checked={audio.ducking.enabled} onChange={(enabled) => set((a) => ({ ...a, ducking: { ...a.ducking, enabled } }))} />}>
            <p className="text-xs text-muted-foreground">Music automatically dips while someone speaks, using the caption word timings. {project.captions.length ? '' : 'Generate captions to enable it.'}</p>
            {audio.ducking.enabled && (
              <>
                <Row label="Duck by"><Slider value={audio.ducking.amountDb} min={-30} max={-2} step={1} onChange={(amountDb) => set((a) => ({ ...a, ducking: { ...a.ducking, amountDb } }), 'duck')} format={dbFmt} /></Row>
                <Row label="Attack"><Slider value={audio.ducking.attack} min={0.02} max={1} step={0.01} onChange={(attack) => set((a) => ({ ...a, ducking: { ...a.ducking, attack } }), 'att')} format={(v) => `${Math.round(v * 1000)} ms`} /></Row>
                <Row label="Release"><Slider value={audio.ducking.release} min={0.05} max={2} step={0.05} onChange={(release) => set((a) => ({ ...a, ducking: { ...a.ducking, release } }), 'rel')} format={(v) => `${Math.round(v * 1000)} ms`} /></Row>
              </>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="sfx">
          <Section title="Sound effects" right={<Toggle checked={sfx.enabled} onChange={(enabled) => setSfx({ enabled })} />}>
            <p className="text-xs text-muted-foreground">Synced to your captions — made in the app, free to use anywhere.</p>
            <SfxSelect field="onEmphasis" label="Emphasized word" />
            <SfxSelect field="onCaption" label="New caption" />
            <SfxSelect field="onWord" label="Every word" />
            <SfxSelect field="onHook" label="Text hook" />
            <Row label="Effects volume"><Slider value={sfx.volume} min={-30} max={6} step={0.5} onChange={(volume) => setSfx({ volume }, 'sfxv')} format={dbFmt} /></Row>
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {SFX.map((s) => (
                <Button key={s.id} variant="outline" size="xs" onClick={() => playSfx(s.id, sfx.volume)}><Play />{s.label}</Button>
              ))}
            </div>
          </Section>
        </TabsContent>
      </Tabs>

      <Section title="Master">
        <Row label="Loudness for social media" hint="Masters the export to a consistent loudness and prevents clipping (limiter at −1 dBTP).">
          <Toggle checked={audio.normalize.enabled} onChange={(enabled) => set((a) => ({ ...a, normalize: { ...a.normalize, enabled } }))} />
        </Row>
        {audio.normalize.enabled && (
          <Row label="Target">
            <Select value={String(audio.normalize.targetLufs)} onValueChange={(v) => set((a) => ({ ...a, normalize: { ...a.normalize, targetLufs: Number(v) } }))}>
              <SelectTrigger size="sm" className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="-14">−14 LUFS · TikTok, Reels, YouTube</SelectItem>
                <SelectItem value="-16">−16 LUFS · Podcasts, Apple</SelectItem>
                <SelectItem value="-23">−23 LUFS · Broadcast (EBU R128)</SelectItem>
              </SelectContent>
            </Select>
          </Row>
        )}
      </Section>
    </div>
  );
}
