import { useEffect, useMemo, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { Clock, Copy, Ellipsis, Film, Keyboard, Languages, LayoutGrid, Pencil, Plus, Rows, Search, Trash2, Upload, X } from '@/components/icons';
import type { HealthResponse, Project } from '@/types';
import * as db from '@/lib/db';
import { health } from '@/lib/api';
import { probeVideo } from '@/lib/media';
import { hasAudio } from '@/audio/decode';
import { clipEnd, makeAudioClip, makeVideoClip, withClips } from '@/lib/clips';
import { newProject, saveNow, useEditor } from '@/store';
import { cn } from '@/lib/utils';
import { isElectron } from '@/lib/shortcuts';
import { ALIGNER_BUSY, useAlignerSetup } from '@/lib/desktop';
import { AlignerSetup } from './AlignerSetup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from './controls';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
function ago(ts: number) {
  const s = (ts - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [u, n] of units) if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), u);
  return 'just now';
}
function fmtDur(s: number) {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

// Pref keys keep the pre-rename "sincap." prefix so saved choices survive.
function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch { return fallback; }
}
function writePref(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

// ---- Engine status ----------------------------------------------------------

/** Python service's aligner state: 'ready' | 'available' | 'downloading' | 'missing' | 'unavailable'. */
type EngineState = { server: HealthResponse | null; python: boolean; align: string | null; checked: boolean };

function useEngineStatus(): EngineState {
  const [state, setState] = useState<EngineState>({ server: null, python: false, align: null, checked: false });
  useEffect(() => {
    let alive = true;
    const py = fetch('/api/sinhala/health').then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ align?: string } | null>;
    Promise.all([health(), py]).then(([server, pyHealth]) => {
      if (alive) setState({ server, python: !!pyHealth, align: pyHealth?.align ?? null, checked: true });
    });
    return () => { alive = false; };
  }, []);
  return state;
}

function Dot({ ok, pending, className }: { ok: boolean; pending?: boolean; className?: string }) {
  return (
    <span className={cn('inline-block size-2 shrink-0 rounded-full', pending ? 'animate-pulse bg-muted-foreground/60' : ok ? 'bg-ok shadow-[0_0_8px] shadow-ok/60' : 'bg-warn', className)} />
  );
}

const ALIGN_NOTE: Record<string, string> = {
  ready: 'Ready', available: 'Ready', downloading: 'Downloading model', missing: isElectron ? 'Not installed' : 'Run npm run align:fetch', unavailable: 'Not installed',
};

function EngineStatus() {
  const { server, python: pyUp, align: pyAlign, checked } = useEngineStatus();
  // Desktop: the installer's live state wins over the health check made when the page opened.
  const setup = useAlignerSetup();
  const python = pyUp || setup?.phase === 'ready';
  const align = setup?.phase === 'ready' ? 'ready' : setup && ALIGNER_BUSY.includes(setup.phase) ? 'installing' : pyAlign;
  const t = server?.transcription;
  const anyTranscribe = !!t && (t.gemini || t.elevenlabs || t.openai);
  const rows: { label: string; ok: boolean; note: string }[] = [
    { label: 'Keyframe.lk server', ok: !!server, note: server ? 'Connected' : 'Not reachable' },
    { label: 'Gemini transcription', ok: !!t?.gemini, note: t?.gemini ? 'Ready' : 'No API key' },
    { label: 'ElevenLabs Scribe', ok: !!t?.elevenlabs, note: t?.elevenlabs ? 'Ready' : 'No API key' },
    { label: 'OpenAI Whisper', ok: !!t?.openai, note: t?.openai ? 'Ready' : 'No API key' },
    { label: 'AI tools', ok: !!server?.ai, note: server?.ai ? (server.aiProvider === 'claude' ? 'Claude' : server.aiProvider === 'gemini' ? 'Gemini' : 'Ready') : 'Not configured' },
    { label: 'Music library', ok: !!server?.music, note: server?.music ? 'Ready' : 'Not configured' },
    { label: 'FFmpeg', ok: !!server?.ffmpeg, note: server?.ffmpeg ? 'Available' : 'Not found' },
    { label: 'Python audio service', ok: python, note: python ? 'Connected' : 'Not running' },
    { label: 'Word timing aligner', ok: align === 'ready' || align === 'available', note: align === 'installing' ? `Installing ${setup?.percent ?? 0}%` : ALIGN_NOTE[align ?? ''] ?? 'Not running' },
  ];
  const summary = [
    { key: 'captions', ok: anyTranscribe },
    { key: 'ai', ok: !!server?.ai },
    { key: 'python', ok: python },
  ];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2" aria-label="Engine status">
          <span className="flex items-center gap-1">
            {summary.map((s) => <Dot key={s.key} ok={s.ok} pending={!checked} />)}
          </span>
          <span className="hidden lg:inline">Engines</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="border-b px-3 py-2.5">
          <div className="text-sm font-medium">Engine status</div>
          <div className="text-xs text-muted-foreground">Editing and export work offline. These power captions, AI and music.</div>
        </div>
        <ul className="p-1.5">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px]">
              <Dot ok={r.ok} pending={!checked} />
              <span className="flex-1">{r.label}</span>
              <span className="text-xs text-muted-foreground">{checked ? r.note : 'Checking…'}</span>
            </li>
          ))}
        </ul>
        {setup && setup.phase !== 'ready' && <AlignerSetup state={setup} compact className="border-t px-3 py-2.5" />}
      </PopoverContent>
    </Popover>
  );
}

const ALIGNER_CARD_KEY = 'keyframe.alignerCardDismissed';

/** Desktop: offer caption-timing setup until it is installed (dismissible, but a failed install always shows). */
function AlignerCard() {
  const setup = useAlignerSetup();
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(ALIGNER_CARD_KEY) === '1'; } catch { return false; } });
  if (!setup || setup.phase === 'ready' || setup.phase === 'unsupported') return null;
  const busy = ALIGNER_BUSY.includes(setup.phase);
  if (dismissed && !busy && setup.phase !== 'failed') return null;
  return (
    <div className="relative mt-3 rounded-2xl border bg-card p-4">
      {!busy && (
        <button type="button" aria-label="Hide" className="absolute top-3 right-3 rounded-md p-1 text-muted-foreground hover:bg-foreground/[0.07] hover:text-foreground"
          onClick={() => { setDismissed(true); writePref(ALIGNER_CARD_KEY, '1'); }}>
          <X className="size-3.5" />
        </button>
      )}
      <div className="mb-2 pr-8 text-[15px] font-medium">Accurate caption timing</div>
      <AlignerSetup state={setup} className="max-w-xl" />
    </div>
  );
}

const colomboTime = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Colombo' });

function ColomboClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="size-1.5 animate-pulse rounded-full bg-ok" />{colomboTime.format(now)} · Colombo, LK
    </span>
  );
}

// ---- Page -------------------------------------------------------------------

type SortKey = 'recent' | 'name';
type ViewMode = 'grid' | 'list';

export function Home() {
  const [projects, setProjects] = useState<db.ProjectSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [toDelete, setToDelete] = useState<db.ProjectSummary | null>(null);
  const [toRename, setToRename] = useState<{ p: db.ProjectSummary; name: string } | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>(() => readPref('sincap.home.sort', ['recent', 'name'] as const, 'recent'));
  const [view, setView] = useState<ViewMode>(() => readPref('sincap.home.view', ['grid', 'list'] as const, 'grid'));
  const input = useRef<HTMLInputElement>(null);
  const importing = useRef(false);
  const notify = useEditor((s) => s.notify);
  const openConverter = useEditor((s) => s.setConverterOpen);
  const openShortcuts = useEditor((s) => s.setShortcutsOpen);

  /** Chrome/Edge: pick with the File System Access API so we can keep a link instead of a copy. */
  async function browse() {
    if (busy) return;
    const picker = (window as unknown as { showOpenFilePicker?: (o: object) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker;
    if (!picker) { input.current?.click(); return; }
    try {
      const handles = await picker({ multiple: true, types: [{ description: 'Video', accept: { 'video/*': ['.mp4', '.mov', '.m4v', '.webm', '.mkv'] } }], excludeAcceptAllOption: false });
      if (handles.length) create(await Promise.all(handles.map(async (h) => ({ file: await h.getFile(), handle: h }))));
    } catch (e) {
      if ((e as Error).name !== 'AbortError') input.current?.click();
    }
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    const items = Array.from(e.dataTransfer.items ?? []) as (DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> })[];
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    // Handles must be read before the first await: the drag data store is cleared afterwards.
    const pending = items.filter((it) => it.kind === 'file').map((it) => it.getAsFileSystemHandle?.().catch(() => null) ?? Promise.resolve(null));
    const handles = await Promise.all(pending);
    create(files.map((file, i) => ({ file, handle: handles[i] && handles[i]!.kind === 'file' ? (handles[i] as FileSystemFileHandle) : null })));
  }

  // Wait for the project we just left to finish saving, so its card shows the latest edits.
  const refresh = () => saveNow().then(() => db.listProjects()).then(setProjects).catch(() => setProjects([]));
  useEffect(() => { refresh(); }, []);

  /** Start a project from one or more videos; several are laid end to end on the main track, each with its audio linked. */
  async function create(entries: { file: File; handle?: FileSystemFileHandle | null }[]) {
    const isVideo = (f: File) => f.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|m4v)$/i.test(f.name);
    const videos = entries.filter((x) => isVideo(x.file));
    if (!videos.length) {
      notify('Please choose a video file (MP4, MOV, WebM).', 'error');
      return;
    }
    if (importing.current) return; // a drop or pick while an import runs would start a second concurrent create
    importing.current = true;
    if (videos.length < entries.length) notify(`Skipped ${entries.length - videos.length} file(s) that are not videos.`, 'info');
    setBusy(true);
    const stored: string[] = [];
    let saved = false;
    try {
      let p: Project | null = null;
      let clips: Project['clips'] = [];
      let at = 0;
      for (const { file, handle } of videos) {
        const meta = await probeVideo(file);
        // Link to the original file when the browser allows it (no copy, any size); otherwise copy it into storage.
        const assetId = handle ? await db.putFileHandle(handle, file) : await db.putBlob(file);
        stored.push(assetId);
        const name = file.name.replace(/\.[^.]+$/, '');
        const sound = await hasAudio(file);
        const linkId = sound ? nanoid(6) : undefined;
        const v = makeVideoClip({ assetId, name, sourceDuration: meta.duration, start: at, width: meta.width, height: meta.height, linkId });
        clips = [...clips!, v, ...(sound ? [makeAudioClip({ assetId, name: `${name} audio`, sourceDuration: meta.duration, start: at, linkId, fromVideo: true })] : [])];
        at = clipEnd(v);
        p ??= {
          ...newProject(videos.length > 1 ? `${name} + ${videos.length - 1} more` : name),
          videoAssetId: assetId, videoWidth: meta.width, videoHeight: meta.height, duration: meta.duration, thumbnail: meta.thumbnail,
        };
      }
      p = withClips(p!, clips!);
      await db.putProject(p);
      saved = true;
      location.hash = `#/p/${p.id}`;
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      // No project references these copies if the import failed part-way.
      if (!saved) await Promise.all(stored.map((id) => db.deleteBlob(id).catch(() => undefined)));
      importing.current = false;
      setBusy(false);
    }
  }

  async function rename() {
    if (!toRename) return;
    try {
      const full = await db.getProject(toRename.p.id);
      if (full) await db.putProject({ ...full, name: toRename.name.trim() || full.name, updatedAt: Date.now() });
    } catch (e) {
      notify((e as Error).message, 'error');
    }
    setToRename(null);
    refresh();
  }

  /** Copy a project. The copy shares the same video/B-roll assets (no second copy of the file). */
  async function duplicate(p: db.ProjectSummary) {
    try {
      const full = await db.getProject(p.id);
      if (!full) return;
      const now = Date.now();
      await db.putProject({ ...full, id: nanoid(10), name: `${full.name} copy`, createdAt: now, updatedAt: now });
      notify(`Duplicated “${full.name}”`, 'success');
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      refresh();
    }
  }

  /** Delete a project; db.deleteProject keeps any video/B-roll asset another project (e.g. a duplicate) still uses. */
  async function remove(p: db.ProjectSummary) {
    try {
      await db.deleteProject(p.id);
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  const shown = useMemo(() => {
    if (!projects) return null;
    const q = query.trim().toLowerCase();
    const list = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : [...projects];
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
    else list.sort((a, b) => b.updatedAt - a.updatedAt);
    return list;
  }, [projects, query, sort]);

  const actions = (p: db.ProjectSummary, className?: string) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="icon-xs" className={className} aria-label={`Actions for ${p.name}`}><Ellipsis /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setToRename({ p, name: p.name })}><Pencil />Rename</DropdownMenuItem>
        <DropdownMenuItem onClick={() => duplicate(p)}><Copy />Duplicate</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => setToDelete(p)}><Trash2 />Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );



  const count = projects?.length ?? 0;
  const recent = useMemo(() => (projects ?? []).slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4), [projects]);

  async function blank() {
    try {
      const p = newProject('Untitled project');
      await db.putProject(p);
      location.hash = `#/p/${p.id}`;
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  const sideItem = 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-muted-foreground transition-colors outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50';

  const card = (p: db.ProjectSummary) => (
    <div key={p.id} className="group relative">
      <a href={`#/p/${p.id}`} aria-label={`Open ${p.name}`}
        className="relative block aspect-[9/12] overflow-hidden rounded-xl bg-stage ring-1 ring-foreground/10 transition-all duration-200 outline-none group-hover:ring-primary/60 focus-visible:ring-3 focus-visible:ring-ring/60">
        {p.thumbnail
          ? <img src={p.thumbnail} className="h-full w-full object-cover" alt="" />
          : <div className="grid h-full place-items-center bg-gradient-to-br from-[#6b1d33] to-[#f43f5e]/70 text-white/70"><Film className="size-7" /></div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <span className="absolute right-2 bottom-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white">{fmtDur(p.duration)}</span>
      </a>
      <div className="mt-2 flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium" title={p.name}>{p.name}</div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><Clock className="size-3" />{ago(p.updatedAt)}</div>
        </div>
        {actions(p, 'shrink-0 rounded-md')}
      </div>
    </div>
  );

  return (
    <div
      className="flex h-full bg-background"
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrag(false); }}
      onDrop={onDrop}
    >
      <input ref={input} type="file" accept="video/*" multiple hidden onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) create(fs.map((file) => ({ file }))); e.target.value = ''; }} />

      {/* Sidebar */}
      <aside className="app-sidebar hidden w-56 shrink-0 flex-col gap-1 border-r bg-card/60 p-3 md:flex">
        <a href="#" className="mb-3 rounded-lg px-2 py-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label="Keyframe.lk home"><Logo size={24} withWordmark /></a>
        <button type="button" onClick={browse} disabled={busy}
          className="mb-2 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-transform outline-none hover:scale-[1.02] focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60">
          {busy ? <Spinner className="size-4" /> : <Plus className="size-4" />}New project
        </button>
        <a href="#projects" className={cn(sideItem, 'bg-foreground/[0.07] text-foreground')}><LayoutGrid className="size-4" />Workspace</a>
        <div className="mt-4 mb-1 px-3 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">Tools</div>
        <button type="button" className={sideItem} onClick={() => openConverter(true)}><Languages className="size-4" />Unicode ⇄ FM</button>
        <button type="button" className={sideItem} onClick={() => openShortcuts(true)}><Keyboard className="size-4" />Shortcuts</button>
        <div className="mt-auto flex items-center justify-between px-1 pt-3 text-xs text-muted-foreground">
          <EngineStatus />
          <ThemeToggle />
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background/85 px-5 py-3 backdrop-blur md:px-8">
          <a href="#" className="md:hidden" aria-label="Keyframe.lk home"><Logo size={24} /></a>
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects" aria-label="Search projects" className="h-9 rounded-lg pl-9" />
          </div>
          <span className="ml-auto hidden text-xs text-muted-foreground lg:inline-flex"><ColomboClock /></span>
          <div className="md:hidden"><ThemeToggle /></div>
        </header>

        <div className="mx-auto w-full max-w-6xl px-5 py-6 md:px-8">
          {/* Create */}
          <h1 className="text-xl font-semibold tracking-tight">Start creating</h1>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button type="button" onClick={browse} disabled={busy}
              className="group relative flex h-36 flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-br from-[#6b1d33] via-[#f43f5e] to-[#ff7a59] p-4 text-left text-white shadow-lg outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/60 sm:col-span-2">
              <span className="absolute top-4 left-4 grid size-10 place-items-center rounded-full bg-white/20 backdrop-blur">{busy ? <Spinner className="size-4" /> : <Upload className="size-5" />}</span>
              <span className="text-lg font-semibold">{busy ? 'Importing…' : 'New project from video'}</span>
              <span className="text-xs text-white/80">Choose or drop a video. Auto-captions in Sinhala, English or both.</span>
            </button>
            <button type="button" onClick={blank}
              className="flex h-36 flex-col justify-end rounded-2xl border bg-card p-4 text-left outline-none transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50">
              <span className="mb-auto grid size-10 place-items-center rounded-full bg-foreground/[0.07]"><Plus className="size-5" /></span>
              <span className="text-[15px] font-medium">Blank workspace</span>
              <span className="text-xs text-muted-foreground">Open the editor, add a video later.</span>
            </button>
            <button type="button" onClick={() => openConverter(true)}
              className="flex h-36 flex-col justify-end rounded-2xl border bg-card p-4 text-left outline-none transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50">
              <span className="mb-auto grid size-10 place-items-center rounded-full bg-foreground/[0.07]"><Languages className="size-5" /></span>
              <span className="text-[15px] font-medium">Unicode ⇄ FM</span>
              <span className="text-xs text-muted-foreground">Convert Sinhala text.</span>
            </button>
          </div>
          <AlignerCard />

          {/* Recent */}
          {recent.length > 0 && !query && (
            <>
              <h2 className="mt-9 text-sm font-semibold text-muted-foreground">Continue editing</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {recent.map((p) => (
                  <a key={p.id} href={`#/p/${p.id}`} className="group flex items-center gap-3 rounded-xl border bg-card p-2 pr-3 outline-none transition-colors hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50">
                    <div className="h-14 w-11 shrink-0 overflow-hidden rounded-lg bg-stage">{p.thumbnail && <img src={p.thumbnail} className="h-full w-full object-cover" alt="" />}</div>
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground">{ago(p.updatedAt)}</div>
                    </div>
                  </a>
                ))}
              </div>
            </>
          )}

          {/* Projects */}
          <div id="projects" className="mt-9 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight">Projects</h2>
              {count > 0 && <span className="rounded-full bg-foreground/[0.07] px-2 py-0.5 font-mono text-xs text-muted-foreground">{count}</span>}
            </div>
            {count > 0 && (
              <div className="flex items-center gap-2">
                <Select value={sort} onValueChange={(v) => { setSort(v as SortKey); writePref('sincap.home.sort', v); }}>
                  <SelectTrigger className="h-8 w-[100px]" aria-label="Sort projects"><SelectValue /></SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="recent">Recent</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                  </SelectContent>
                </Select>
                <ToggleGroup type="single" size="sm" value={view} aria-label="View" className="rounded-lg bg-foreground/[0.06] p-0.5"
                  onValueChange={(v) => { if (v) { setView(v as ViewMode); writePref('sincap.home.view', v); } }}>
                  <ToggleGroupItem value="grid" aria-label="Grid view" className="data-[state=on]:bg-background data-[state=on]:shadow-sm"><LayoutGrid /></ToggleGroupItem>
                  <ToggleGroupItem value="list" aria-label="List view" className="data-[state=on]:bg-background data-[state=on]:shadow-sm"><Rows /></ToggleGroupItem>
                </ToggleGroup>
              </div>
            )}
          </div>

          <div className="mt-4">
            {shown === null ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {Array.from({ length: 5 }, (_, i) => <div key={i} className="aspect-[9/12] animate-pulse rounded-xl bg-muted" />)}
              </div>
            ) : count === 0 ? (
              <div className="rounded-2xl border border-dashed py-14 text-center text-sm text-muted-foreground">
                No projects yet. Create one above. Projects are saved in this browser.
              </div>
            ) : shown.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                No projects match “{query}”.
                <Button variant="link" size="sm" onClick={() => setQuery('')}>Clear search</Button>
              </div>
            ) : view === 'grid' ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{shown.map(card)}</div>
            ) : (
              <div className="flex flex-col gap-1">
                {shown.map((p) => (
                  <div key={p.id} className="group flex items-center gap-4 rounded-xl p-2 pr-3 transition-colors hover:bg-foreground/[0.05]">
                    <a href={`#/p/${p.id}`} className="flex min-w-0 flex-1 items-center gap-4 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                      <div className="h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-stage ring-1 ring-foreground/10">{p.thumbnail && <img src={p.thumbnail} className="h-full w-full object-cover" alt="" />}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-medium">{p.name}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{fmtDur(p.duration)} · {ago(p.updatedAt)}</div>
                      </div>
                    </a>
                    {actions(p, 'shrink-0 rounded-md')}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Drop anywhere */}
      {drag && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-md animate-in fade-in duration-150">
          <div className="flex flex-col items-center gap-4 rounded-[2rem] border-2 border-dashed border-foreground/30 px-16 py-14">
            <span className="grid size-16 place-items-center rounded-full bg-foreground text-background"><Upload className="size-7" /></span>
            <span className="text-2xl font-medium tracking-tight">Drop to start a project</span>
          </div>
        </div>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{toDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>The project and its local copy of the video are removed from this device. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={async () => { if (toDelete) await remove(toDelete); setToDelete(null); refresh(); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!toRename} onOpenChange={(o) => !o && setToRename(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Rename project</DialogTitle></DialogHeader>
          <Input autoFocus value={toRename?.name ?? ''} onChange={(e) => toRename && setToRename({ ...toRename, name: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') rename(); }} />
          <DialogFooter><Button onClick={rename}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
