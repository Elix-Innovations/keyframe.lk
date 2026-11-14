import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Context } from 'hono';
import { z } from 'zod';
import { HttpError } from './errors.js';

/** API keys the app lets you set from the UI. Saved to server/.env so they survive restarts. */
export const KEY_NAMES = ['GEMINI_API_KEY', 'ELEVENLABS_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'] as const;
type KeyName = (typeof KEY_NAMES)[number];

// KEYFRAME_DATA_DIR is set by the desktop app so keys live in a writable per-user folder.
const ENV_FILE = process.env.KEYFRAME_DATA_DIR
  ? path.join(process.env.KEYFRAME_DATA_DIR, '.env')
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');

export interface KeyInfo { set: boolean; hint: string }

function mask(v: string | undefined): KeyInfo {
  if (!v) return { set: false, hint: '' };
  return { set: true, hint: v.length > 8 ? `••••${v.slice(-4)}` : '••••' };
}

export function keyStatus(): Record<KeyName, KeyInfo> {
  return Object.fromEntries(KEY_NAMES.map((k) => [k, mask(process.env[k])])) as Record<KeyName, KeyInfo>;
}

/** Replace or append `NAME=value` lines in .env, keeping every other line (and comment) as is. */
async function writeEnv(changes: Partial<Record<KeyName, string | null>>) {
  const lines = existsSync(ENV_FILE) ? (await readFile(ENV_FILE, 'utf8')).split(/\r?\n/) : [];
  for (const [name, value] of Object.entries(changes)) {
    const re = new RegExp(`^\\s*${name}\\s*=`);
    const line = `${name}=${value ?? ''}`;
    const i = lines.findIndex((l) => re.test(l));
    if (i >= 0) lines[i] = line;
    else {
      while (lines.length && lines[lines.length - 1] === '') lines.pop();
      lines.push(line);
    }
  }
  await writeFile(ENV_FILE, lines.join('\n').replace(/\n*$/, '\n'), { mode: 0o600 });
}

const body = z.object(
  Object.fromEntries(KEY_NAMES.map((k) => [k, z.string().max(500).regex(/^[^\s"'#]*$/, 'Key must not contain spaces or quotes').nullable().optional()])) as Record<KeyName, z.ZodOptional<z.ZodNullable<z.ZodString>>>,
).strict();

export const getKeys = (c: Context) => c.json(keyStatus());

/** `{ NAME: "value" }` sets a key, `{ NAME: null }` or `""` removes it; unlisted keys are untouched. */
export async function putKeys(c: Context) {
  let raw: unknown;
  try { raw = await c.req.json(); } catch { throw new HttpError(400, 'Request body must be valid JSON.'); }
  const parsed = body.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid request.');
  const changes: Partial<Record<KeyName, string | null>> = {};
  for (const k of KEY_NAMES) {
    const v = parsed.data[k];
    if (v === undefined) continue;
    changes[k] = v?.trim() || null;
  }
  await writeEnv(changes);
  for (const [k, v] of Object.entries(changes)) {
    if (v) process.env[k] = v;
    else delete process.env[k];
  }
  return c.json(keyStatus());
}
