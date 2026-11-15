/**
 * Records every paid API request (transcription + AI features) with its token counts and an
 * estimated cost, so the app can show how much was spent. Kept in server/data/usage.json.
 *
 * Prices are list prices in USD and are estimates: free tiers, discounts and price changes are not
 * reflected. Check your provider's billing page for the real amount.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { UsageRecord, UsageResponse } from './types.js';

/** Per-million-token prices (USD). `audioIn` applies to audio input tokens when the model prices them separately. */
interface TokenPrice { in: number; audioIn?: number; out: number }

const TOKEN_PRICES: Record<string, TokenPrice> = {
  'gemini-3.5-flash': { in: 0.3, audioIn: 1.0, out: 2.5 },
  'gemini-2.5-flash': { in: 0.3, audioIn: 1.0, out: 2.5 },
  'gemini-2.5-flash-lite': { in: 0.1, audioIn: 0.3, out: 0.4 },
  'gemini-2.5-pro': { in: 1.25, out: 10 },
  'gemini-2.0-flash': { in: 0.1, audioIn: 0.7, out: 0.4 },
  'claude-opus-5': { in: 5, out: 25 },
};

/** Per-minute prices (USD) for speech-to-text APIs billed by audio length. */
const MINUTE_PRICES: Record<string, number> = {
  scribe_v1: 0.40 / 60,
  scribe_v2: 0.40 / 60,
  'whisper-1': 0.006,
};

export const PRICE_TABLE = { tokens: TOKEN_PRICES, perMinute: MINUTE_PRICES };

function priceFor(model: string): TokenPrice | undefined {
  if (TOKEN_PRICES[model]) return TOKEN_PRICES[model];
  // Versioned names like gemini-2.5-flash-preview-05-20 → longest matching prefix.
  const key = Object.keys(TOKEN_PRICES).filter((k) => model.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  return key ? TOKEN_PRICES[key] : undefined;
}

// ---------------------------------------------------------------------------
// Request context: which app feature triggered the API call
// ---------------------------------------------------------------------------

const context = new AsyncLocalStorage<{ feature: string }>();
export const runWithFeature = <T>(feature: string, fn: () => Promise<T>) => context.run({ feature }, fn);
/** Rename the current feature (e.g. proofread → english once the request body is parsed). */
export function setFeature(feature: string) {
  const s = context.getStore();
  if (s) s.feature = feature;
}
const currentFeature = () => context.getStore()?.feature ?? 'other';

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const FILE = process.env.KEYFRAME_DATA_DIR
  ? path.join(process.env.KEYFRAME_DATA_DIR, 'usage.json')
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/usage.json');
const MAX_RECORDS = 5000;
let records: UsageRecord[] = [];
let raw: string | null = null;
try { raw = readFileSync(FILE, 'utf8'); } catch { /* first run */ }
if (raw !== null) {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('not an array');
    records = parsed as UsageRecord[];
  } catch (e) {
    // Don't let the next save silently overwrite a corrupt history: keep a copy of the bad file.
    console.warn('usage: usage.json is unreadable, starting empty (backup kept as usage.json.bak)', e);
    try { copyFileSync(FILE, `${FILE}.bak`); } catch { /* best effort */ }
  }
}

let saveTimer: NodeJS.Timeout | null = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      mkdirSync(path.dirname(FILE), { recursive: true });
      const tmp = `${FILE}.tmp`;
      writeFileSync(tmp, JSON.stringify(records));
      renameSync(tmp, FILE); // atomic, so a crash mid-write can't leave a truncated usage.json
    } catch (e) {
      console.warn('usage: could not save', e);
    }
  }, 500);
}

function push(r: Omit<UsageRecord, 'id' | 'time' | 'feature'> & { feature?: string }) {
  const rec: UsageRecord = { id: Math.random().toString(36).slice(2, 10), time: Date.now(), feature: r.feature ?? currentFeature(), ...r } as UsageRecord;
  records.push(rec);
  if (records.length > MAX_RECORDS) records = records.slice(-MAX_RECORDS);
  save();
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  promptTokensDetails?: { modality?: string; tokenCount?: number }[];
}

export function recordGemini(model: string, u: GeminiUsageMetadata | undefined, ok = true) {
  const input = u?.promptTokenCount ?? 0;
  const audio = u?.promptTokensDetails?.find((d) => d.modality === 'AUDIO')?.tokenCount ?? 0;
  const output = u?.candidatesTokenCount ?? 0;
  const thinking = u?.thoughtsTokenCount ?? 0;
  const p = priceFor(model);
  const cost = p ? ((input - audio) * p.in + audio * (p.audioIn ?? p.in) + (output + thinking) * p.out) / 1e6 : null;
  push({ provider: 'gemini', model, inputTokens: input, audioTokens: audio || undefined, outputTokens: output, thinkingTokens: thinking || undefined, costUsd: cost, ok });
}

export function recordClaude(model: string, u: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | undefined, ok = true) {
  const input = (u?.input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0);
  const output = u?.output_tokens ?? 0;
  const p = priceFor(model);
  const cost = p ? (input * p.in + output * p.out) / 1e6 : null;
  push({ provider: 'claude', model, inputTokens: input, outputTokens: output, costUsd: cost, ok });
}

export function recordMinutes(provider: 'elevenlabs' | 'openai', model: string, seconds: number, ok = true) {
  const perMin = MINUTE_PRICES[model];
  push({ provider, model, audioSeconds: seconds, costUsd: perMin !== undefined ? (seconds / 60) * perMin : null, ok });
}

/** A request that failed before returning usage (still counts as a request). */
export function recordFailure(provider: UsageRecord['provider'], model: string) {
  push({ provider, model, costUsd: 0, ok: false });
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export function usageReport(limit = 200): UsageResponse {
  const total = { requests: 0, failed: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, audioSeconds: 0 };
  const byFeature: Record<string, { requests: number; costUsd: number }> = {};
  const byDay: Record<string, { requests: number; costUsd: number }> = {};
  for (const r of records) {
    const c = r.costUsd ?? 0;
    total.requests++;
    if (!r.ok) total.failed++;
    total.costUsd += c;
    total.inputTokens += r.inputTokens ?? 0;
    total.outputTokens += (r.outputTokens ?? 0) + (r.thinkingTokens ?? 0);
    total.audioSeconds += r.audioSeconds ?? 0;
    (byFeature[r.feature] ??= { requests: 0, costUsd: 0 }).requests++;
    byFeature[r.feature].costUsd += c;
    const day = new Date(r.time).toISOString().slice(0, 10);
    (byDay[day] ??= { requests: 0, costUsd: 0 }).requests++;
    byDay[day].costUsd += c;
  }
  return {
    since: records[0]?.time ?? null,
    total,
    byFeature,
    byDay,
    recent: records.slice(-limit).reverse(),
    prices: PRICE_TABLE,
  };
}

export function resetUsage() {
  records = [];
  save();
}
