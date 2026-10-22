/**
 * Music library: a thin proxy over the Jamendo v3 API (Creative Commons music).
 *
 *   GET /api/music/search?q=&mood=&genre=&bpmMin=&bpmMax=&limit=&vocals=1 -> MusicSearchResponse
 *   GET /api/music/file?id=<jamendo track id>                               -> audio/mpeg stream
 *
 * Needs JAMENDO_CLIENT_ID (free at https://devportal.jamendo.com). Without it, search answers
 * `{ configured: false, tracks: [] }` so the UI can show a setup hint.
 */
import type { Context } from 'hono';
import { HttpError } from './errors.js';
import type { LibraryTrack, MusicSearchResponse } from './types.js';

const API = 'https://api.jamendo.com/v3.0';
const SEARCH_TTL_MS = 10 * 60 * 1000;
const AUDIO_URL_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 500;
const FETCH_TIMEOUT_MS = 20_000;

export const hasMusicLibrary = () => !!process.env.JAMENDO_CLIENT_ID;

// ---------------------------------------------------------------------------
// Jamendo response shapes (only the fields we use)
// ---------------------------------------------------------------------------

interface JamendoTrack {
  id: string | number;
  name?: string;
  artist_name?: string;
  duration?: number | string;
  audio?: string;
  audiodownload?: string;
  audiodownload_allowed?: boolean;
  image?: string;
  album_image?: string;
  license_ccurl?: string;
  shareurl?: string;
  musicinfo?: {
    vocalinstrumental?: string;
    speed?: string;
    tags?: { genres?: string[]; instruments?: string[]; vartags?: string[] };
  };
}
interface JamendoResponse {
  headers?: { status?: string; code?: number; error_message?: string; warnings?: string; results_count?: number };
  results?: JamendoTrack[];
}

// ---------------------------------------------------------------------------
// Small TTL caches
// ---------------------------------------------------------------------------

class TtlCache<V> {
  private map = new Map<string, { value: V; expires: number }>();
  constructor(private ttl: number, private max = CACHE_MAX) {}
  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }
  set(key: string, value: V) {
    this.map.delete(key);
    this.map.set(key, { value, expires: Date.now() + this.ttl });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
  }
}

const searchCache = new TtlCache<LibraryTrack[]>(SEARCH_TTL_MS, 200);
/** Jamendo track id -> audio URL, filled from search results so /file rarely needs an extra lookup. */
const audioUrlCache = new TtlCache<string>(AUDIO_URL_TTL_MS, 5000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function jamendo(pathname: string, params: Record<string, string>): Promise<JamendoTrack[]> {
  const url = new URL(`${API}${pathname}`);
  url.searchParams.set('client_id', process.env.JAMENDO_CLIENT_ID!);
  url.searchParams.set('format', 'json');
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (err) {
    const name = (err as Error)?.name;
    if (name === 'TimeoutError' || name === 'AbortError') throw new HttpError(504, 'Timed out waiting for Jamendo.');
    throw new HttpError(502, `Could not reach Jamendo: ${(err as Error)?.message ?? String(err)}`);
  }
  if (res.status === 429) throw new HttpError(429, 'Jamendo rate limit reached, try again shortly.');
  let data: JamendoResponse;
  try {
    data = (await res.json()) as JamendoResponse;
  } catch {
    throw new HttpError(502, `Jamendo returned an unreadable response (HTTP ${res.status}).`);
  }
  const h = data.headers;
  if (!res.ok || (h?.status && h.status !== 'success')) {
    const msg = h?.error_message || `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403 || /client.?id|credential|unauthori/i.test(msg)) {
      throw new HttpError(401, `Jamendo rejected JAMENDO_CLIENT_ID (${msg}).`);
    }
    throw new HttpError(502, `Jamendo API error: ${msg}`);
  }
  return Array.isArray(data.results) ? data.results : [];
}

/** "http://creativecommons.org/licenses/by-nc-sa/3.0/" -> "CC BY-NC-SA 3.0". */
export function licenseName(ccurl: string | undefined): string {
  if (!ccurl) return 'Unknown licence';
  const m = /creativecommons\.org\/licenses\/([a-z-]+)\/(\d+(?:\.\d+)?)/i.exec(ccurl);
  if (m) return `CC ${m[1].toUpperCase()} ${m[2]}`;
  const zero = /creativecommons\.org\/publicdomain\/zero\/(\d+(?:\.\d+)?)/i.exec(ccurl);
  if (zero) return `CC0 ${zero[1]}`;
  if (/publicdomain/i.test(ccurl)) return 'Public domain';
  return 'Creative Commons';
}

function audioUrlOf(t: JamendoTrack): string | null {
  if (t.audiodownload_allowed !== false && t.audiodownload) return t.audiodownload;
  return t.audio || null;
}

function toLibraryTrack(t: JamendoTrack): LibraryTrack | null {
  const id = String(t.id ?? '');
  if (!/^\d+$/.test(id)) return null;
  const audio = audioUrlOf(t);
  if (!audio) return null;
  audioUrlCache.set(id, audio);

  const name = (t.name ?? '').trim() || 'Untitled';
  const artist = (t.artist_name ?? '').trim() || 'Unknown artist';
  const licenseUrl = t.license_ccurl ?? '';
  const license = licenseName(licenseUrl);
  const tags = [
    ...(t.musicinfo?.tags?.genres ?? []),
    ...(t.musicinfo?.tags?.vartags ?? []),
  ].map((s) => String(s).trim().toLowerCase()).filter(Boolean);
  return {
    id,
    name,
    artist,
    duration: Number(t.duration) || 0,
    previewUrl: `/api/music/file?id=${id}`,
    image: t.image || t.album_image || null,
    license,
    licenseUrl,
    attribution: `"${name}" by ${artist} (Jamendo) — ${license}${licenseUrl ? ` ${licenseUrl}` : ''}`,
    tags: [...new Set(tags)],
  };
}

/** Jamendo's speed buckets, with the BPM range we treat each one as covering. */
const SPEEDS: [string, number, number][] = [
  ['verylow', 0, 75],
  ['low', 75, 95],
  ['medium', 95, 120],
  ['high', 120, 150],
  ['veryhigh', 150, 999],
];
function speedsFor(bpmMin?: number, bpmMax?: number): string[] {
  if (bpmMin === undefined && bpmMax === undefined) return [];
  const lo = bpmMin ?? 0;
  const hi = bpmMax ?? 999;
  const hits = SPEEDS.filter(([, a, b]) => lo < b && hi >= a).map(([s]) => s);
  return hits.length === SPEEDS.length ? [] : hits;
}

/** Split "calm, upbeat corporate" into lowercase tag tokens. */
const tokens = (s: string | undefined) =>
  (s ?? '').toLowerCase().split(/[\s,+]+/).map((t) => t.replace(/[^\p{L}\p{N}_-]/gu, '')).filter(Boolean);

const optionalNumber = (raw: string | undefined): number | undefined => {
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new HttpError(400, `Invalid number "${raw}".`);
  return n;
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function musicSearch(c: Context) {
  if (!hasMusicLibrary()) return c.json<MusicSearchResponse>({ configured: false, tracks: [] });

  const q = (c.req.query('q') ?? '').trim().slice(0, 200);
  const tags = [...new Set([...tokens(c.req.query('mood')), ...tokens(c.req.query('genre'))])].slice(0, 8);
  let bpmMin = optionalNumber(c.req.query('bpmMin'));
  let bpmMax = optionalNumber(c.req.query('bpmMax'));
  if (bpmMin !== undefined && bpmMax !== undefined && bpmMin > bpmMax) [bpmMin, bpmMax] = [bpmMax, bpmMin];
  const limitRaw = optionalNumber(c.req.query('limit'));
  const limit = Math.min(50, Math.max(1, Math.round(limitRaw ?? 24)));
  const vocals = c.req.query('vocals') === '1';
  const speeds = speedsFor(bpmMin, bpmMax);

  const cacheKey = JSON.stringify({ q, tags, speeds, limit, vocals });
  const cached = searchCache.get(cacheKey);
  if (cached) return c.json<MusicSearchResponse>({ configured: true, tracks: cached });

  const base: Record<string, string> = {
    limit: String(limit),
    include: 'musicinfo licenses',
    audioformat: 'mp32',
    audiodlformat: 'mp32',
    imagesize: '200',
  };
  if (!vocals) base.vocalinstrumental = 'instrumental';

  // Most specific first; relax the filters when a combination finds nothing.
  const attempts: Record<string, string>[] = [];
  const withTerms = (extra: Record<string, string>) => {
    const p = { ...base, ...extra };
    p.order = q || extra.fuzzytags ? 'relevance' : 'popularity_month';
    if (!q && extra.fuzzytags) p.boost = 'popularity_month';
    return p;
  };
  const fuzzytags = tags.join(' ');
  const speed = speeds.join(' ');
  attempts.push(withTerms({ search: q, fuzzytags, speed }));
  if (speed) attempts.push(withTerms({ search: q, fuzzytags }));
  if (q && fuzzytags) attempts.push(withTerms({ fuzzytags }), withTerms({ search: q }));
  // A multi-word AI query ("upbeat motivational corporate") often matches nothing as free text; try it as tags.
  if (q) {
    const qTags = [...new Set([...tags, ...tokens(q)])].slice(0, 8).join(' ');
    if (qTags !== fuzzytags) attempts.push(withTerms({ fuzzytags: qTags }));
  }

  let tracks: LibraryTrack[] = [];
  for (const params of attempts) {
    const results = await jamendo('/tracks/', params);
    tracks = results.map(toLibraryTrack).filter((t): t is LibraryTrack => t !== null);
    if (tracks.length) break;
  }
  searchCache.set(cacheKey, tracks);
  return c.json<MusicSearchResponse>({ configured: true, tracks });
}

export async function musicFile(c: Context) {
  if (!hasMusicLibrary()) throw new HttpError(503, 'The music library needs JAMENDO_CLIENT_ID in server/.env');
  const id = c.req.query('id') ?? '';
  if (!/^\d{1,12}$/.test(id)) throw new HttpError(400, 'Invalid track id (expected digits).');

  let audioUrl = audioUrlCache.get(id);
  if (!audioUrl) {
    const [track] = await jamendo('/tracks/', { id, audioformat: 'mp32', audiodlformat: 'mp32', limit: '1' });
    audioUrl = track ? audioUrlOf(track) ?? undefined : undefined;
    if (!audioUrl) throw new HttpError(404, `Track ${id} was not found on Jamendo.`);
    audioUrlCache.set(id, audioUrl);
  }
  const url = new URL(audioUrl);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new HttpError(502, 'Jamendo returned an invalid audio URL.');

  const range = c.req.header('range');
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers: range && /^bytes=\d*-\d*$/.test(range) ? { Range: range } : {},
      redirect: 'follow',
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    throw new HttpError(502, `Could not download the track from Jamendo: ${(err as Error)?.message ?? String(err)}`);
  }
  if (upstream.status === 416) {
    return new Response(null, { status: 416, headers: { 'Content-Range': upstream.headers.get('content-range') ?? '' } });
  }
  if (!upstream.ok || !upstream.body) {
    await upstream.body?.cancel().catch(() => {});
    throw new HttpError(upstream.status === 404 ? 404 : 502, `Jamendo audio download failed (HTTP ${upstream.status}).`);
  }

  const headers = new Headers({
    'Content-Type': 'audio/mpeg',
    'Cache-Control': 'private, max-age=3600',
    'Accept-Ranges': upstream.headers.get('accept-ranges') === 'bytes' ? 'bytes' : 'none',
    'Content-Disposition': `inline; filename="jamendo-${id}.mp3"`,
  });
  const len = upstream.headers.get('content-length');
  // fetch() transparently decompresses, so an encoded length would be wrong.
  if (len && !upstream.headers.get('content-encoding')) headers.set('Content-Length', len);
  const contentRange = upstream.headers.get('content-range');
  if (upstream.status === 206 && contentRange) headers.set('Content-Range', contentRange);
  return new Response(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}
