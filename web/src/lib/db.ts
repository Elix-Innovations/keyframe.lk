/**
 * Minimal IndexedDB persistence (no dependencies).
 *
 * Database "sincap-studio":
 *   projects  (keyPath id)  -> Project
 *   blobs     (out-of-line) -> Blob          key: generated id
 *   templates (keyPath id)  -> Template
 *   fonts     (out-of-line) -> { def, blob } key: FontDef.id
 *   kv        (out-of-line) -> any
 */
import { nanoid } from 'nanoid';
import type { FontDef, Project, Template } from '../types';

// Legacy name from before the Keyframe.lk rename. Keep it, or existing projects disappear.
const DB_NAME = 'sincap-studio';
const DB_VERSION = 1;

type StoreName = 'projects' | 'blobs' | 'templates' | 'fonts' | 'kv';

export interface StoredFont { def: FontDef; blob: Blob }

/** Project list entry: the project without its heavy transcription/caption arrays. */
export type ProjectSummary = Omit<Project, 'words' | 'captions'>;

let dbPromise: Promise<IDBDatabase> | null = null;

// ---- Storage health & session fallback ---------------------------------------
// If the browser refuses to store data (quota errors, blocked site data), the app keeps
// working for the current session with in-memory copies, and tells the user how to fix it.

const memBlobs = new Map<string, Blob>();
const memProjects = new Map<string, Project>();
let storageBlocked = false;
const storageListeners = new Set<(blocked: boolean) => void>();

export function isStorageBlocked() { return storageBlocked; }
export function onStorageBlocked(fn: (blocked: boolean) => void) {
  storageListeners.add(fn);
  return () => { storageListeners.delete(fn); };
}
function markBlocked(e: unknown) {
  console.warn('[db] browser storage refused a write; keeping data in memory and retrying', e);
  if (!storageBlocked) { storageBlocked = true; storageListeners.forEach((f) => f(true)); }
  scheduleRetry();
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => { retryTimer = null; void retryStorage(); }, 15000);
}

/**
 * Storage errors are often transient (one oversized write, a quota hiccup). Probe with a small
 * write; if it works, flush everything kept in memory and clear the warning.
 */
export async function retryStorage(): Promise<boolean> {
  try {
    await run('kv', 'readwrite', (s) => s.put(Date.now(), '__probe'));
  } catch {
    scheduleRetry();
    return false;
  }
  for (const [id, blob] of [...memBlobs]) {
    if (!id.startsWith('mem:')) continue;
    try { await run('blobs', 'readwrite', (s) => s.put(blob, id)); } catch { /* keep in memory; still readable this session */ }
  }
  for (const p of [...memProjects.values()]) {
    try { await run('projects', 'readwrite', (s) => s.put(p)); memProjects.delete(p.id); } catch { scheduleRetry(); return false; }
  }
  if (storageBlocked) { storageBlocked = false; storageListeners.forEach((f) => f(false)); }
  return true;
}
const isQuota = (e: unknown) => (e as { name?: string })?.name === 'QuotaExceededError';

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      if (!db.objectStoreNames.contains('templates')) db.createObjectStore('templates', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('fonts')) db.createObjectStore('fonts');
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab upgraded the schema: close so it can proceed; reopen lazily.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
    req.onblocked = () => console.warn('[db] open blocked by another tab');
  });
  // Ask the browser not to evict our data (best effort).
  try {
    void navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    /* ignore */
  }
  return dbPromise;
}

/** Run one request against a store and resolve with its result once the transaction commits. */
async function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    let result: T;
    promisify(fn(tx.objectStore(store))).then((r) => (result = r), reject);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

// ---- Projects --------------------------------------------------------------

export async function listProjects(): Promise<ProjectSummary[]> {
  let all: Project[] = [];
  try {
    all = await run<Project[]>('projects', 'readonly', (s) => s.getAll() as IDBRequest<Project[]>);
  } catch (e) {
    console.warn('[db] could not read projects', e);
  }
  const byId = new Map(all.map((p) => [p.id, p]));
  for (const p of memProjects.values()) byId.set(p.id, p);
  return [...byId.values()]
    .map(({ words: _w, captions: _c, ...rest }) => rest)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<Project | undefined> {
  const mem = memProjects.get(id);
  if (mem) return mem;
  return run<Project | undefined>('projects', 'readonly', (s) => s.get(id) as IDBRequest<Project | undefined>);
}

/** Save a project. Never throws: if storage is blocked the project is kept for this session. */
export async function putProject(project: Project): Promise<void> {
  try {
    await run('projects', 'readwrite', (s) => s.put(project));
    memProjects.delete(project.id);
    if (storageBlocked) void retryStorage();
  } catch (e) {
    memProjects.set(project.id, project);
    markBlocked(e);
  }
}

/** Every stored file a project points at (video, B-roll images, music). */
function assetsOf(p: Project): string[] {
  return [p.videoAssetId, ...(p.clips ?? []).map((c) => c.assetId), ...(p.audio?.original?.denoise ? [p.audio.original.denoise.assetId] : []), ...Object.values(p.audio?.original?.denoiseBy ?? {}).map((d) => d.assetId), ...(p.broll ?? []).map((b) => b.assetId), ...(p.audio?.tracks ?? []).map((t) => t.assetId)]
    .filter((x): x is string => !!x);
}

/**
 * Delete a project and the files only it uses. Files still referenced by another project
 * (e.g. after "Duplicate") are kept.
 */
export async function deleteProject(id: string): Promise<void> {
  const mem = memProjects.get(id);
  memProjects.delete(id);
  const db = await openDB();
  let orphans: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['projects', 'blobs'], 'readwrite');
    const projects = tx.objectStore('projects');
    const blobs = tx.objectStore('blobs');
    const req = projects.getAll() as IDBRequest<Project[]>;
    req.onsuccess = () => {
      const all = req.result;
      const target = all.find((p) => p.id === id) ?? mem;
      if (target) {
        const stillUsed = new Set([...all, ...memProjects.values()].filter((p) => p.id !== id).flatMap(assetsOf));
        orphans = assetsOf(target).filter((a) => !stillUsed.has(a));
        for (const a of orphans) blobs.delete(a);
      }
      projects.delete(id);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
  for (const a of orphans) memBlobs.delete(a);
  await removeOPFSBlobs(orphans);
}

// ---- Blobs -----------------------------------------------------------------
//
// Videos can be hundreds of MB. Chrome's IndexedDB often rejects values that large
// (QuotaExceededError even with plenty of quota), so blobs live in the Origin Private
// File System, streamed to disk. IndexedDB remains the fallback (older browsers, and
// projects created before this change).

const hasOPFS = () =>
  typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory &&
  typeof FileSystemFileHandle !== 'undefined' && 'createWritable' in FileSystemFileHandle.prototype;

async function blobDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('blobs', { create: true });
}

/** Turn storage failures into a message a person can act on. */
function storageError(e: unknown, size: number): Error {
  const name = (e as { name?: string })?.name;
  const mb = Math.round(size / 1024 / 1024);
  if (name === 'QuotaExceededError') {
    return new Error(`Not enough browser storage to keep this ${mb} MB video. Free up disk space or delete old projects, then try again.`);
  }
  const msg = (e as Error)?.message;
  return new Error(msg ? `Could not save the video: ${msg}` : `Could not save the ${mb} MB video in browser storage (${name ?? 'unknown error'}).`);
}

/** Store a blob and return its new id. Falls back to a session-only copy if storage is blocked. */
export async function putBlob(blob: Blob): Promise<string> {
  const id = nanoid();
  let lastErr: unknown = null;
  if (hasOPFS()) {
    let dir: FileSystemDirectoryHandle | null = null;
    try {
      dir = await blobDir();
      const handle = await dir.getFileHandle(id, { create: true });
      const writable = await handle.createWritable();
      await blob.stream().pipeTo(writable); // closes the writable when done
      await kvSet(`blob-type:${id}`, blob.type).catch(() => undefined);
      return id;
    } catch (e) {
      await dir?.removeEntry(id).catch(() => undefined);
      lastErr = e;
    }
  }
  try {
    await run('blobs', 'readwrite', (s) => s.put(blob, id));
    return id;
  } catch (e) {
    lastErr = e;
  }
  if (isQuota(lastErr)) {
    const memId = `mem:${id}`;
    memBlobs.set(memId, blob);
    markBlocked(lastErr);
    return memId;
  }
  throw storageError(lastErr, blob.size);
}

/**
 * Remember a file on disk by its File System Access handle instead of copying it.
 * Big videos then cost ~1 KB of browser storage. Chrome/Edge only.
 */
export async function putFileHandle(handle: FileSystemFileHandle, file: File): Promise<string> {
  const id = `h:${nanoid()}`;
  memBlobs.set(id, file); // instant access this session, no permission prompt needed
  try {
    await run('blobs', 'readwrite', (s) => s.put(handle, id));
  } catch (e) {
    markBlocked(e);
  }
  return id;
}

/** Thrown when a remembered file needs the user to re-grant read access (after a reload). */
export class NeedsPermissionError extends Error {
  constructor(public handle: FileSystemFileHandle, public assetId: string) {
    super(`Allow Keyframe.lk to read “${handle.name}” again.`);
    this.name = 'NeedsPermissionError';
  }
}

type PermissionHandle = FileSystemFileHandle & {
  queryPermission?: (d: { mode: 'read' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'read' }) => Promise<PermissionState>;
};

/** Ask for read access to a remembered file (must be called from a click). */
export async function grantFileAccess(err: NeedsPermissionError): Promise<Blob | undefined> {
  const h = err.handle as PermissionHandle;
  const state = await h.requestPermission?.({ mode: 'read' });
  if (state && state !== 'granted') return undefined;
  const file = await h.getFile();
  memBlobs.set(err.assetId, file);
  return file;
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  const mem = memBlobs.get(id);
  if (mem) return mem;
  if (id.startsWith('mem:')) {
    // Session copy that may have been flushed to IndexedDB once storage recovered.
    return run<Blob | undefined>('blobs', 'readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>).catch(() => undefined);
  }
  if (id.startsWith('h:')) {
    const handle = await run<PermissionHandle | undefined>('blobs', 'readonly', (s) => s.get(id) as IDBRequest<PermissionHandle | undefined>);
    if (!handle) return undefined;
    const state = (await handle.queryPermission?.({ mode: 'read' })) ?? 'granted';
    if (state !== 'granted') throw new NeedsPermissionError(handle, id);
    try {
      const file = await handle.getFile();
      memBlobs.set(id, file);
      return file;
    } catch {
      return undefined; // moved or deleted on disk
    }
  }
  if (hasOPFS()) {
    try {
      const file = await (await (await blobDir()).getFileHandle(id)).getFile();
      const type = (await kvGet<string>(`blob-type:${id}`).catch(() => undefined)) ?? '';
      // Re-wrap to restore the MIME type; this references the file on disk, it does not copy it.
      return type && file.type !== type ? new File([file], id, { type }) : file;
    } catch {
      /* not in OPFS: fall through to IndexedDB */
    }
  }
  return run<Blob | undefined>('blobs', 'readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>);
}

export async function deleteBlob(id: string): Promise<void> {
  memBlobs.delete(id);
  await removeOPFSBlobs([id]);
  await run('blobs', 'readwrite', (s) => s.delete(id));
}

async function removeOPFSBlobs(ids: string[]): Promise<void> {
  if (!hasOPFS() || ids.length === 0) return;
  const dir = await blobDir().catch(() => null);
  if (!dir) return;
  await Promise.all(ids.map(async (id) => {
    await dir.removeEntry(id).catch(() => undefined);
    await run('kv', 'readwrite', (s) => s.delete(`blob-type:${id}`)).catch(() => undefined);
  }));
}

// ---- Templates -------------------------------------------------------------

export async function listTemplates(): Promise<Template[]> {
  const all = await run<Template[]>('templates', 'readonly', (s) => s.getAll() as IDBRequest<Template[]>);
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function putTemplate(template: Template): Promise<void> {
  await run('templates', 'readwrite', (s) => s.put(template));
}

export async function deleteTemplate(id: string): Promise<void> {
  await run('templates', 'readwrite', (s) => s.delete(id));
}

// ---- Fonts -----------------------------------------------------------------

export async function listFonts(): Promise<StoredFont[]> {
  return run<StoredFont[]>('fonts', 'readonly', (s) => s.getAll() as IDBRequest<StoredFont[]>);
}

export async function putFont(def: FontDef, blob: Blob): Promise<void> {
  await run('fonts', 'readwrite', (s) => s.put({ def, blob } satisfies StoredFont, def.id));
}

export async function deleteFont(id: string): Promise<void> {
  await run('fonts', 'readwrite', (s) => s.delete(id));
}

// ---- Key/value -------------------------------------------------------------

export async function kvGet<T = unknown>(key: string): Promise<T | undefined> {
  return run<T | undefined>('kv', 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  await run('kv', 'readwrite', (s) => s.put(value, key));
}
