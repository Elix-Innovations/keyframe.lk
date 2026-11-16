const { app, BrowserWindow, shell, dialog } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const { createAligner } = require('./aligner');

const API_PORT = 8787;
let children = [];
let win;
let quitting = false;

const resBase = () => (app.isPackaged ? process.resourcesPath : path.join(__dirname, 'build'));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on('error', reject);
  });
}

function waitFor(port, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const c = net.connect(port, '127.0.0.1');
      c.on('connect', () => { c.destroy(); resolve(); });
      c.on('error', () => { c.destroy(); Date.now() > end ? reject(new Error('Timed out starting local servers')) : setTimeout(tick, 250); });
    };
    tick();
  });
}

// Something already accepting connections on the port (a stale API from a force-quit run, `npm run dev`, ...).
function portInUse(port) {
  return new Promise((resolve) => {
    const c = net.connect(port, '127.0.0.1');
    c.once('connect', () => { c.destroy(); resolve(true); });
    c.once('error', () => { c.destroy(); resolve(false); });
  });
}

function startNode(name, script, env, cwd) {
  const child = spawn(process.execPath, [script], {
    cwd,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...env },
    stdio: 'inherit',
  });
  children.push(child);
  // Rejects if the child fails to spawn or exits at any point; callers decide what that means.
  const dead = new Promise((_, reject) => {
    child.once('error', (e) => reject(new Error(`${name} failed to start: ${e.message}`)));
    child.once('exit', (code, signal) => reject(new Error(`${name} stopped unexpectedly (${signal || `exit code ${code}`}).`)));
  });
  dead.catch(() => {});
  return dead;
}

async function boot() {
  const dataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const base = resBase();
  const env = { PORT: String(API_PORT), KEYFRAME_DATA_DIR: dataDir };
  if (process.platform === 'darwin') {
    // GUI apps don't inherit the shell PATH; ffmpeg usually lives in Homebrew.
    env.PATH = ['/opt/homebrew/bin', '/usr/local/bin', process.env.PATH || ''].join(path.delimiter);
  }
  // Windows builds ship their own ffmpeg/ffprobe next to the app (see package.json extraResources and scripts/prepare.mjs).
  const binDir = path.join(base, 'bin');
  const ffmpeg = path.join(binDir, 'ffmpeg.exe');
  const ffprobe = path.join(binDir, 'ffprobe.exe');
  if (process.platform === 'win32' && fs.existsSync(ffmpeg)) {
    env.FFMPEG_PATH = ffmpeg;
    if (fs.existsSync(ffprobe)) env.FFPROBE_PATH = ffprobe;
  }

  if (await portInUse(API_PORT)) {
    throw new Error(`Port ${API_PORT} is already in use (another Keyframe or a dev server?). Close it and try again.`);
  }
  // HOST keeps the API (and its saved API keys) off the LAN.
  const apiDead = startNode('API server', path.join(base, 'server', 'index.mjs'), { ...env, HOST: '127.0.0.1' }, dataDir);
  const webPort = await freePort();
  const webDead = startNode('Web server', path.join(base, 'web', 'server.js'), { PORT: String(webPort), HOSTNAME: '127.0.0.1' }, path.join(base, 'web'));
  const dead = Promise.race([apiDead, webDead]);
  await Promise.race([Promise.all([waitFor(API_PORT), waitFor(webPort)]), dead]);
  // A child dying after boot would otherwise leave the editor talking to nothing.
  dead.catch((e) => {
    if (quitting) return;
    dialog.showErrorBox('Keyframe stopped working', String(e && e.message || e));
    app.quit();
  });
  return webPort;
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1000, minHeight: 640,
    title: 'Keyframe', backgroundColor: '#0b0b0c',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : { autoHideMenuBar: true }),
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  try {
    const port = await boot();
    await win.loadURL(`http://127.0.0.1:${port}/editor`);
    // Caption-timing aligner (Python): start it if installed, otherwise offer to set it up. Never blocks the editor.
    const aligner = createAligner({
      userData: app.getPath('userData'), base: resBase(), getWindow: () => win, track: (c) => children.push(c),
    });
    aligner.start().then((running) => (running ? undefined : aligner.offerInstall())).catch((e) => console.warn('[aligner]', e));
  } catch (e) {
    dialog.showErrorBox('Keyframe failed to start', String(e && e.message || e));
    app.quit();
  }
}

// A second instance would fight the first over port 8787 and the data dir.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(createWindow);
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { quitting = true; for (const c of children) try { c.kill(); } catch {} });
