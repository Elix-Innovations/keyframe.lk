/**
 * Use the Claude account you are already signed in to on this computer, through the Claude Code CLI (`claude`).
 * No API key is stored or sent anywhere: the CLI keeps its own login. The server only runs `claude -p` (print mode)
 * in an empty temporary folder with every tool switched off, so it can only answer, never read or change files.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { HttpError } from './errors.js';

const bin = () => process.env.CLAUDE_BIN || 'claude';

interface RunResult { code: number | null; stdout: string; stderr: string; missing: boolean; timedOut: boolean }

function run(args: string[], opts: { timeoutMs: number; cwd?: string; input?: string; signal?: AbortSignal }): Promise<RunResult> {
  return new Promise((resolve) => {
    // Credentials in the environment would make the CLI bill an API key; strip them so it uses the signed-in account.
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
    let child: ReturnType<typeof spawn>;
    try { child = spawn(bin(), args, { cwd: opts.cwd, env, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch { resolve({ code: null, stdout: '', stderr: '', missing: true, timedOut: false }); return; }
    let stdout = '', stderr = '', done = false, timedOut = false;
    const finish = (r: Partial<RunResult>) => { if (done) return; done = true; clearTimeout(timer); resolve({ code: null, stdout, stderr, missing: false, timedOut, ...r }); };
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, opts.timeoutMs);
    opts.signal?.addEventListener('abort', () => child.kill('SIGKILL'));
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', (e: NodeJS.ErrnoException) => finish({ missing: e.code === 'ENOENT' }));
    child.on('close', (code) => finish({ code }));
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(opts.input ?? '');
  });
}

export interface ClaudeStatus {
  /** The `claude` command exists on this computer. */
  found: boolean;
  version: string | null;
  /** Signed in with a Claude account (subscription) or an API login. */
  loggedIn: boolean;
  account?: { email?: string; plan?: string; method?: string };
  error?: string;
}

let cache: { at: number; value: ClaudeStatus } | null = null;

/** Is the CLI installed and signed in? Cached for 30 s; cheap (no model call). */
export async function claudeStatus(force = false): Promise<ClaudeStatus> {
  if (!force && cache && Date.now() - cache.at < 30_000) return cache.value;
  let value: ClaudeStatus;
  const v = await run(['--version'], { timeoutMs: 8_000 });
  if (v.missing || v.code !== 0) {
    value = { found: false, version: null, loggedIn: false, error: 'Claude Code is not installed (or CLAUDE_BIN points to nothing).' };
  } else {
    const version = v.stdout.trim().split('\n')[0] || null;
    const a = await run(['auth', 'status'], { timeoutMs: 12_000 });
    let info: { loggedIn?: boolean; email?: string; subscriptionType?: string; authMethod?: string } = {};
    try { info = JSON.parse(a.stdout); } catch { /* older CLI: fall through */ }
    value = info.loggedIn
      ? { found: true, version, loggedIn: true, account: { email: info.email, plan: info.subscriptionType, method: info.authMethod } }
      : { found: true, version, loggedIn: false, error: 'Claude Code is installed but not signed in. Run `claude` once in a terminal and sign in.' };
  }
  cache = { at: Date.now(), value };
  return value;
}

export interface ClaudeJsonOptions {
  system: string;
  prompt: string;
  /** JSON Schema for the answer (a loose one is fine: validate with zod afterwards). */
  schema: Record<string, unknown>;
  timeoutMs?: number;
  model?: string;
  signal?: AbortSignal;
}

export interface ClaudeJsonResult<T> { data: T; costUsd: number | null; model: string | null; durationMs: number }

/** One structured answer from the signed-in Claude account. */
export async function runClaudeJson<T>(opts: ClaudeJsonOptions): Promise<ClaudeJsonResult<T>> {
  const status = await claudeStatus();
  if (!status.found) throw new HttpError(503, status.error ?? 'Claude Code is not installed.');
  if (!status.loggedIn) throw new HttpError(503, status.error ?? 'Claude Code is not signed in.');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'keyframe-claude-'));
  const started = Date.now();
  try {
    const args = [
      '-p', '--output-format', 'json',
      '--json-schema', JSON.stringify(opts.schema),
      '--system-prompt', opts.system,
      '--max-turns', '3',
      '--allowedTools', '',
      ...(opts.model ? ['--model', opts.model] : []),
    ];
    const r = await run(args, { timeoutMs: opts.timeoutMs ?? 180_000, cwd: dir, input: opts.prompt, signal: opts.signal });
    if (r.missing) throw new HttpError(503, 'Claude Code is not installed.');
    if (r.timedOut) throw new HttpError(504, 'Claude took too long to answer. Try a simpler request.');
    let out: { is_error?: boolean; result?: string; structured_output?: unknown; total_cost_usd?: number; modelUsage?: Record<string, unknown>; subtype?: string };
    try { out = JSON.parse(r.stdout); } catch { throw new HttpError(502, `Claude Code returned something unreadable${r.stderr ? `: ${r.stderr.slice(0, 200)}` : '.'}`); }
    if (out.is_error) throw new HttpError(502, `Claude Code reported an error: ${String(out.result ?? out.subtype ?? 'unknown').slice(0, 300)}`);
    let data = out.structured_output as T | undefined;
    if (data === undefined && typeof out.result === 'string') {
      const m = out.result.match(/\{[\s\S]*\}/); // fall back to JSON in the text
      try { data = m ? (JSON.parse(m[0]) as T) : undefined; } catch { /* handled below */ }
    }
    if (data === undefined) throw new HttpError(502, 'Claude did not return a structured answer.');
    return { data, costUsd: out.total_cost_usd ?? null, model: Object.keys(out.modelUsage ?? {})[0] ?? null, durationMs: Date.now() - started };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
