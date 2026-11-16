const { app, BrowserWindow, Menu, shell, dialog, session } = require('electron');
const os = require('node:os');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const { createAligner } = require('./aligner');

const API_PORT = 8787;
// Fixed, not random: projects live in IndexedDB / OPFS, which belong to the page origin (host + port).
const WEB_PORT = 5181;
let children = [];
let win;
let quitting = false;

const resBase = () => (app.isPackaged ? process.resourcesPath : path.join(__dirname, 'build'));

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
  // Both installers ship ffmpeg/ffprobe in bin/ (scripts/prepare.mjs). Set it on this process's env so every child
  // (API server, Python aligner) finds the same binaries. GUI apps don't inherit the shell PATH, so on macOS also add
  // Homebrew and the usual user bin folders (the `claude` CLI lives in ~/.local/bin or the npm global bin).
  const binDir = path.join(base, 'bin');
  const exe = process.platform === 'win32' ? '.exe' : '';
  const extra = [binDir];
  if (process.platform === 'darwin') extra.push('/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local', 'bin'), path.join(os.homedir(), '.npm-global', 'bin'));
  process.env.PATH = [...extra, process.env.PATH || ''].join(path.delimiter);
  const ffmpeg = path.join(binDir, `ffmpeg${exe}`), ffprobe = path.join(binDir, `ffprobe${exe}`);
  if (fs.existsSync(ffmpeg)) process.env.FFMPEG_PATH = ffmpeg;
  if (fs.existsSync(ffprobe)) process.env.FFPROBE_PATH = ffprobe;

  if (await portInUse(API_PORT)) {
    throw new Error(`Port ${API_PORT} is already in use (another Keyframe or a dev server?). Close it and try again.`);
  }
  // HOST keeps the API (and its saved API keys) off the LAN.
  const apiDead = startNode('API server', path.join(base, 'server', 'index.mjs'), { ...env, HOST: '127.0.0.1' }, dataDir);
  if (await portInUse(WEB_PORT)) {
    throw new Error(`Port ${WEB_PORT} is already in use (another Keyframe?). Close it and try again.`);
  }
  const webPort = WEB_PORT;
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

/** macOS: the usual app / Edit / View / Window menus (Edit makes ⌘C/⌘V work in text fields). Windows: no menu bar,
 * so Alt is free for the editor's Alt shortcuts. Reload and DevTools only in development. */
function appMenu() {
  if (process.platform !== 'darwin') return null;
  const dev = !app.isPackaged ? [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }] : [];
  return Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    { label: 'View', submenu: [...dev, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
  ]);
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1000, minHeight: 640,
    title: 'Keyframe', backgroundColor: '#0b0b0c',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : { autoHideMenuBar: true }),
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  // Only web links leave the app; file:, smb: and custom protocols are never handed to the OS.
  const external = (url) => { try { if (/^https?:$/.test(new URL(url).protocol)) shell.openExternal(url); } catch {} };
  win.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(`http://127.0.0.1:${WEB_PORT}/`)) return;
    e.preventDefault();
    external(url);
  });
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
  app.whenReady().then(() => {
    // The editor needs the clipboard, fullscreen, file pickers and (for voice-over) the mic; nothing else.
    const allowed = new Set(['clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'media', 'fileSystem', 'pointerLock']);
    session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(allowed.has(perm)));
    Menu.setApplicationMenu(appMenu());
    return createWindow();
  });
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { quitting = true; for (const c of children) try { c.kill(); } catch {} });
