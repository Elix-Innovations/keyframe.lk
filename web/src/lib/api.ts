import type {
  BrollPlanRequest, BrollPlanResponse, DescriptionRequest, DescriptionResponse, EmphasisRequest, EmphasisResponse,
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
};

export async function usage(): Promise<UsageResponse> {
  const res = await fetch('/api/usage').catch(() => null);
  if (!res) throw new ApiError(0, 'Could not reach the Keyframe.lk server.');
  if (!res.ok) throw new ApiError(res.status, `Usage request failed (${res.status})`);
  return (await res.json()) as UsageResponse;
}

export async function resetUsage(): Promise<void> {
  await fetch('/api/usage', { method: 'DELETE' });
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
