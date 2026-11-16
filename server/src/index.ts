/**
 * Keyframe.lk API server (Hono on Node).
 *
 * Routes (all under /api):
 *   GET/PUT /api/keys          -> API key status (masked) / set or clear keys, saved to server/.env
 *   GET  /api/health           -> HealthResponse
 *   GET  /api/claude/status    -> { cli: { found, version, loggedIn, account }, api, gemini }  (Claude Code login check)
 *   POST /api/transcribe       -> TranscribeResponse
 *   POST /api/ai/emphasis      -> EmphasisResponse
 *   POST /api/ai/hook          -> HookResponse
 *   POST /api/ai/description   -> DescriptionResponse
 *   POST /api/ai/proofread     -> ProofreadResponse
 *   POST /api/ai/broll         -> BrollPlanResponse
 *   POST /api/ai/motion        -> { scene, via, costUsd, ms }  (motion graphics / transitions; see motion.ts)
 *   POST /api/ai/music-mood    -> MusicMoodResponse
 *   GET  /api/usage            -> UsageResponse (request count + estimated cost); DELETE resets it
 *   GET  /api/music/search     -> MusicSearchResponse (Jamendo; configured:false without JAMENDO_CLIENT_ID)
 *   GET  /api/music/file?id=   -> audio/mpeg stream of a Jamendo track (same-origin, avoids CORS)
 *   GET  /api/sfx/search       -> SfxSearchResponse (Openverse / Freesound, commercial-use licences only; no key needed)
 *   GET  /api/sfx/file?id=     -> audio stream of one sound effect
 *   POST /api/export/prores... -> transparent ProRes 4444 caption export via ffmpeg (see prores.ts)
 * AI routes use Claude when Anthropic credentials exist, otherwise Gemini (GEMINI_API_KEY).
 * Errors are always JSON: { error: string } with a meaningful status code.
 *
 * Uploading media to /api/transcribe (files can be ~1 GB, so the body is never buffered in memory):
 *
 *   1. multipart/form-data (what a browser <form>/FormData sends):
 *        fields: file (the video/audio), language ('si' | 'en' | 'auto'), provider ('auto' | 'elevenlabs' | 'gemini' | 'openai')
 *      The body is parsed by a small streaming multipart parser that writes the file part straight to a temp
 *      file in os.tmpdir(). Put `language`/`provider` before `file` or pass them as query params — both work,
 *      query params win if given.
 *
 *   2. Raw body (simplest and most efficient): POST the file bytes as the body with the media Content-Type,
 *        e.g. fetch('/api/transcribe?language=si&provider=auto', { method: 'POST', body: file,
 *                                                               headers: { 'Content-Type': file.type } })
 *
 * /api/transcribe is limited to MAX_UPLOAD_MB (default 2048 MB); JSON routes are limited to 20 MB.
 */
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import {
  brollRequest,
  descriptionRequest,
  emphasisRequest,
  generateDescription,
  generateHooks,
  aiProvider,
  hookRequest,
  musicMoodRequest,
  pickEmphasis,
  planBroll,
  proofread,
  proofreadRequest,
  requireAi,
  suggestMusicMood,
} from './ai.js';
import { hasMusicLibrary, musicFile, musicSearch } from './music.js';
import { claudeStatus } from './claudeCli.js';
import { getKeys, putKeys } from './keys.js';
import { generateMotion, motionRequest } from './motion.js';
import { sfxFile, sfxSearch } from './sfx.js';
import { cancelProRes, finishProRes, proResFrames, startProRes } from './prores.js';
import { HttpError } from './errors.js';
import {
  alignerStatus,
  checkFfmpeg,
  makeTempDir,
  receiveUpload,
  removeTempDir,
  transcribeFile,
  type Language,
  type Provider,
} from './transcribe.js';
import type { HealthResponse } from './types.js';
import { resetUsage, runWithFeature, setFeature, usageReport } from './usage.js';

const app = new Hono();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// The API has no auth, so it must only answer to the local machine. CORS alone does not help: it only hides the
// response, the handler still runs (cross-site "simple" POSTs, DNS rebinding). Extra hostnames (e.g. a LAN address
// for dev) can be allowed with KEYFRAME_ALLOWED_HOSTS=host1,host2.
const extraHosts = (process.env.KEYFRAME_ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
const isLocalHostname = (hostname: string) => {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || extraHosts.includes(h);
};
/** Hostname of a Host header value or an Origin URL ('' when unparseable, e.g. Origin "null"). */
const hostnameOf = (hostOrOrigin: string) => {
  try {
    return new URL(hostOrOrigin.includes('://') ? hostOrOrigin : `http://${hostOrOrigin}`).hostname;
  } catch {
    return '';
  }
};
app.use('/api/*', async (c, next) => {
  if (!isLocalHostname(hostnameOf(c.req.header('host') ?? ''))) return c.json({ error: 'Forbidden host.' }, 403);
  const method = c.req.method;
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const origin = c.req.header('origin');
    if (origin !== undefined && !isLocalHostname(hostnameOf(origin))) {
      return c.json({ error: 'Forbidden origin.' }, 403);
    }
  }
  return next();
});

app.use(
  '/api/*',
  cors({
    origin: (origin) => (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Range'],
    exposeHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges'],
    maxAge: 600,
  }),
);

app.use(
  '/api/ai/*',
  bodyLimit({
    maxSize: 20 * 1024 * 1024,
    onError: (c) => c.json({ error: 'Request body is too large (limit 20 MB).' }, 413),
  }),
);

// Uploads are streamed to disk, but still capped so a hosted instance cannot be filled up. MAX_UPLOAD_MB overrides it.
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB) || 2048;
app.use(
  '/api/transcribe',
  bodyLimit({
    maxSize: maxUploadMb * 1024 * 1024,
    onError: (c) => c.json({ error: `File is too large (limit ${maxUploadMb} MB). Trim the video or raise MAX_UPLOAD_MB in server/.env.` }, 413),
  }),
);

// Tag every API call with the feature that made it, for the usage log.
app.use('/api/*', (c, next) => {
  const p = c.req.path;
  const feature = p.startsWith('/api/ai/') ? p.slice('/api/ai/'.length) : p.slice('/api/'.length);
  return runWithFeature(feature, () => next());
});

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status as ContentfulStatusCode);
  console.error(err);
  return c.json({ error: err.message || 'Internal server error' }, 500);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  // Browsers send application/json only after a CORS preflight; text/plain would be a preflight-free simple request.
  if (!/^application\/json\b/i.test(c.req.header('content-type') ?? '')) {
    throw new HttpError(415, 'Content-Type must be application/json.');
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(body)'}: ${i.message}`)
      .join('; ');
    throw new HttpError(400, `Invalid request: ${detail}`);
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** Is the Claude Code CLI installed and signed in (the "connect your Claude account" check)? */
app.get('/api/claude/status', async (c) => {
  const status = await claudeStatus(c.req.query('refresh') === '1');
  return c.json({ cli: status, api: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN), gemini: !!process.env.GEMINI_API_KEY });
});

app.get('/api/keys', getKeys);
app.put('/api/keys', putKeys);

app.get('/api/health', async (c) => {
  const body: HealthResponse = {
    ok: true,
    transcription: {
      elevenlabs: !!process.env.ELEVENLABS_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
    },
    ai: aiProvider() !== null,
    aiProvider: aiProvider(),
    music: hasMusicLibrary(),
    ffmpeg: await checkFfmpeg(),
    align: await alignerStatus(),
  };
  return c.json(body);
});

const languageParam = z.enum(['si', 'en', 'auto']);
const providerParam = z.enum(['auto', 'elevenlabs', 'openai', 'gemini']);

app.post('/api/transcribe', async (c) => {
  const dir = await makeTempDir();
  try {
    const upload = await receiveUpload(c.req.raw, dir);
    const rawLang = c.req.query('language') ?? upload.fields.language ?? 'auto';
    const rawProvider = c.req.query('provider') ?? upload.fields.provider ?? 'auto';
    const language = languageParam.safeParse(rawLang);
    if (!language.success) throw new HttpError(400, `Invalid language "${rawLang}" (expected si, en or auto).`);
    const provider = providerParam.safeParse(rawProvider);
    if (!provider.success) throw new HttpError(400, `Invalid provider "${rawProvider}" (expected auto, elevenlabs, gemini or openai).`);

    const result = await transcribeFile(upload.filePath, dir, language.data as Language, provider.data as Provider);
    return c.json(result);
  } finally {
    await removeTempDir(dir).catch((e) => console.warn('temp cleanup failed:', e));
  }
});

app.post('/api/ai/emphasis', async (c) => {
  requireAi();
  return c.json(await pickEmphasis(await readJson(c, emphasisRequest)));
});

app.post('/api/ai/hook', async (c) => {
  requireAi();
  return c.json(await generateHooks(await readJson(c, hookRequest)));
});

app.post('/api/ai/description', async (c) => {
  requireAi();
  return c.json(await generateDescription(await readJson(c, descriptionRequest)));
});

app.post('/api/ai/proofread', async (c) => {
  requireAi();
  const body = await readJson(c, proofreadRequest);
  if (body.mode === 'english') setFeature('english');
  return c.json(await proofread(body));
});

app.get('/api/usage', (c) => c.json(usageReport()));
app.delete('/api/usage', (c) => { resetUsage(); return c.json({ ok: true }); });

app.post('/api/ai/broll', async (c) => {
  requireAi();
  return c.json(await planBroll(await readJson(c, brollRequest)));
});

/** Motion graphics / transitions: Claude (signed-in CLI, API key or Gemini) writes a scene the editor draws. */
app.post('/api/ai/motion', async (c) => {
  const body = await readJson(c, motionRequest);
  return c.json(await generateMotion(body, c.req.raw.signal));
});

app.post('/api/ai/music-mood', async (c) => {
  requireAi();
  return c.json(await suggestMusicMood(await readJson(c, musicMoodRequest)));
});

app.get('/api/music/search', musicSearch);
app.get('/api/music/file', musicFile);
app.get('/api/sfx/search', sfxSearch);
app.get('/api/sfx/file', sfxFile);

app.post('/api/export/prores', startProRes);
app.post('/api/export/prores/:id/frames', proResFrames);
app.post('/api/export/prores/:id/finish', finishProRes);
app.delete('/api/export/prores/:id', cancelProRes);

app.all('/api/*', (c) => c.json({ error: `Not found: ${c.req.method} ${c.req.path}` }, 404));

// ---------------------------------------------------------------------------
// Production: serve the built web app (../web/dist) with SPA fallback
// ---------------------------------------------------------------------------

const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (existsSync(webDist)) {
  app.use('*', serveStatic({ root: webDist }));
  app.get('*', async (c) => {
    const html = await readFile(path.join(webDist, 'index.html'), 'utf8');
    return c.html(html);
  });
  console.log(`Serving web app from ${webDist}`);
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const port = Number(process.env.PORT) || 8787;
const server = serve({ fetch: app.fetch, port, hostname: process.env.HOST || '127.0.0.1' }, (info) => {
  console.log(`Keyframe.lk server listening on http://localhost:${info.port}`);
});
// Long uploads + transcription can exceed Node's default 5 minute request timeout.
if ('requestTimeout' in server) {
  server.requestTimeout = 0;
  server.headersTimeout = 120_000;
}

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
