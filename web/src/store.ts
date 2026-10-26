import { create } from 'zustand';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import type { AdjClip, Caption, CaptionStyle, Clip, OverlayItem, Project, ProjectAudio, Template, Word } from './types';
import { DEFAULT_STYLE } from './lib/style';
import { segmentWords, normalizeCaptions } from './lib/segment';
import { migrateVideo } from './lib/videoFx';
import { brollOverlay } from './lib/overlays';
import { clipsFromLegacy, withClips } from './lib/clips';
import * as db from './lib/db';

const HISTORY_LIMIT = 200;

export const DEFAULT_AUDIO: ProjectAudio = {
  original: { volume: 0, muted: false, enhance: false },
  tracks: [],
  ducking: { enabled: true, amountDb: -12, attack: 0.15, release: 0.45 },
  normalize: { enabled: true, targetLufs: -14 },
  sfx: { enabled: false, volume: -6, onWord: null, onEmphasis: 'pop', onCaption: null, onHook: 'riser' },
  snapToBeats: false,
};

/** Fill in fields added in newer versions so old saved projects keep working. */
export function migrateProject(p: Project): Project {
  const a = (p.audio ?? {}) as Partial<ProjectAudio>;
  const migrated: Project = {
    ...p,
    video: migrateVideo(p.video),
    audio: {
      ...DEFAULT_AUDIO,
      ...a,
      original: { ...DEFAULT_AUDIO.original, ...a.original },
      ducking: { ...DEFAULT_AUDIO.ducking, ...a.ducking },
      normalize: { ...DEFAULT_AUDIO.normalize, ...a.normalize },
      sfx: { ...DEFAULT_AUDIO.sfx, ...a.sfx },
      tracks: a.tracks ?? [],
    },
  };
  // B-roll images are now ordinary image overlays, with every layer control.
  if (migrated.broll?.length) {
    const frame = { w: migrated.videoWidth || 1080, h: migrated.videoHeight || 1920 };
    const list = [...(migrated.overlays ?? [])];
    for (const b of migrated.broll) list.push(brollOverlay(b, list, frame));
    migrated.overlays = list;
    migrated.broll = [];
  }
  const withC = migrated.clips ? migrated : withClips(migrated, clipsFromLegacy(migrated));
  // Filters, effects, transitions and keyframes used to be project-wide; they now live on each video clip.
  const legacy = p.video;
  const give = !!legacy && (legacy.effects?.length || legacy.keyframes?.length || legacy.presetId || legacy.transitionIn?.id !== 'none' || legacy.transitionOut?.id !== 'none');
  if (!give || !withC.clips?.some((c) => c.kind === 'video' && !c.fx)) return withC;
  return { ...withC, clips: withC.clips.map((c) => (c.kind === 'video' && !c.fx ? { ...c, fx: migrateVideo(legacy) } : c)), video: migrateVideo() };
}

export function newProject(name: string): Project {
  const now = Date.now();
  return {
    id: nanoid(10),
    name,
    createdAt: now,
    updatedAt: now,
    videoAssetId: null,
    videoWidth: 1080,
    videoHeight: 1920,
    duration: 0,
    thumbnail: null,
    language: 'si',
    words: [],
    captions: [],
    style: DEFAULT_STYLE,
    templateId: 'clean-pop',
    segmentation: { maxWords: 6, maxChars: 32, maxDuration: 3.5, splitOnPause: 0.6 },
    aspectRatio: 'original',
    fit: 'blur',
    hook: { enabled: false, text: '', start: 0, end: 3, y: 16, template: 'bold' },
    broll: [],
    audio: DEFAULT_AUDIO,
    video: migrateVideo(),
  };
}

interface EditorState {
  project: Project | null;
  past: Project[];
  future: Project[];
  lastCoalesce: { key: string; at: number } | null;
  /** Unsaved edits exist. Cleared once the exact edited project is written to storage. */
  dirty: boolean;
  saving: boolean;
  savedAt: number | null;

  time: number;
  playing: boolean;
  selectedCaptionId: string | null;
  /** Selected timeline clip (its linked partner is implied unless unlinked). */
  selectedClipId: string | null;
  /** Selected filter or effect clip on an adjustment track. */
  selectedAdjId: string | null;
  /** Selected text, sticker or image overlay. */
  selectedOverlayId: string | null;
  /** Overlays selected along with `selectedOverlayId` (shift-click, drag-select in the preview). */
  extraOverlayIds: string[];
  /** Selected audio track (music or sound effect). */
  selectedTrackId: string | null;
  /** Deleting a clip closes the gap it leaves. */
  rippleDelete: boolean;
  setRippleDelete: (v: boolean) => void;
  panel: PanelId;
  lastLeft: PanelId | null;
  lastRight: PanelId | null;
  customTemplates: Template[];
  converterOpen: boolean;
  shortcutsOpen: boolean;

  load: (p: Project) => void;
  close: () => void;
  /** Apply an edit. `coalesce` merges rapid edits with the same key (slider drags) into one undo step. */
  update: (fn: (p: Project) => Project, coalesce?: string) => void;
  /** Update without creating an undo step (e.g. thumbnail, metadata). */
  patchSilently: (patch: Partial<Project>) => void;
  undo: () => void;
  redo: () => void;

  setStyle: (fn: (s: CaptionStyle) => CaptionStyle, coalesce?: string) => void;
  setCaptions: (captions: Caption[], coalesce?: string) => void;
  setWords: (words: Word[], resegment: boolean) => void;
  resegment: () => void;

  setTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  select: (id: string | null) => void;
  selectClip: (id: string | null) => void;
  selectAdj: (id: string | null) => void;
  selectOverlay: (id: string | null) => void;
  /** Select several overlays at once; the first becomes the one the inspector shows. */
  setOverlaySelection: (ids: string[]) => void;
  selectTrack: (id: string | null) => void;
  setOverlays: (fn: (list: OverlayItem[]) => OverlayItem[], coalesce?: string) => void;
  setAdj: (fn: (adj: AdjClip[]) => AdjClip[], coalesce?: string) => void;
  /** Edit the clips; project length and the primary video follow. */
  setClips: (fn: (clips: Clip[]) => Clip[], coalesce?: string) => void;
  setPanel: (p: PanelId) => void;
  setCustomTemplates: (t: Template[]) => void;
  setConverterOpen: (v: boolean) => void;
  setShortcutsOpen: (v: boolean) => void;
  notify: (text: string, kind?: 'info' | 'error' | 'success') => void;
}

export type PanelId =
  | 'media' | 'captions' | 'overlays' | 'sounds' | 'transitions' | 'effects' | 'filters' | 'templates' | 'motion'
  | 'style' | 'display' | 'animation' | 'layout' | 'clip' | 'adjust' | 'layer' | 'overlay' | 'audio' | 'ai' | 'export' | 'usage';
/** Left pane tabs (library) and right pane tabs (inspector), in shortcut order (keys 1-9 pick the first nine). */
export const LEFT_PANELS: PanelId[] = ['media', 'captions', 'overlays', 'sounds', 'transitions', 'effects', 'filters', 'templates', 'motion'];
export const RIGHT_PANELS: PanelId[] = ['style', 'display', 'animation', 'layout', 'clip', 'adjust', 'layer', 'overlay', 'audio', 'ai', 'export'];
export const PANELS: PanelId[] = [...LEFT_PANELS, ...RIGHT_PANELS, 'usage'];

/** What the inspector (right pane) shows, depending on what is selected on the timeline: like CapCut's contextual panel. */
export type InspectorContext = 'overlay' | 'adj' | 'video' | 'audio' | 'caption' | 'none';
export function inspectorContext(s: Pick<EditorState, 'selectedOverlayId' | 'selectedAdjId' | 'selectedClipId' | 'selectedCaptionId' | 'project'>): InspectorContext {
  if (s.selectedOverlayId) return 'overlay';
  if (s.selectedAdjId) return 'adj';
  if (s.selectedClipId) return s.project?.clips?.find((c) => c.id === s.selectedClipId)?.kind === 'audio' ? 'audio' : 'video';
  if (s.selectedCaptionId) return 'caption';
  return 'none';
}
export const INSPECTOR_TABS: Record<InspectorContext, PanelId[]> = {
  overlay: ['overlay', 'export'],
  adj: ['layer', 'export'],
  video: ['clip', 'adjust', 'audio', 'export'],
  audio: ['clip', 'audio', 'export'],
  caption: ['style', 'display', 'animation', 'layout', 'ai', 'export'],
  none: ['style', 'display', 'animation', 'layout', 'audio', 'ai', 'export'],
};

export const useEditor = create<EditorState>((set, get) => ({
  project: null,
  past: [],
  future: [],
  lastCoalesce: null,
  dirty: false,
  saving: false,
  savedAt: null,
  time: 0,
  playing: false,
  selectedCaptionId: null,
  selectedClipId: null,
  selectedAdjId: null,
  selectedOverlayId: null,
  extraOverlayIds: [],
  selectedTrackId: null,
  rippleDelete: false,
  setRippleDelete: (rippleDelete) => set({ rippleDelete }),
  panel: 'media',
  lastLeft: 'media',
  lastRight: 'style',
  customTemplates: [],
  converterOpen: false,
  shortcutsOpen: false,

  load: (p) => {
    void saveNow(); // switching projects: keep the previous one's pending edits
    rememberLastProject(p.id);
    set({ project: migrateProject(p), past: [], future: [], time: 0, playing: false, selectedCaptionId: null, selectedClipId: null, selectedAdjId: null, selectedOverlayId: null, extraOverlayIds: [], selectedTrackId: null, dirty: false, savedAt: p.updatedAt });
  },
  close: () => {
    void saveNow();
    if (get().project) rememberLastProject(null);
    set({ project: null, past: [], future: [], playing: false, dirty: false });
  },

  update: (fn, coalesce) => {
    const { project, past, lastCoalesce } = get();
    if (!project) return;
    const next = { ...fn(project), updatedAt: Date.now() };
    const now = performance.now();
    const merge = coalesce && lastCoalesce && lastCoalesce.key === coalesce && now - lastCoalesce.at < 800;
    set({
      project: next,
      past: merge ? past : [...past.slice(-HISTORY_LIMIT + 1), project],
      future: [],
      lastCoalesce: coalesce ? { key: coalesce, at: now } : null,
      dirty: true,
    });
  },
  patchSilently: (patch) => {
    const { project } = get();
    if (!project) return;
    set({ project: { ...project, ...patch }, dirty: true });
  },
  undo: () => {
    const { past, project, future } = get();
    if (!project || past.length === 0) return;
    const prev = past[past.length - 1];
    set({ project: prev, past: past.slice(0, -1), future: [project, ...future], lastCoalesce: null, dirty: true });
  },
  redo: () => {
    const { past, project, future } = get();
    if (!project || future.length === 0) return;
    const [next, ...rest] = future;
    set({ project: next, past: [...past, project], future: rest, lastCoalesce: null, dirty: true });
  },

  setStyle: (fn, coalesce) => get().update((p) => ({ ...p, style: fn(p.style), templateId: p.templateId }), coalesce),
  setCaptions: (captions, coalesce) => get().update((p) => ({ ...p, captions: normalizeCaptions(captions) }), coalesce),
  setWords: (words, resegment) =>
    get().update((p) => ({ ...p, words, captions: resegment ? segmentWords(words, p.segmentation) : p.captions })),
  resegment: () =>
    get().update((p) => {
      // Re-segment from the current caption words so text edits and emphasis are preserved.
      const words = p.captions.flatMap((c) => c.words);
      return { ...p, words, captions: segmentWords(words, p.segmentation) };
    }),

  setTime: (t) => set({ time: t }),
  setPlaying: (playing) => set({ playing }),
  select: (id) => set({ extraOverlayIds: [], selectedTrackId: id ? null : get().selectedTrackId, selectedCaptionId: id, selectedClipId: id ? null : get().selectedClipId, selectedAdjId: id ? null : get().selectedAdjId, selectedOverlayId: id ? null : get().selectedOverlayId }),
  selectClip: (id) => set({ extraOverlayIds: [], selectedTrackId: id ? null : get().selectedTrackId, selectedClipId: id, selectedCaptionId: id ? null : get().selectedCaptionId, selectedAdjId: id ? null : get().selectedAdjId, selectedOverlayId: id ? null : get().selectedOverlayId }),
  selectAdj: (id) => set({ extraOverlayIds: [], selectedTrackId: id ? null : get().selectedTrackId, selectedAdjId: id, selectedClipId: id ? null : get().selectedClipId, selectedCaptionId: id ? null : get().selectedCaptionId, selectedOverlayId: id ? null : get().selectedOverlayId }),
  selectOverlay: (id) => set({ extraOverlayIds: [], selectedTrackId: id ? null : get().selectedTrackId, selectedOverlayId: id, selectedClipId: id ? null : get().selectedClipId, selectedCaptionId: id ? null : get().selectedCaptionId, selectedAdjId: id ? null : get().selectedAdjId }),
  selectTrack: (id) => set({ extraOverlayIds: [], selectedTrackId: id, selectedClipId: id ? null : get().selectedClipId, selectedCaptionId: id ? null : get().selectedCaptionId, selectedAdjId: id ? null : get().selectedAdjId, selectedOverlayId: id ? null : get().selectedOverlayId }),
  setOverlaySelection: (ids) => set({ selectedOverlayId: ids[0] ?? null, extraOverlayIds: ids.slice(1), selectedTrackId: null, selectedClipId: null, selectedCaptionId: null, selectedAdjId: null }),
  setOverlays: (fn, coalesce) => get().update((p) => ({ ...p, overlays: fn(p.overlays ?? []) }), coalesce),
  setAdj: (fn, coalesce) => get().update((p) => ({ ...p, adj: fn(p.adj ?? []) }), coalesce),
  setClips: (fn, coalesce) => get().update((p) => withClips(p, fn(p.clips ?? [])), coalesce),
  setPanel: (panel) => set((s) => ({
    panel,
    lastLeft: LEFT_PANELS.includes(panel) ? panel : s.lastLeft,
    lastRight: RIGHT_PANELS.includes(panel) || panel === 'usage' ? panel : s.lastRight,
  })),
  setCustomTemplates: (customTemplates) => set({ customTemplates }),
  setConverterOpen: (converterOpen) => set({ converterOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  notify: (raw, kind = 'info') => {
    const text = raw?.trim() || (kind === 'error' ? 'Something went wrong. Check the browser console for details.' : 'Done.');
    if (kind === 'error') toast.error(text);
    else if (kind === 'success') toast.success(text);
    else toast(text);
  },
}));

// ---- Saving -------------------------------------------------------------------
// Edits autosave every 5 s, and immediately when leaving the project, switching tabs or
// closing the window, so reopening the app always finds the latest version.

const AUTOSAVE_MS = 5000;
let inflight: Promise<void> | null = null;

/** Write the open project now if it has unsaved edits. Safe to call often; writes run in order. */
export function saveNow(): Promise<void> {
  const { project, dirty } = useEditor.getState();
  if (!project || !dirty) return inflight ?? Promise.resolve();
  useEditor.setState({ saving: true });
  const job: Promise<void> = (inflight ?? Promise.resolve()).then(() => db.putProject(project)).then(() => {
    const s = useEditor.getState();
    // Only mark clean if nothing changed while this write was running.
    useEditor.setState({ savedAt: Date.now(), dirty: s.project === project ? false : s.dirty });
  });
  inflight = job;
  void job.finally(() => {
    if (inflight === job) { inflight = null; useEditor.setState({ saving: false }); }
  });
  return job;
}

if (typeof window !== 'undefined') {
  setInterval(() => { void saveNow(); }, AUTOSAVE_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void saveNow(); });
  window.addEventListener('pagehide', () => { void saveNow(); });
}

// ---- Reopen on next launch ----------------------------------------------------

const LAST_PROJECT_KEY = 'keyframe.lastProject';

export function rememberLastProject(id: string | null) {
  try {
    if (id) localStorage.setItem(LAST_PROJECT_KEY, id);
    else localStorage.removeItem(LAST_PROJECT_KEY);
  } catch { /* storage unavailable */ }
}

/** The project that was open when the app was last closed (null if the user was on the home page). */
export function lastProjectId(): string | null {
  try { return localStorage.getItem(LAST_PROJECT_KEY); } catch { return null; }
}

export const selectors = {
  canUndo: (s: EditorState) => s.past.length > 0,
  canRedo: (s: EditorState) => s.future.length > 0,
};
