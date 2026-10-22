import { kvGet, kvSet } from './db';
import { downloadBlob, safeFilename } from './util';

export type SaveMode = 'downloads' | 'folder' | 'ask';

export interface SavePrefs {
  mode: SaveMode;
  /** Name pattern for exported videos. Tokens: {project} {kind} {date} {time} {res}. */
  videoName: string;
  /** Name pattern for subtitle / transcript files. */
  textName: string;
  folder: FileSystemDirectoryHandle | null;
}

export const DEFAULT_SAVE_PREFS: SavePrefs = { mode: 'downloads', videoName: '{project}-{kind}', textName: '{project}', folder: null };

const KEY = 'savePrefs';

type PermHandle = FileSystemDirectoryHandle & {
  queryPermission(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(o: { mode: 'readwrite' }): Promise<PermissionState>;
};
type Win = Window & {
  showDirectoryPicker?: (o?: object) => Promise<FileSystemDirectoryHandle>;
  showSaveFilePicker?: (o?: object) => Promise<FileSystemFileHandle>;
};

export const canPickFolder = () => typeof window !== 'undefined' && !!(window as Win).showDirectoryPicker;

export async function loadSavePrefs(): Promise<SavePrefs> {
  const saved = await kvGet<Partial<SavePrefs>>(KEY).catch(() => undefined);
  return { ...DEFAULT_SAVE_PREFS, ...saved };
}

export async function storeSavePrefs(p: SavePrefs): Promise<void> {
  await kvSet(KEY, p).catch(() => undefined);
}

export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return (await (window as Win).showDirectoryPicker!({ id: 'keyframe-exports', mode: 'readwrite', startIn: 'videos' })) ?? null;
  } catch (e) {
    if ((e as Error).name === 'AbortError') return null;
    throw e;
  }
}

export interface NameVars { project: string; kind?: string; res?: string }

/** Fill a name pattern. Unknown tokens are kept, empty tokens drop their dangling separator. */
export function formatName(pattern: string, v: NameVars, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const vars: Record<string, string> = {
    project: v.project,
    kind: v.kind ?? '',
    res: v.res ?? '',
    date: `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`,
    time: `${p(now.getHours())}${p(now.getMinutes())}`,
  };
  const out = pattern.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m)).replace(/[-_ .]+$/g, '').replace(/^[-_ .]+/, '');
  return safeFilename(out || v.project);
}

async function uniqueName(dir: FileSystemDirectoryHandle, name: string): Promise<string> {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? name : `${stem} (${n})${ext}`;
    try { await dir.getFileHandle(candidate); } catch { return candidate; }
  }
  return name;
}

/** Save a finished file where the user chose. Returns a short description of where it went. */
export async function saveFile(blob: Blob, filename: string, prefs: SavePrefs): Promise<string> {
  const win = window as Win;
  if (prefs.mode === 'folder' && prefs.folder) {
    const dir = prefs.folder as PermHandle;
    let perm = await dir.queryPermission({ mode: 'readwrite' }).catch(() => 'denied' as PermissionState);
    if (perm !== 'granted') perm = await dir.requestPermission({ mode: 'readwrite' }).catch(() => 'denied' as PermissionState);
    if (perm === 'granted') {
      const name = await uniqueName(dir, filename);
      const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await w.write(blob);
      await w.close();
      return `${dir.name}/${name}`;
    }
  }
  if (prefs.mode === 'ask' && win.showSaveFilePicker) {
    const ext = filename.slice(filename.lastIndexOf('.'));
    const handle = await win.showSaveFilePicker({ suggestedName: filename, types: [{ description: ext.slice(1).toUpperCase(), accept: { [blob.type || 'application/octet-stream']: [ext] } }] });
    const w = await handle.createWritable();
    await w.write(blob);
    await w.close();
    return handle.name;
  }
  downloadBlob(blob, filename);
  return filename;
}
