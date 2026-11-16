import type {
  MotionScene, BrollPlanRequest, BrollPlanResponse, DescriptionRequest, DescriptionResponse, EmphasisRequest, EmphasisResponse,
  HealthResponse, HookRequest, HookResponse, MusicMoodRequest, MusicMoodResponse, MusicSearchResponse, SfxSearchResponse, ProofreadRequest, ProofreadResponse, TranscribeResponse, UsageResponse,
} from '../types';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function json<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'Could not reach the Keyframe.lk server. Is it running? (cd server && npm run dev)');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export async function health(): Promise<HealthResponse | null> {
  try {
    const res = await fetch('/api/health');
    return res.ok ? ((await res.json()) as HealthResponse) : null;
  } catch {
    return null;
  }
}

/** Upload media as a raw body (streams on the server) and get word timings back. */
/** Sentence for the "captions generated" toast saying whether word times were matched to the audio. */
export function alignmentNote(res: TranscribeResponse): string {
  const a = res.alignment;
  if (!a) return '';
  if (a.aligned >= a.total) return ' Word timings matched to the audio.';
  const why = a.reason ? ` (${a.reason})` : '';
  if (a.aligned === 0) return ` Word timings were NOT matched to the audio and may drift${why}.`;
  return ` Word timings matched for ${a.aligned} of ${a.total} sections; the rest may drift${why}.`;
}

export function transcribe(
  file: Blob,
  opts: { language: 'si' | 'en' | 'auto'; provider: 'auto' | 'elevenlabs' | 'gemini' | 'openai'; onUpload?: (p: number) => void; signal?: AbortSignal },
): Promise<TranscribeResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/transcribe?language=${opts.language}&provider=${opts.provider}`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) opts.onUpload?.(e.loaded / e.total); };
    xhr.onload = () => {
      let data: unknown = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON error */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as TranscribeResponse);
      else reject(new ApiError(xhr.status, (data as { error?: string }).error ?? `Transcription failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new ApiError(0, 'Could not reach the Keyframe.lk server. Is it running? (cd server && npm run dev)'));
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
    opts.signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(file);
  });
}

export const ai = {
  emphasis: (b: EmphasisRequest) => json<EmphasisResponse>('/api/ai/emphasis', b),
  hook: (b: HookRequest) => json<HookResponse>('/api/ai/hook', b),
  description: (b: DescriptionRequest) => json<DescriptionResponse>('/api/ai/description', b),
  proofread: (b: ProofreadRequest) => json<ProofreadResponse & { warning?: string }>('/api/ai/proofread', b),
  broll: (b: BrollPlanRequest) => json<BrollPlanResponse>('/api/ai/broll', b),
  musicMood: (b: MusicMoodRequest) => json<MusicMoodResponse>('/api/ai/music-mood', b),
  /** Claude writes a motion graphic / transition scene. Slow (10-40 s), so it can be cancelled. */
  motion: (b: MotionRequest, signal?: AbortSignal) => json<MotionResponse>('/api/ai/motion', b, signal),
};

export interface MotionRequest {
  prompt: string;
  role: 'graphic' | 'transition' | 'background';
  duration?: number;
  frame: { w: number; h: number };
  palette?: string[];
  fonts?: { english?: string; sinhala?: string };
  base?: MotionScene;
}
export interface MotionResponse { scene: MotionScene; via: 'claude-cli' | 'claude' | 'gemini'; costUsd: number | null; ms: number }

export interface ClaudeStatus {
  cli: { found: boolean; version: string | null; loggedIn: boolean; account?: { email?: string; plan?: string; method?: string }; error?: string };
  api: boolean;
  gemini: boolean;
}
/** Is the Claude Code CLI installed and signed in on this computer? */
export async function claudeStatus(refresh = false): Promise<ClaudeStatus | null> {
  try {
    const res = await fetch(`/api/claude/status${refresh ? '?refresh=1' : ''}`);
    return res.ok ? ((await res.json()) as ClaudeStatus) : null;
  } catch { return null; }
}

export async function usage(): Promise<UsageResponse> {
  const res = await fetch('/api/usage').catch(() => null);
  if (!res) throw new ApiError(0, 'Could not reach the Keyframe.lk server.');
  if (!res.ok) throw new ApiError(res.status, `Usage request failed (${res.status})`);
  return (await res.json()) as UsageResponse;
}

export async function resetUsage(): Promise<void> {
  const res = await fetch('/api/usage', { method: 'DELETE' }).catch(() => null);
  if (!res) throw new ApiError(0, 'Could not reach the Keyframe.lk server.');
  if (!res.ok) throw new ApiError(res.status, `Reset failed (${res.status})`);
}

export async function sfxSearch(q: string, page = 1, signal?: AbortSignal): Promise<SfxSearchResponse> {
  const res = await fetch(`/api/sfx/search?${new URLSearchParams({ q, page: String(page) })}`, { signal }).catch(() => null);
  if (!res) throw new ApiError(0, 'Could not reach the Keyframe.lk server. Start it with npm run dev.');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Sound search failed (${res.status})`);
  return data as SfxSearchResponse;
}

export async function musicSearch(params: { q?: string; mood?: string; genre?: string; bpmMin?: number; bpmMax?: number }, signal?: AbortSignal): Promise<MusicSearchResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v));
  const res = await fetch(`/api/music/search?${qs}`, { signal }).catch(() => null);
  if (!res) throw new ApiError(0, 'Could not reach the Keyframe.lk server.');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Music search failed (${res.status})`);
  return data as MusicSearchResponse;
}

export type KeyName = 'GEMINI_API_KEY' | 'ELEVENLABS_API_KEY' | 'OPENAI_API_KEY' | 'ANTHROPIC_API_KEY';
export type KeyStatus = Record<KeyName, { set: boolean; hint: string }>;

export async function getKeys(): Promise<KeyStatus | null> {
  try {
    const res = await fetch('/api/keys');
    return res.ok ? ((await res.json()) as KeyStatus) : null;
  } catch {
    return null;
  }
}

/** Set (string) or remove (null) keys on the server; saved to server/.env. Returns the masked status. */
export async function saveKeys(keys: Partial<Record<KeyName, string | null>>): Promise<KeyStatus> {
  let res: Response;
  try {
    res = await fetch('/api/keys', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(keys) });
  } catch {
    throw new ApiError(0, 'Could not reach the Keyframe.lk server. Is it running? (cd server && npm run dev)');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as KeyStatus;
}
