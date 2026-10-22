import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { HttpError } from './errors.js';
import { recordClaude, recordFailure, recordGemini, type GeminiUsageMetadata } from './usage.js';
import type {
  BrollPlanResponse,
  DescriptionResponse,
  EmphasisResponse,
  HookResponse,
  MusicMoodResponse,
  ProofreadResponse,
} from './types.js';

const MODEL = 'claude-opus-5';
/** Gemini model for the text/JSON AI features (transcription has its own GEMINI_MODEL). */
const geminiAiModel = () => process.env.GEMINI_AI_MODEL || 'gemini-2.5-flash';

export const hasAnthropicCredentials = () =>
  !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
export const hasGeminiCredentials = () => !!process.env.GEMINI_API_KEY;

export type AiProvider = 'claude' | 'gemini';

/** Claude when Anthropic credentials exist, otherwise Gemini, otherwise null. */
export function aiProvider(): AiProvider | null {
  if (hasAnthropicCredentials()) return 'claude';
  if (hasGeminiCredentials()) return 'gemini';
  return null;
}

export const AI_NOT_CONFIGURED = 'AI features need ANTHROPIC_API_KEY or GEMINI_API_KEY in server/.env';

export function requireAi(): AiProvider {
  const provider = aiProvider();
  if (!provider) throw new HttpError(503, AI_NOT_CONFIGURED);
  return provider;
}

const providerLabel = () => (aiProvider() === 'gemini' ? 'Gemini' : 'Claude');

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!hasAnthropicCredentials()) throw new HttpError(503, AI_NOT_CONFIGURED);
  client ??= new Anthropic(); // resolves ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN from env
  return client;
}

type JsonSchema = Record<string, unknown>;

/** Provider-neutral user content. */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string /* base64 */ };

export interface GenerateJSONOptions {
  system: string;
  content: string | ContentPart[];
  /** Standard JSON Schema (the Claude structured-output dialect); converted for Gemini automatically. */
  schema: JsonSchema;
  /** false turns model thinking off: cheaper and faster for simple word-by-word jobs. Default true. */
  thinking?: boolean;
}

/** One structured-output call to whichever AI provider is configured. Returns the parsed JSON object. */
export async function generateJSON<T>(opts: GenerateJSONOptions): Promise<T> {
  const provider = requireAi();
  return provider === 'claude' ? callClaude<T>(opts) : callGemini<T>(opts);
}

// ---------------------------------------------------------------------------
// Claude
// ---------------------------------------------------------------------------

function toClaudeContent(content: string | ContentPart[]): string | Anthropic.Beta.BetaContentBlockParam[] {
  if (typeof content === 'string') return content;
  return content.map((p): Anthropic.Beta.BetaContentBlockParam =>
    p.type === 'text'
      ? { type: 'text', text: p.text }
      : { type: 'image', source: { type: 'base64', media_type: p.mimeType, data: p.data } });
}

/**
 * One structured-output call to Claude. Returns the parsed JSON object.
 * Handles refusal / max_tokens stop reasons and maps SDK errors to HttpError.
 */
async function callClaude<T>({ system, content, schema, thinking = true }: GenerateJSONOptions): Promise<T> {
  const anthropic = getClient();
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      ...(thinking ? { thinking: { type: 'adaptive' as const } } : {}),
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content: toClaudeContent(content) }],
    });
  } catch (err) {
    recordFailure('claude', MODEL);
    throw mapAnthropicError(err);
  }
  recordClaude(response.model ?? MODEL, response.usage);

  if (response.stop_reason === 'refusal') {
    const explanation = response.stop_details?.explanation;
    throw new HttpError(422, `Claude declined this request${explanation ? `: ${explanation}` : '.'}`);
  }
  if (response.stop_reason === 'max_tokens') {
    throw new HttpError(502, 'Claude ran out of output tokens before finishing. Try a shorter input.');
  }

  let text = '';
  for (const block of response.content) {
    if (block.type === 'text') text += block.text;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(502, 'Claude returned a response that was not valid JSON.');
  }
}

function mapAnthropicError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof Anthropic.RateLimitError) {
    return new HttpError(429, `Anthropic rate limit reached, try again shortly. (${err.message})`);
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new HttpError(401, `Anthropic rejected the credentials — set ANTHROPIC_API_KEY. (${err.message})`);
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new HttpError(504, 'Timed out waiting for Claude.');
  }
  if (err instanceof Anthropic.APIError) {
    return new HttpError(502, `Anthropic API error${err.status ? ` ${err.status}` : ''}: ${err.message}`);
  }
  return new HttpError(500, `Unexpected AI error: ${(err as Error)?.message ?? String(err)}`);
}

// ---------------------------------------------------------------------------
// Gemini (REST)
// ---------------------------------------------------------------------------

const GEMINI_TYPES: Record<string, string> = {
  object: 'OBJECT', array: 'ARRAY', string: 'STRING', number: 'NUMBER', integer: 'INTEGER', boolean: 'BOOLEAN',
};
/** Keywords Gemini's OpenAPI-subset schema accepts (besides type/properties/items, handled explicitly). */
const GEMINI_PASSTHROUGH = [
  'description', 'enum', 'format', 'nullable', 'minItems', 'maxItems', 'minimum', 'maximum', 'title',
] as const;

/**
 * Convert a standard JSON Schema into Gemini's responseSchema dialect: uppercase type names, no
 * additionalProperties (Gemini rejects it), `["x","null"]` unions become `nullable`, and objects get a
 * `propertyOrdering` so the output keeps the declared key order. Unknown keywords are dropped.
 */
export function toGeminiSchema(schema: JsonSchema): JsonSchema {
  const out: JsonSchema = {};
  let type = schema.type;
  if (Array.isArray(type)) {
    const nonNull = type.filter((t) => t !== 'null');
    if (nonNull.length !== type.length) out.nullable = true;
    type = nonNull[0];
  }
  if (typeof type === 'string') {
    const mapped = GEMINI_TYPES[type.toLowerCase()];
    if (!mapped) throw new Error(`Unsupported JSON schema type for Gemini: ${type}`);
    out.type = mapped;
  } else if (Array.isArray(schema.enum)) {
    out.type = 'STRING';
  }
  for (const key of GEMINI_PASSTHROUGH) {
    if (schema[key] !== undefined) out[key] = schema[key];
  }
  if (Array.isArray(out.enum)) out.enum = (out.enum as unknown[]).map(String);
  if (schema.properties && typeof schema.properties === 'object') {
    const props = schema.properties as Record<string, JsonSchema>;
    out.properties = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, toGeminiSchema(v)]));
    out.propertyOrdering = Object.keys(props);
    if (Array.isArray(schema.required)) out.required = schema.required;
  }
  if (schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)) {
    out.items = toGeminiSchema(schema.items as JsonSchema);
  }
  return out;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: GeminiUsageMetadata;
}

const GEMINI_TIMEOUT_MS = 180_000;

async function callGemini<T>(opts: GenerateJSONOptions, attempt = 0): Promise<T> {
  const { system, content, schema, thinking = true } = opts;
  const parts = typeof content === 'string'
    ? [{ text: content }]
    : content.map((p) => (p.type === 'text' ? { text: p.text } : { inlineData: { mimeType: p.mimeType, data: p.data } }));

  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiAiModel()}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: toGeminiSchema(schema),
          ...(thinking ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
        },
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
  } catch (err) {
    const name = (err as Error)?.name;
    if (name === 'TimeoutError' || name === 'AbortError') throw new HttpError(504, 'Timed out waiting for Gemini.');
    if (attempt < 1) return callGemini<T>(opts, attempt + 1);
    throw new HttpError(502, `Could not reach Gemini: ${(err as Error)?.message ?? String(err)}`);
  }

  if ((res.status === 429 || res.status >= 500) && attempt < 1) {
    recordFailure('gemini', geminiAiModel());
    await res.body?.cancel().catch(() => {});
    await new Promise((r) => setTimeout(r, res.status === 429 ? 2000 : 1000));
    return callGemini<T>(opts, attempt + 1);
  }
  if (!res.ok) {
    recordFailure('gemini', geminiAiModel());
    throw await geminiError(res);
  }

  const data = (await res.json()) as GeminiResponse;
  recordGemini(geminiAiModel(), data.usageMetadata);
  if (data.promptFeedback?.blockReason) {
    throw new HttpError(422, `Gemini declined this request (${data.promptFeedback.blockReason}).`);
  }
  const candidate = data.candidates?.[0];
  const finish = candidate?.finishReason;
  if (finish && ['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'].includes(finish)) {
    throw new HttpError(422, `Gemini declined this request (${finish}).`);
  }
  if (finish === 'MAX_TOKENS') {
    throw new HttpError(502, 'Gemini ran out of output tokens before finishing. Try a shorter input.');
  }
  const text = (candidate?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('');
  try {
    return JSON.parse(text) as T;
  } catch {
    if (attempt < 1) return callGemini<T>(opts, attempt + 1);
    throw new HttpError(502, `Gemini returned a response that was not valid JSON (finish reason: ${finish ?? 'unknown'}).`);
  }
}

async function geminiError(res: Response): Promise<HttpError> {
  let message = '';
  try {
    const body = (await res.json()) as { error?: { message?: string; status?: string } };
    message = body.error?.message ?? '';
  } catch { /* not JSON */ }
  const detail = message ? ` (${message})` : '';
  if (res.status === 429) return new HttpError(429, `Gemini rate limit reached, try again shortly.${detail}`);
  if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key/i.test(message))) {
    return new HttpError(401, `Gemini rejected the credentials — check GEMINI_API_KEY.${detail}`);
  }
  if (res.status === 504) return new HttpError(504, 'Timed out waiting for Gemini.');
  return new HttpError(502, `Gemini API error ${res.status}${detail}`);
}

const languageName = (lang: 'si' | 'en' | 'mixed') =>
  lang === 'si' ? 'Sinhala' : lang === 'en' ? 'English' : 'mixed Sinhala and English';

const SINHALA_STYLE =
  'Write in Sinhala Unicode script, in the natural, colloquial spoken Sinhala that Sri Lankan creators use on ' +
  'TikTok, Reels and YouTube Shorts — not formal or literary written Sinhala. Common English loanwords that people ' +
  'actually say in speech are fine.';

// ---------------------------------------------------------------------------
// Request schemas (zod)
// ---------------------------------------------------------------------------

export const emphasisRequest = z.object({
  words: z.array(z.string()).min(1).max(20000),
  language: z.enum(['si', 'en', 'mixed']),
});
export const hookRequest = z.object({
  transcript: z.string().trim().min(1).max(200_000),
  language: z.enum(['si', 'en']),
});
export const descriptionRequest = hookRequest;
export const proofreadRequest = emphasisRequest.extend({
  /** 'english' rewrites English words that were transcribed in Sinhala script into Latin spelling. */
  mode: z.enum(['proofread', 'english']).default('proofread'),
});
export const brollRequest = z.object({
  segments: z.array(z.object({
    index: z.number().int(),
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
    text: z.string(),
  })).min(1),
  images: z.array(z.object({ id: z.string().min(1), dataUrl: z.string().min(1) })).min(1).max(50),
});

// ---------------------------------------------------------------------------
// Emphasis
// ---------------------------------------------------------------------------

export async function pickEmphasis(req: z.infer<typeof emphasisRequest>): Promise<EmphasisResponse> {
  const system =
    'You help edit short-form social video captions (TikTok, Reels, Shorts). Given a transcript as a numbered ' +
    'list of words, choose the words that deserve visual emphasis — roughly 10 to 20 percent of them. Good ' +
    'choices are numbers and amounts, key nouns that carry the topic, names of people, places and brands, ' +
    'emotionally loaded words, and the punchline word of a sentence. Avoid function words, fillers and ' +
    'particles, and avoid emphasising several neighbouring words unless they form one short phrase. ' +
    'Return the zero-based indices of the chosen words.';
  const numbered = req.words.map((w, i) => `${i}: ${w}`).join('\n');
  const out = await generateJSON<{ indices: number[] }>({
    system,
    content: `Language: ${languageName(req.language)}\nWord count: ${req.words.length}\n\n${numbered}`,
    schema: {
      type: 'object',
      properties: { indices: { type: 'array', items: { type: 'integer' } } },
      required: ['indices'],
      additionalProperties: false,
    },
  });
  const n = req.words.length;
  const indices = [...new Set((out.indices ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < n))]
    .sort((a, b) => a - b);
  return { indices };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export async function generateHooks(req: z.infer<typeof hookRequest>): Promise<HookResponse> {
  const system =
    'You write on-screen hook text for the first seconds of short-form social videos. A good hook stops the ' +
    'scroll: it teases the payoff, raises curiosity, or names a strong benefit or surprise from the video, ' +
    'without clickbait that the video does not deliver. Each hook is at most 8 words, a single line, with no ' +
    'hashtags and no surrounding quotes. Give five distinct options with different angles. ' +
    (req.language === 'si' ? SINHALA_STYLE : 'Write in casual, punchy English.');
  const out = await generateJSON<{ hooks: string[] }>({
    system,
    content: `Write 5 hooks in ${req.language === 'si' ? 'Sinhala' : 'English'} for this video transcript:\n\n${req.transcript}`,
    schema: {
      type: 'object',
      properties: { hooks: { type: 'array', items: { type: 'string' } } },
      required: ['hooks'],
      additionalProperties: false,
    },
  });
  const hooks = (out.hooks ?? [])
    .map((h) => h.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim())
    .filter(Boolean)
    .slice(0, 5);
  if (!hooks.length) throw new HttpError(502, `${providerLabel()} did not return any hooks.`);
  return { hooks };
}

// ---------------------------------------------------------------------------
// Description
// ---------------------------------------------------------------------------

export async function generateDescription(req: z.infer<typeof descriptionRequest>): Promise<DescriptionResponse> {
  const system =
    'You write post copy for short-form social videos (YouTube Shorts, TikTok, Reels, Facebook). From the ' +
    'transcript, write a catchy title, a body of two to four short paragraphs that summarises the value of the ' +
    'video and ends with a light call to action, and five to ten relevant hashtags. Hashtags are single tokens ' +
    'without the # sign and without spaces; mix broad and specific tags, and include Sri Lanka related tags when ' +
    'they fit. ' +
    (req.language === 'si'
      ? `${SINHALA_STYLE} Hashtags may be in Sinhala or English, whichever people actually search for.`
      : 'Write in clear, friendly English.');
  const out = await generateJSON<DescriptionResponse>({
    system,
    content: `Language: ${req.language === 'si' ? 'Sinhala' : 'English'}\n\nTranscript:\n${req.transcript}`,
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
        hashtags: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'body', 'hashtags'],
      additionalProperties: false,
    },
  });
  const seen = new Set<string>();
  const hashtags: string[] = [];
  for (const raw of out.hashtags ?? []) {
    const tag = raw.replace(/^#+/, '').replace(/\s+/g, '').trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    hashtags.push(tag);
  }
  return { title: (out.title ?? '').trim(), body: (out.body ?? '').trim(), hashtags: hashtags.slice(0, 10) };
}

// ---------------------------------------------------------------------------
// Proofread
// ---------------------------------------------------------------------------

const PROOFREAD_SINGLE_MAX = 400;
const PROOFREAD_BATCH = 300;
const PROOFREAD_CONTEXT = 20;

async function proofreadBatch(
  words: string[],
  before: string[],
  after: string[],
  language: 'si' | 'en' | 'mixed',
  mode: 'proofread' | 'english' = 'proofread',
): Promise<string[] | null> {
  const system = mode === 'english' ? ENGLISH_SYSTEM : PROOFREAD_SYSTEM(language);
  const parts: string[] = [];
  if (before.length) parts.push(`Context before (do not return these): ${before.join(' ')}`);
  parts.push(`Words to ${mode === 'english' ? 'convert' : 'proofread'} (${words.length} entries):\n${JSON.stringify(words)}`);
  if (after.length) parts.push(`Context after (do not return these): ${after.join(' ')}`);
  parts.push(`Return exactly ${words.length} words.`);
  return runWordBatch(system, parts, words);
}

const PROOFREAD_SYSTEM = (language: 'si' | 'en' | 'mixed') =>
    'You proofread automatic speech recognition output for video captions. The transcript is mostly ' +
    `${languageName(language)}. Fix spelling mistakes typical of speech recognition: wrong or missing Sinhala ` +
    'vowel signs (pili), hal kirima, confused aspirated and unaspirated letters, broken zero-width joiners, ' +
    'misspelled English words, and obviously misheard words when the intended word is clear from context. ' +
    'Keep the speaker\'s colloquial wording, keep English words that were spoken in English in their original ' +
    'script, and do not rephrase, translate, add punctuation, or merge or split words. The output must have ' +
    'exactly one entry per input word, in the same order; return a word unchanged when it is already correct ' +
    'or you are unsure.';

const ENGLISH_SYSTEM =
  'You fix Sinhala video captions from speakers who mix Sinhala and English. Speech recognition often writes ' +
  'English words in Sinhala script, for example සොෆ්ට්වෙයාර් → software, ඉන්ජිනියරින් → engineering, ' +
  'බේසික්ස් → basics, ප්‍රෝග්‍රෑම් → program, මැෂින් ලර්නිං → machine learning, ඉන්ට්‍රඩියුස් → introduce. ' +
  'Rewrite every word that is an English word written in Sinhala script into normal English spelling, using ' +
  'the surrounding words to pick the right English word. Keep acronyms in capitals (AI, IT, UI). Keep brand ' +
  'and product names in their usual spelling. If a Sinhala grammatical suffix is attached to an English word ' +
  '(e.g. කම්පැනියට), keep the English word and the Sinhala suffix together without a space (companyට). ' +
  'Leave real Sinhala words exactly as they are, and leave words already in English unchanged except for ' +
  'obvious misspellings. Keep attached punctuation. Do not translate Sinhala into English, do not rephrase, ' +
  'and do not merge or split words: return exactly one entry per input word, in the same order.';

async function runWordBatch(system: string, parts: string[], words: string[]): Promise<string[] | null> {
  const out = await generateJSON<{ words: string[] }>({
    system,
    thinking: false,
    content: parts.join('\n\n'),
    schema: {
      type: 'object',
      properties: { words: { type: 'array', items: { type: 'string' } } },
      required: ['words'],
      additionalProperties: false,
    },
  });
  if (!Array.isArray(out.words) || out.words.length !== words.length) return null;
  // An empty correction would delete a word from the timeline; keep the original instead.
  return out.words.map((w, i) => (typeof w === 'string' && w.trim() ? w.trim() : words[i]));
}

export async function proofread(req: z.infer<typeof proofreadRequest>): Promise<ProofreadResponse> {
  const { words, language, mode } = req;
  if (words.length <= PROOFREAD_SINGLE_MAX) {
    const fixed = await proofreadBatch(words, [], [], language, mode);
    if (!fixed) {
      return { words, warning: 'The proofreader returned a different number of words, so no corrections were applied.' };
    }
    return { words: fixed };
  }

  const result: string[] = [];
  const failed: string[] = [];
  for (let start = 0; start < words.length; start += PROOFREAD_BATCH) {
    const end = Math.min(start + PROOFREAD_BATCH, words.length);
    const batch = words.slice(start, end);
    const before = words.slice(Math.max(0, start - PROOFREAD_CONTEXT), start);
    const after = words.slice(end, end + PROOFREAD_CONTEXT);
    const fixed = await proofreadBatch(batch, before, after, language, mode);
    if (fixed) result.push(...fixed);
    else {
      result.push(...batch);
      failed.push(`${start + 1}–${end}`);
    }
  }
  const response: ProofreadResponse = { words: result };
  if (failed.length) {
    response.warning = `Words ${failed.join(', ')} were left unchanged because the proofreader returned a different number of words.`;
  }
  return response;
}

// ---------------------------------------------------------------------------
// B-roll planning
// ---------------------------------------------------------------------------

const DATA_URL = /^data:(image\/(?:jpeg|jpg|png|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/;

export async function planBroll(req: z.infer<typeof brollRequest>): Promise<BrollPlanResponse> {
  const segments = [...req.segments].sort((a, b) => a.start - b.start);
  const timelineStart = Math.min(...segments.map((s) => s.start));
  const timelineEnd = Math.max(...segments.map((s) => s.end));

  const content: ContentPart[] = [];
  for (const img of req.images) {
    const m = DATA_URL.exec(img.dataUrl);
    if (!m) throw new HttpError(400, `Image "${img.id}" is not a base64 JPEG/PNG/GIF/WebP data URL.`);
    const mediaType = (m[1] === 'image/jpg' ? 'image/jpeg' : m[1]) as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    content.push({ type: 'text', text: `Image id: ${img.id}` });
    content.push({ type: 'image', mimeType: mediaType, data: m[2].replace(/\s/g, '') });
  }
  const transcript = segments
    .map((s) => `[${s.start.toFixed(2)}–${s.end.toFixed(2)}] ${s.text}`)
    .join('\n');
  content.push({
    type: 'text',
    text: `Timed transcript (seconds):\n${transcript}\n\nPlace each image at the moment the speech best matches it.`,
  });

  const system =
    'You plan B-roll for a short-form video. You receive a set of images, each labelled with its id, and the ' +
    'timed transcript of what is being said. For each image, find the moment where the speech best matches ' +
    'what the image shows and place it there for 1.5 to 4 seconds. Placements must not overlap each other and ' +
    'must stay inside the transcript\'s time range, ideally starting at or just after the matching words. ' +
    'Use each image at most once; skip an image if nothing in the speech relates to it. Give a short reason ' +
    'naming the words that the image illustrates.';
  const out = await generateJSON<BrollPlanResponse>({ system, content, schema: {
    type: 'object',
    properties: {
      placements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            imageId: { type: 'string' },
            start: { type: 'number' },
            end: { type: 'number' },
            reason: { type: 'string' },
          },
          required: ['imageId', 'start', 'end', 'reason'],
          additionalProperties: false,
        },
      },
    },
    required: ['placements'],
    additionalProperties: false,
  } });

  const known = new Set(req.images.map((i) => i.id));
  const candidates = (out.placements ?? [])
    .filter((p) => known.has(p.imageId) && Number.isFinite(p.start) && Number.isFinite(p.end))
    .map((p) => {
      const start = Math.min(Math.max(p.start, timelineStart), timelineEnd);
      let end = Math.min(Math.max(p.end, timelineStart), timelineEnd);
      if (end - start > 4) end = start + 4;
      return { imageId: p.imageId, start, end, reason: (p.reason ?? '').trim() };
    })
    .filter((p) => p.end > p.start)
    .sort((a, b) => a.start - b.start);

  // Enforce non-overlap: trim a placement's start to the previous end; drop it if too little remains.
  const placements: BrollPlanResponse['placements'] = [];
  for (const p of candidates) {
    const prev = placements[placements.length - 1];
    if (prev && p.start < prev.end) p.start = prev.end;
    if (p.end - p.start >= 0.5) placements.push(p);
  }
  return { placements };
}

// ---------------------------------------------------------------------------
// Music mood
// ---------------------------------------------------------------------------

export const musicMoodRequest = z.object({
  transcript: z.string().trim().min(1).max(200_000),
  language: z.enum(['si', 'en']),
});

const MOOD_TRANSCRIPT_MAX = 12_000;
const clampBpm = (n: unknown, fallback: number) =>
  Math.round(Math.min(200, Math.max(50, Number.isFinite(n as number) ? (n as number) : fallback)));
const cleanList = (list: unknown, max: number) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of Array.isArray(list) ? list : []) {
    if (typeof raw !== 'string') continue;
    const v = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out.slice(0, max);
};

export async function suggestMusicMood(req: z.infer<typeof musicMoodRequest>): Promise<MusicMoodResponse> {
  const system =
    'You are a music supervisor for short-form social videos (TikTok, Reels, Shorts). From the transcript, ' +
    'decide what background music fits under the voice: 2 to 4 moods (single lowercase English words such as ' +
    'upbeat, calm, inspiring, energetic, emotional, happy, dramatic, playful, dark, romantic, epic, relaxing), ' +
    '1 to 3 genres (lowercase English tags as used on Jamendo, such as pop, electronic, ambient, corporate, ' +
    'hiphop, lounge, cinematic, acoustic, rock, classical, world, soundtrack), a tempo range in BPM between 50 ' +
    'and 200, a short English search query of 2 to 4 lowercase words for a tag search in a royalty-free music ' +
    'library (for example "upbeat motivational corporate"), and one short English sentence explaining why. ' +
    'The music sits under speech, so prefer instrumental styles that will not fight the voice.';
  const transcript = req.transcript.length > MOOD_TRANSCRIPT_MAX
    ? `${req.transcript.slice(0, MOOD_TRANSCRIPT_MAX)} …`
    : req.transcript;
  const out = await generateJSON<Partial<MusicMoodResponse>>({
    system,
    content: `Transcript language: ${req.language === 'si' ? 'Sinhala' : 'English'}\n\nTranscript:\n${transcript}`,
    schema: {
      type: 'object',
      properties: {
        moods: { type: 'array', items: { type: 'string' } },
        genres: { type: 'array', items: { type: 'string' } },
        bpmMin: { type: 'integer' },
        bpmMax: { type: 'integer' },
        searchQuery: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['moods', 'genres', 'bpmMin', 'bpmMax', 'searchQuery', 'reason'],
      additionalProperties: false,
    },
  });

  const moods = cleanList(out.moods, 4);
  const genres = cleanList(out.genres, 3);
  let bpmMin = clampBpm(out.bpmMin, 90);
  let bpmMax = clampBpm(out.bpmMax, 120);
  if (bpmMin > bpmMax) [bpmMin, bpmMax] = [bpmMax, bpmMin];
  let searchQuery = (out.searchQuery ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!searchQuery) searchQuery = [...moods.slice(0, 2), ...genres.slice(0, 1)].join(' ');
  if (!moods.length && !searchQuery) throw new HttpError(502, `${providerLabel()} did not return a music suggestion.`);
  return { moods, genres, bpmMin, bpmMax, searchQuery, reason: (out.reason ?? '').trim() };
}
