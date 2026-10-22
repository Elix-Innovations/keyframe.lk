// API contracts shared with the web app.
// Copied from web/src/types.ts ("Server API contracts") — keep the two in sync.

export interface TranscribeResponse {
  provider: string;
  language: string;
  duration: number;
  words: { text: string; start: number; end: number }[];
}

export interface HealthResponse {
  ok: true;
  transcription: { elevenlabs: boolean; openai: boolean; gemini: boolean };
  ai: boolean;
  aiProvider: 'claude' | 'gemini' | null;
  music: boolean;
  ffmpeg: boolean;
}

export interface EmphasisRequest { words: string[]; language: 'si' | 'en' | 'mixed' }
export interface EmphasisResponse { indices: number[] }

export interface HookRequest { transcript: string; language: 'si' | 'en' }
export interface HookResponse { hooks: string[] }

export interface DescriptionRequest { transcript: string; language: 'si' | 'en' }
export interface DescriptionResponse { title: string; body: string; hashtags: string[] }

export interface ProofreadRequest { words: string[]; language: 'si' | 'en' | 'mixed'; mode?: 'proofread' | 'english' }
/** Same length as the request; each entry is the corrected word (may be unchanged). */
export interface ProofreadResponse {
  words: string[];
  /** Server-only addition: set when some batch came back with the wrong length and was left uncorrected. */
  warning?: string;
}

export interface BrollPlanRequest {
  segments: { index: number; start: number; end: number; text: string }[];
  images: { id: string; dataUrl: string }[]; // small jpeg thumbnails
}
export interface BrollPlanResponse { placements: { imageId: string; start: number; end: number; reason: string }[] }

export interface LibraryTrack {
  id: string;
  name: string;
  artist: string;
  duration: number;
  /** Same-origin proxy URL: /api/music/file?id=... */
  previewUrl: string;
  image: string | null;
  /** Short licence name, e.g. "CC BY 4.0". */
  license: string;
  licenseUrl: string;
  attribution: string;
  tags: string[];
}
export interface MusicSearchResponse { configured: boolean; tracks: LibraryTrack[] }

export interface MusicMoodRequest { transcript: string; language: 'si' | 'en' }
export interface MusicMoodResponse { moods: string[]; genres: string[]; bpmMin: number; bpmMax: number; searchQuery: string; reason: string }

export interface ErrorResponse { error: string }

/** One paid API request, as logged by the server (server/data/usage.json). */
export interface UsageRecord {
  id: string;
  time: number; // ms epoch
  feature: string; // transcribe, proofread, english, emphasis, hook, description, broll, music-mood
  provider: 'gemini' | 'claude' | 'elevenlabs' | 'openai';
  model: string;
  inputTokens?: number;
  audioTokens?: number;
  outputTokens?: number;
  thinkingTokens?: number;
  audioSeconds?: number;
  /** Estimated from list prices; null when the model has no known price. */
  costUsd: number | null;
  ok: boolean;
}
export interface UsageResponse {
  since: number | null;
  total: { requests: number; failed: number; costUsd: number; inputTokens: number; outputTokens: number; audioSeconds: number };
  byFeature: Record<string, { requests: number; costUsd: number }>;
  byDay: Record<string, { requests: number; costUsd: number }>;
  recent: UsageRecord[];
  prices: { tokens: Record<string, { in: number; audioIn?: number; out: number }>; perMinute: Record<string, number> };
}

export interface SfxResult {
  id: string;
  name: string;
  creator: string;
  duration: number;
  previewUrl: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  landingUrl: string;
  tags: string[];
}
export interface SfxSearchResponse { results: SfxResult[]; page: number; pageCount: number }
