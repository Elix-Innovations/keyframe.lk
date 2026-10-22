/**
 * Sound-effect library: a thin proxy over the Openverse audio API (openverse.org), which indexes Freesound
 * and other open collections. No API key needed; only results whose licence allows commercial use are returned.
 *
 *   GET /api/sfx/search?q=&page=  -> SfxSearchResponse
 *   GET /api/sfx/file?id=<uuid>   -> audio stream (same-origin, avoids CORS)
 */
import type { Context } from 'hono';
import { HttpError } from './errors.js';
import type { SfxResult, SfxSearchResponse } from './types.js';

const API = 'https://api.openverse.org/v1/audio/';
const TTL_MS = 10 * 60 * 1000;
const MAX_SECONDS = 20;
const HOSTS = ['cdn.freesound.org', 'freesound.org', 'upload.wikimedia.org'];

interface OvAudio {
  id: string;
  title?: string;
  creator?: string;
  url?: string;
  duration?: number | null;
  license?: string;
  license_version?: string;
  license_url?: string;
  foreign_landing_url?: string;
  tags?: { name: string }[] | null;
}
interface OvResponse { results?: OvAudio[]; page?: number; page_count?: number; detail?: string }

const urlCache = new Map<string, { url: string; expires: number }>();
const searchCache = new Map<string, { value: SfxSearchResponse; expires: number }>();

function allowed(u: string): URL {
  let url: URL;
  try { url = new URL(u); } catch { throw new HttpError(502, 'Openverse returned an invalid audio URL.'); }
  if (url.protocol !== 'https:' || !HOSTS.includes(url.hostname)) throw new HttpError(502, `Audio host ${url.hostname} is not allowed.`);
  return url;
}

async function openverse(path: string, params: Record<string, string>): Promise<OvResponse> {
  const url = new URL(path, API);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'keyframe-web' }, signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    throw new HttpError(502, `Could not reach Openverse: ${(err as Error)?.message ?? String(err)}`);
  }
  if (res.status === 429) throw new HttpError(429, 'The sound library rate limit was reached. Try again in a minute.');
  if (!res.ok) throw new HttpError(502, `Openverse error (HTTP ${res.status}).`);
  return (await res.json()) as OvResponse;
}

const licenseOf = (a: OvAudio) => `${(a.license ?? 'cc').toUpperCase()}${a.license_version ? ` ${a.license_version}` : ''}`;

function toResult(a: OvAudio): SfxResult | null {
  if (!a.id || !a.url) return null;
  try { allowed(a.url); } catch { return null; }
  urlCache.set(a.id, { url: a.url, expires: Date.now() + 60 * 60 * 1000 });
  const name = (a.title ?? '').trim() || 'Untitled';
  const creator = (a.creator ?? '').trim() || 'Unknown';
  const license = licenseOf(a);
  return {
    id: a.id, name, creator, duration: (a.duration ?? 0) / 1000, previewUrl: `/api/sfx/file?id=${a.id}`,
    license, licenseUrl: a.license_url ?? '', landingUrl: a.foreign_landing_url ?? '',
    attribution: `"${name}" by ${creator} (Freesound via Openverse) — ${license}${a.license_url ? ` ${a.license_url}` : ''}`,
    tags: (a.tags ?? []).map((t) => t.name).slice(0, 8),
  };
}

export async function sfxSearch(c: Context) {
  const q = (c.req.query('q') ?? '').trim().slice(0, 100);
  const page = Math.max(1, Math.min(50, Number(c.req.query('page')) || 1));
  if (!q) return c.json<SfxSearchResponse>({ results: [], page: 1, pageCount: 0 });
  const key = `${q}|${page}`;
  const hit = searchCache.get(key);
  if (hit && hit.expires > Date.now()) return c.json(hit.value);
  const ask = (term: string) => openverse('', { q: term, page: String(page), page_size: '20', source: 'freesound', license_type: 'commercial', length: 'shortest,short' });
  let data = await ask(q);
  let results = (data.results ?? []).map(toResult).filter((r): r is SfxResult => !!r && r.duration <= MAX_SECONDS);
  // A phrase like "vine boom" often matches nothing as a whole; fall back to its words.
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  if (!results.length && words.length > 1) {
    const seen = new Set<string>();
    for (const w of words.slice(0, 3)) {
      const d = await ask(w);
      data = d;
      for (const r of (d.results ?? []).map(toResult)) if (r && r.duration <= MAX_SECONDS && !seen.has(r.id)) { seen.add(r.id); results.push(r); }
    }
  }
  const value: SfxSearchResponse = { results, page, pageCount: data.page_count ?? 1 };
  searchCache.set(key, { value, expires: Date.now() + TTL_MS });
  if (searchCache.size > 200) searchCache.delete(searchCache.keys().next().value!);
  return c.json(value);
}

export async function sfxFile(c: Context) {
  const id = c.req.query('id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'Invalid sound id.');
  let url = urlCache.get(id);
  if (!url || url.expires < Date.now()) {
    const a = (await openverse(`${id}/`, {})) as unknown as OvAudio;
    if (!a?.url) throw new HttpError(404, 'That sound was not found.');
    url = { url: a.url, expires: Date.now() + 60 * 60 * 1000 };
    urlCache.set(id, url);
  }
  const target = allowed(url.url);
  let upstream: Response;
  try {
    upstream = await fetch(target, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
  } catch (err) {
    throw new HttpError(502, `Could not download the sound: ${(err as Error)?.message ?? String(err)}`);
  }
  if (!upstream.ok || !upstream.body) throw new HttpError(upstream.status === 404 ? 404 : 502, `Sound download failed (HTTP ${upstream.status}).`);
  const headers = new Headers({ 'Content-Type': upstream.headers.get('content-type') ?? 'audio/mpeg', 'Cache-Control': 'private, max-age=3600' });
  return new Response(upstream.body, { status: 200, headers });
}
