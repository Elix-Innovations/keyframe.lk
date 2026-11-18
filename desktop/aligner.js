// Caption-timing aligner for the desktop app.
//
// Gemini's own word times drift; the Python service in python/ re-measures every word from the audio (MMS forced
// aligner). It needs Python, PyTorch and a ~1.2 GB model, which are too big to ship in the installer, so they are
// installed on request (from the editor UI, see web/src/components/AlignerSetup.tsx) into the user's data folder with the
// bundled `uv`. Nothing has to be on the machine beforehand: uv downloads its own Python. Every step resumes, so a
// cancelled, failed or interrupted install picks up where it stopped. Without the aligner the editor still works and
// warns that caption timing may drift.
const { spawn, execFile } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');

const IS_WIN = process.platform === 'win32';
// model.safetensors + its JSON files for the pinned MODEL_ID / MODEL_REVISION in python/keyframe_sinhala/align.py.
const MODEL_BYTES = 1_262_000_000;
const MIN_FREE_BYTES = 4 * 1024 ** 3; // venv ~1 GB + model ~1.2 GB + uv download cache ~1 GB, with headroom
const VC_REDIST_URL = 'https://aka.ms/vs/17/release/vc_redist.x64.exe';

function portInUse(port) {
  return new Promise((resolve) => {
    const c = net.connect(port, '127.0.0.1');
    c.once('connect', () => { c.destroy(); resolve(true); });
    c.once('error', () => { c.destroy(); resolve(false); });
  });
}

/** Total size of the files under `dir` (async, so a big tree never blocks the window). */
async function dirSize(dir) {
  let total = 0;
  let entries;
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) total += await dirSize(full);
    else if (e.isFile()) total += await fs.promises.stat(full).then((s) => s.size, () => 0);
  }
  return total;
}

const MIB = { B: 1, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cancelled extends Error {}

/**
 * `userData` is the per-user app folder; `base` is the folder holding the bundled `bin/` and `pyroot/`; `env` says
 * where ffmpeg is (the service decodes every clip with it). `onState` receives every state change (see `state()`).
 */
function createAligner({ userData, base, port: PORT = 8788, track, env: extraEnv = {}, onState = () => {} }) {
  const root = path.join(userData, 'aligner');
  const p = {
    root,
    venv: path.join(root, 'venv'),
    state: path.join(root, 'state.json'),
    log: path.join(root, 'setup.log'),
    hf: path.join(root, 'hf'),
    uvCache: path.join(root, 'uv-cache'),
    pythons: path.join(root, 'python'),
    pyDir: path.join(base, 'pyroot', 'python'),
    uv: path.join(base, 'bin', IS_WIN ? 'uv.exe' : 'uv'),
    py: IS_WIN ? path.join(root, 'venv', 'Scripts', 'python.exe') : path.join(root, 'venv', 'bin', 'python'),
  };

  const bundled = () => fs.existsSync(p.uv) && fs.existsSync(path.join(p.pyDir, 'app.py'));
  const saved = () => { try { return JSON.parse(fs.readFileSync(p.state, 'utf8')); } catch { return {}; } };
  const save = (s) => { try { fs.mkdirSync(p.root, { recursive: true }); fs.writeFileSync(p.state, JSON.stringify(s)); } catch {} };
  const installed = () => saved().installed === true && fs.existsSync(p.py);

  /** Why this machine can never run the aligner ('' when it can). */
  function unsupportedReason() {
    if (!bundled()) return 'This build of Keyframe does not include the caption-timing installer.';
    if (process.platform === 'darwin') {
      if (process.arch !== 'arm64') return 'Accurate caption timing needs a Mac with Apple silicon.';
      const major = Number(String(process.getSystemVersion?.() || os.release()).split('.')[0]);
      // PyTorch's macOS wheels need macOS 14+ (darwin 23+). getSystemVersion gives "14.x"; os.release gives "23.x".
      if (process.getSystemVersion ? major < 14 : major < 23) return 'Accurate caption timing needs macOS 14 (Sonoma) or later.';
    }
    if (IS_WIN && process.arch !== 'x64') return 'Accurate caption timing needs 64-bit Windows on an Intel or AMD processor.';
    return '';
  }

  // ---- state -------------------------------------------------------------------------------------------------------
  // phase: missing | checking | python | packages | verifying | model | starting | ready | failed | unsupported
  let st = { phase: 'missing', percent: 0, message: '', detail: '', error: '', interrupted: false, logPath: p.log };
  function set(patch) {
    st = { ...st, ...patch };
    onState(state());
  }
  function state() {
    if (!installing && st.phase !== 'failed' && st.phase !== 'ready' && st.phase !== 'starting') {
      const why = unsupportedReason();
      if (why) return { ...st, phase: 'unsupported', message: why };
      if (!installed()) return { ...st, phase: 'missing', interrupted: !!saved().installing };
      // Installed, and the service is being started (main.js waits a few seconds first): never offer to install it.
      if (st.phase === 'missing') return { ...st, phase: 'starting', percent: 99, message: 'Starting caption timing…', detail: '', booting: true };
    }
    return { ...st };
  }

  const toolEnv = () => ({
    ...process.env,
    UV_PROJECT_ENVIRONMENT: p.venv,
    UV_CACHE_DIR: p.uvCache,
    UV_PYTHON_INSTALL_DIR: p.pythons,
    // Only uv's own Python: a broken or unusual system / Homebrew Python on the user's machine must not be picked up.
    UV_PYTHON_PREFERENCE: 'only-managed',
    UV_PYTHON_DOWNLOADS: 'automatic',
    UV_HTTP_TIMEOUT: '120',
    UV_LINK_MODE: 'copy',
    UV_NO_PROGRESS: '1',
    HF_HOME: p.hf,
    PYTHONUNBUFFERED: '1',
    // The sources sit inside the signed app bundle: a __pycache__ written there breaks the code signature's seal.
    PYTHONDONTWRITEBYTECODE: '1',
  });

  let current = null; // the running setup child, so Cancel can stop it
  let cancelled = false;

  function kill(child) {
    if (!child || child.exitCode !== null) return;
    try { child.kill(); } catch {}
    if (IS_WIN && child.pid) execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
  }

  /** Run a command to completion, appending its output to setup.log and passing each output line to `onLine`. */
  function run(cmd, args, { cwd, env, onLine } = {}) {
    return new Promise((resolve, reject) => {
      if (cancelled) return reject(new Cancelled());
      const log = fs.createWriteStream(p.log, { flags: 'a' });
      log.write(`\n$ ${cmd} ${args.join(' ')}\n`);
      const child = spawn(cmd, args, { cwd, env: env || toolEnv(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      current = child;
      track(child);
      let tail = '';
      const feed = (buf) => {
        const text = buf.toString();
        log.write(text);
        tail = (tail + text).slice(-6000);
        if (onLine) for (const line of text.split(/\r?\n|\r/)) if (line.trim()) onLine(line.trim());
      };
      child.stdout.on('data', feed);
      child.stderr.on('data', feed);
      child.once('error', (e) => { current = null; log.end(); reject(new Error(`Could not run ${path.basename(cmd)}: ${e.message}`)); });
      child.once('exit', (code, signal) => {
        current = null;
        log.end();
        if (cancelled) return reject(new Cancelled());
        if (code === 0) return resolve(tail);
        const err = new Error(`${path.basename(cmd)} ${signal ? `stopped (${signal})` : `exited with code ${code}`}`);
        err.tail = tail;
        reject(err);
      });
    });
  }

  /** Network steps: a dropped connection is retried, and uv / the model download resume rather than restart. */
  async function withRetry(label, fn) {
    for (let attempt = 1; ; attempt++) {
      try { return await fn(); } catch (e) {
        if (e instanceof Cancelled || attempt >= 3) throw e;
        set({ detail: `${label}: connection problem, retrying (${attempt + 1} of 3)…` });
        await sleep(3000 * attempt);
        if (cancelled) throw new Cancelled();
      }
    }
  }

  // Overall progress: each phase owns a slice of 0..100.
  const SLICE = { checking: [0, 2], python: [2, 6], packages: [6, 46], verifying: [46, 49], model: [49, 97], starting: [97, 100] };
  const at = (phase, frac) => {
    const [a, b] = SLICE[phase];
    return Math.round(a + (b - a) * Math.max(0, Math.min(1, frac)));
  };
  const mb = (n) => `${Math.round(n / 1024 ** 2)} MB`;

  async function preflight() {
    set({ phase: 'checking', percent: at('checking', 0), message: 'Checking this computer…', detail: '' });
    const why = unsupportedReason();
    if (why) { const e = new Error(why); e.unsupported = true; throw e; }
    fs.mkdirSync(p.root, { recursive: true });
    try {
      const s = await fs.promises.statfs(p.root);
      const free = s.bavail * s.bsize;
      const have = (await dirSize(p.venv)) + (await dirSize(p.hf));
      if (free + have < MIN_FREE_BYTES) {
        throw new Error(`Not enough disk space. About ${mb(MIN_FREE_BYTES - have)} is needed and ${mb(free)} is free on this drive.`);
      }
    } catch (e) { if (/disk space/.test(e.message)) throw e; /* statfs unsupported: carry on */ }
    for (const url of ['https://pypi.org/simple/', 'https://huggingface.co/api/models']) {
      try {
        const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
        if (r.status >= 500) throw new Error(String(r.status));
      } catch {
        throw new Error(`Could not reach ${new URL(url).host}. Check the internet connection (and any firewall or proxy), then try again.`);
      }
    }
  }

  async function installPython() {
    set({ phase: 'python', percent: at('python', 0), message: 'Downloading Python…', detail: '' });
    await withRetry('Python', () => run(p.uv, ['python', 'install', '3.12']));
  }

  async function installPackages() {
    set({ phase: 'packages', percent: at('packages', 0), message: 'Downloading PyTorch and other packages…', detail: '' });
    // uv announces each large download ("Downloading torch (121.4MiB)") and reports it done (" Downloaded torch").
    const sizes = new Map();
    const done = new Set();
    const onLine = (line) => {
      let m = /^Downloading (\S+) \(([\d.]+)(B|KiB|MiB|GiB)\)/.exec(line);
      if (m) sizes.set(m[1], Number(m[2]) * MIB[m[3]]);
      m = /^Downloaded (\S+)/.exec(line);
      if (m) done.add(m[1]);
      if (/^(Prepared|Installed) \d+ packages?/.test(line)) set({ detail: line });
      const total = [...sizes.values()].reduce((a, b) => a + b, 0);
      const got = [...done].reduce((a, n) => a + (sizes.get(n) || 0), 0);
      if (total > 0) set({ percent: at('packages', got / total), detail: `${mb(got)} of ${mb(total)}` });
    };
    // Frozen: install exactly the locked versions (the lockfile covers Windows and macOS wheels).
    await withRetry('Packages', () => run(p.uv, ['sync', '--frozen', '--no-dev', '--no-install-project', '--python', '3.12', '--project', p.pyDir], { onLine }));
  }

  async function verifyPackages() {
    set({ phase: 'verifying', percent: at('verifying', 0), message: 'Checking PyTorch…', detail: '' });
    try {
      await run(p.py, ['-c', 'import torch, transformers, uroman; print("torch", torch.__version__)'], { cwd: p.pyDir });
    } catch (e) {
      if (e instanceof Cancelled) throw e;
      if (IS_WIN && /DLL|WinError 126|c10\.dll|msvcp|vcruntime/i.test(e.tail || '')) {
        const err = new Error('PyTorch needs the Microsoft Visual C++ Redistributable, which is missing on this PC. Install it, then click Retry.');
        err.link = VC_REDIST_URL;
        err.tail = e.tail;
        throw err;
      }
      throw e;
    }
  }

  async function downloadModel() {
    set({ phase: 'model', percent: at('model', 0), message: 'Downloading the speech model…', detail: '' });
    let polling = true;
    const poll = (async () => {
      while (polling) {
        const got = await dirSize(p.hf);
        if (polling) set({ percent: at('model', got / MODEL_BYTES), detail: `${mb(Math.min(got, MODEL_BYTES))} of ${mb(MODEL_BYTES)}` });
        await sleep(1000);
      }
    })();
    try {
      await withRetry('Model', () => run(p.py, ['-c', 'from keyframe_sinhala.align import fetch; print(fetch())'], {
        cwd: p.pyDir, env: { ...toolEnv(), PYTHONPATH: p.pyDir },
      }));
    } finally {
      polling = false;
      await poll;
    }
  }

  let service = null;

  /** Start the alignment service if its pieces are installed. Resolves true when it is running and answering. */
  async function start() {
    if (!installed()) return false;
    if (service && service.exitCode === null && st.phase === 'ready') return true;
    if (!installing) set({ phase: 'starting', percent: 99, message: 'Starting caption timing…', detail: '', error: '', booting: true });
    const ok = await launch();
    set({ booting: false });
    // During an install, install() reports the failure itself.
    if (!ok && !installing) {
      set({ phase: 'failed', message: 'Caption timing did not start.', error: 'See service.log next to setup.log.', detail: '' });
    }
    return ok;
  }

  async function launch() {
    if (service && service.exitCode === null) { kill(service); service = null; }
    if (await portInUse(PORT)) return false; // taken since boot picked it; try again next launch
    const child = spawn(p.py, ['-m', 'uvicorn', 'app:app', '--app-dir', p.pyDir, '--host', '127.0.0.1', '--port', String(PORT)], {
      cwd: p.pyDir,
      // Offline: the model is already in HF_HOME, so never go to the network at runtime.
      env: { ...process.env, ...extraEnv, HF_HOME: p.hf, HF_HUB_OFFLINE: '1', PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    service = child;
    track(child);
    const log = fs.createWriteStream(path.join(p.root, 'service.log'), { flags: 'a' });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.once('error', (e) => console.warn(`[aligner] could not start: ${e.message}`));
    child.once('exit', (code) => {
      log.end();
      console.warn(`[aligner] service stopped (${code})`);
      if (st.phase === 'ready') set({ phase: 'failed', message: 'The caption-timing service stopped.', error: `Exit code ${code}. See service.log next to setup.log.` });
    });
    // Importing PyTorch takes a while the first time; wait until the service answers.
    const end = Date.now() + 120_000;
    while (Date.now() < end && child.exitCode === null) {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/api/sinhala/health`, { signal: AbortSignal.timeout(2000) });
        if (r.ok) { set({ phase: 'ready', percent: 100, message: 'Accurate caption timing is ready.', detail: '', error: '' }); return true; }
      } catch {}
      await sleep(1000);
    }
    if (child.exitCode === null) kill(child); // never answered: don't leave it running behind a "failed" state
    return false;
  }

  let installing = false;

  async function install() {
    if (installing || st.phase === 'ready') return;
    // Already installed (e.g. Retry after the service failed to start): just start it again, no downloads.
    if (installed()) { await start(); return; }
    installing = true;
    cancelled = false;
    set({ error: '', link: '', interrupted: false });
    save({ ...saved(), installing: true, startedAt: new Date().toISOString() });
    try {
      await preflight();
      await installPython();
      await installPackages();
      await verifyPackages();
      await downloadModel();
      save({ installed: true, at: new Date().toISOString() });
      // The packages were copied into the venv, so the download cache only duplicates about 1 GB. Deleted
      // asynchronously: tens of thousands of files would block the window for a long time (Windows especially).
      await fs.promises.rm(p.uvCache, { recursive: true, force: true }).catch(() => {});
      set({ phase: 'starting', percent: at('starting', 0), message: 'Starting caption timing…', detail: '' });
      if (!(await start())) throw new Error('Installed, but the caption-timing service did not start. See service.log next to setup.log.');
    } catch (e) {
      if (e instanceof Cancelled) {
        set({ phase: 'missing', percent: 0, message: '', detail: '', interrupted: true });
      } else {
        const tail = String(e.tail || '').trim().split('\n').slice(-12).join('\n');
        set({
          phase: e.unsupported ? 'unsupported' : 'failed',
          message: e.unsupported ? e.message : 'Caption-timing setup did not finish.',
          error: e.unsupported ? '' : `${e.message}${tail ? `\n\n${tail}` : ''}`.slice(0, 2000),
          link: e.link || '',
          detail: '',
        });
      }
    } finally {
      installing = false;
      current = null;
    }
  }

  function cancel() {
    if (!installing) return;
    cancelled = true;
    kill(current);
  }

  return { start, install, cancel, state, installed, paths: p };
}

module.exports = { createAligner };
