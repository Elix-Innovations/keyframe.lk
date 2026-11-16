// Caption-timing aligner for the desktop app.
//
// Gemini's own word times drift; the Python service in python/ re-measures every word from the audio (MMS forced
// aligner). It needs Python, PyTorch and a ~1.2 GB model, which are too big to ship in the installer, so they are
// installed once, on request, into the user's data folder with the bundled `uv`. Without them the editor still works
// and warns that caption timing may drift.
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const { dialog } = require('electron');

const PORT = 8788;
const IS_WIN = process.platform === 'win32';

function portInUse(port) {
  return new Promise((resolve) => {
    const c = net.connect(port, '127.0.0.1');
    c.once('connect', () => { c.destroy(); resolve(true); });
    c.once('error', () => { c.destroy(); resolve(false); });
  });
}

/** `userData` is the per-user app folder; `base` is the folder holding the bundled `bin/` and `pyroot/`. */
function createAligner({ userData, base, getWindow, track }) {
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
  const installed = () => {
    try { return JSON.parse(fs.readFileSync(p.state, 'utf8')).installed === true && fs.existsSync(p.py); } catch { return false; }
  };

  const toolEnv = () => ({
    ...process.env,
    UV_PROJECT_ENVIRONMENT: p.venv,
    UV_CACHE_DIR: p.uvCache,
    UV_PYTHON_INSTALL_DIR: p.pythons,
    UV_LINK_MODE: 'copy',
    HF_HOME: p.hf,
    PYTHONUNBUFFERED: '1',
  });

  /** Run a command to completion, appending its output to setup.log. Rejects with the log tail on failure. */
  function run(cmd, args, opts = {}) {
    return new Promise((resolve, reject) => {
      const log = fs.createWriteStream(p.log, { flags: 'a' });
      log.write(`\n$ ${cmd} ${args.join(' ')}\n`);
      const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env || toolEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
      track(child);
      child.stdout.pipe(log, { end: false });
      child.stderr.pipe(log, { end: false });
      child.once('error', (e) => { log.end(); reject(new Error(`Could not run ${path.basename(cmd)}: ${e.message}`)); });
      child.once('exit', (code, signal) => {
        log.end();
        if (code === 0) return resolve();
        let tail = '';
        try { tail = fs.readFileSync(p.log, 'utf8').split('\n').slice(-12).join('\n'); } catch { /* no log */ }
        reject(new Error(`${path.basename(cmd)} ${signal || `exited with code ${code}`}.\n\n${tail}`));
      });
    });
  }

  /** Start the alignment service if its pieces are installed. Resolves true when it is (or already was) running. */
  async function start() {
    if (!installed()) return false;
    if (await portInUse(PORT)) return true; // already running (e.g. `npm run dev`)
    const child = spawn(p.py, ['-m', 'uvicorn', 'app:app', '--app-dir', p.pyDir, '--host', '127.0.0.1', '--port', String(PORT)], {
      cwd: p.pyDir,
      // Offline: the model is already in HF_HOME, so never go to the network at runtime.
      env: { ...process.env, HF_HOME: p.hf, HF_HUB_OFFLINE: '1', PYTHONUNBUFFERED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    track(child);
    const log = fs.createWriteStream(path.join(p.root, 'service.log'), { flags: 'a' });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.once('error', (e) => console.warn(`[aligner] could not start: ${e.message}`));
    child.once('exit', (code) => { log.end(); console.warn(`[aligner] service stopped (${code})`); });
    return true;
  }

  let installing = false;
  let declined = false;

  async function install() {
    if (installing) return;
    installing = true;
    const win = getWindow();
    win?.setProgressBar(2); // indeterminate
    try {
      fs.mkdirSync(p.root, { recursive: true });
      // Frozen: install exactly the locked versions (the lockfile covers Windows and macOS wheels).
      await run(p.uv, ['sync', '--frozen', '--no-dev', '--no-install-project', '--python', '3.12', '--project', p.pyDir]);
      await run(p.py, ['-c', 'from keyframe_sinhala.align import fetch; print(fetch())'], {
        cwd: p.pyDir, env: { ...toolEnv(), PYTHONPATH: p.pyDir },
      });
      fs.writeFileSync(p.state, JSON.stringify({ installed: true, at: new Date().toISOString() }));
      // The packages were copied into the venv, so the download cache only duplicates about 1 GB.
      fs.rmSync(p.uvCache, { recursive: true, force: true });
      await start();
      dialog.showMessageBox(getWindow() ?? undefined, {
        type: 'info', title: 'Keyframe', message: 'Accurate caption timing is ready.',
        detail: 'New captions made with Gemini will now be matched to the audio word by word.',
      });
    } catch (e) {
      dialog.showMessageBox(getWindow() ?? undefined, {
        type: 'error', title: 'Keyframe', message: 'Could not set up caption timing.',
        detail: `${String(e && e.message || e).slice(0, 1200)}\n\nFull log: ${p.log}\n\nKeyframe still works; captions just may not line up with the voice exactly. You will be asked again next time you open the app.`,
      });
    } finally {
      installing = false;
      getWindow()?.setProgressBar(-1);
    }
  }

  /** Ask once per launch whether to install. Does nothing when already installed or when the pieces are not bundled. */
  async function offerInstall() {
    if (declined || installing || installed() || !bundled()) return;
    const { response } = await dialog.showMessageBox(getWindow() ?? undefined, {
      type: 'question', title: 'Keyframe', message: 'Set up accurate caption timing?',
      detail: 'Keyframe can match every caption word to the audio exactly, so captions never drift from the voice.\n\n'
        + 'This downloads about 1.5 GB once (Python, PyTorch and a speech model) and needs an internet connection. '
        + 'You can keep editing while it installs.\n\nWithout it, caption timing may drift.',
      buttons: ['Install now', 'Later'], defaultId: 0, cancelId: 1,
    });
    if (response === 0) await install(); else declined = true;
  }

  return { start, offerInstall, install, installed, paths: p };
}

module.exports = { createAligner };
