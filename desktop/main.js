const { app, BrowserWindow, Menu, shell, dialog, session, ipcMain } = require('electron');
const { spawn, execFile } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const { createAligner } = require('./aligner');

// Ports the editor's /api and /api/sinhala rewrites point at (fixed when the web app is built, see web/next.config.ts).
// If another program holds one, the server moves to the next free port and the window's requests are redirected there.
const API_PORT = 8787;
const ALIGN_PORT = 8788;
let children = [];
let win;
let quitting = false;

const resBase = () => (app.isPackaged ? process.resourcesPath : path.join(__dirname, 'build'));

// Startup timings, appended to <userData>/startup.log so a slow launch can be diagnosed on the machine it happens on.
const t0 = Date.now();
const timings = [];
function mark(label) {
  const line = `${String(Date.now() - t0).padStart(6)} ms  ${label}`;
  timings.push(line);
  console.log('[startup]', line);
}
function writeTimings() {
  try {
    const file = path.join(app.getPath('userData'), 'startup.log');
    let prev = '';
    try { prev = fs.readFileSync(file, 'utf8').slice(-20000); } catch {}
    fs.writeFileSync(file, `${prev}\n# ${new Date().toISOString()}  v${app.getVersion()}  ${process.platform}/${process.arch}\n${timings.join('\n')}\n`);
  } catch {}
}

// Port for the local web server. The editor keeps projects and settings in IndexedDB / localStorage, which belong to an
// origin (host + port), so a random port on every launch would orphan them. Use a fixed one; only if every fixed port is
// taken fall back to a random one (the editor still works, it just starts with a fresh browser profile).
const WEB_PORTS = [8790, 8791, 8792, 8793, 8794];
function canListen(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
  });
}
async function pickWebPort() {
  // A web server left by a force-quit run is stopped rather than skipped: moving port would hide the user's projects.
  for (const p of WEB_PORTS) if (await takePort(p)) return p;
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
      c.on('error', () => { c.destroy(); Date.now() > end ? reject(new Error('Timed out starting local servers')) : setTimeout(tick, 100); });
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

const run = (cmd, args) => new Promise((resolve) => {
  execFile(cmd, args, { windowsHide: true, timeout: 5000 }, (err, stdout) => resolve(err ? '' : String(stdout)));
});

/** PIDs of processes listening on 127.0.0.1:`port` (netstat on Windows, lsof elsewhere). */
async function listenersOn(port) {
  if (process.platform === 'win32') {
    const out = await run('netstat', ['-ano', '-p', 'tcp']);
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      const m = line.trim().split(/\s+/);
      // Proto  Local Address  Foreign Address  State  PID
      if (m.length >= 5 && /LISTENING/i.test(m[3]) && m[1].endsWith(`:${port}`)) pids.add(Number(m[4]));
    }
    return [...pids].filter((p) => p > 0);
  }
  const out = await run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
  return out.split(/\s+/).map(Number).filter((p) => p > 0);
}

/**
 * Is `pid` one of our own server processes? The API and web servers run the Keyframe executable itself (as Node); the
 * caption-timing service runs the Python installed under <userData>/aligner.
 */
async function isKeyframeProcess(pid) {
  if (pid === process.pid) return false;
  const exe = path.basename(process.execPath).toLowerCase();
  const alignerDir = path.join(app.getPath('userData'), 'aligner').toLowerCase();
  if (process.platform === 'win32') {
    const out = await run('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']);
    if (out.toLowerCase().includes(`"${exe}"`)) return true;
    const exePath = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}").ExecutablePath`]);
    return exePath.trim().toLowerCase().startsWith(alignerDir);
  }
  // The executable's real path: the process name can't be trusted (the web server renames itself "next-server").
  const txt = await run('lsof', ['-a', '-p', String(pid), '-d', 'txt', '-Fn']);
  const exePath = (txt.split('\n').find((l) => l.startsWith('n')) || '').slice(1);
  if (exePath && exePath === process.execPath) return true;
  const cmd = await run('ps', ['-p', String(pid), '-o', 'command=']);
  return cmd.trim().toLowerCase().startsWith(alignerDir);
}

/** Free (or held by a leftover Keyframe process, which is stopped) -> usable. */
async function takePort(p) {
  if (!(await portInUse(p))) return canListen(p);
  const ours = [];
  for (const pid of await listenersOn(p)) if (await isKeyframeProcess(pid)) ours.push(pid);
  if (!ours.length) return false;
  for (const pid of ours) {
    try { process.kill(pid); } catch {}
    if (process.platform === 'win32') await run('taskkill', ['/PID', String(pid), '/T', '/F']);
  }
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    if (!(await portInUse(p))) { mark(`stopped a leftover Keyframe server on ${p}`); return true; }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

/**
 * A server left over from an earlier run (the app was force-closed, crashed, or was updated while running) still holds
 * the port: stop it. Only Keyframe's own processes are stopped. If something else (a dev server, another program) holds
 * the port, return the next free one instead.
 */
async function claimPort(port, avoid = []) {
  const take = takePort;
  if (await take(port)) return port;
  // Something else holds it: the next port that is free or was ours (a force-quit run may have moved there too).
  for (let p = port + 1; p < port + 200; p++) {
    if (avoid.includes(p)) continue;
    if (await take(p)) { mark(`port ${port} is taken by another program, using ${p}`); return p; }
  }
  throw new Error(`Port ${port} is used by another program and no free port was found nearby. Close it and try again.`);
}

/**
 * The editor calls relative /api URLs, which its web server proxies to the default ports. When a server had to move,
 * send the window's requests straight to it instead (both servers accept any localhost origin).
 */
function redirectMovedPorts(webPort, apiPort, alignPort) {
  if (apiPort === API_PORT && alignPort === ALIGN_PORT) return;
  const prefix = `http://127.0.0.1:${webPort}/api/`;
  session.defaultSession.webRequest.onBeforeRequest({ urls: [`${prefix}*`] }, (details, cb) => {
    const rest = details.url.slice(prefix.length);
    const port = rest.startsWith('sinhala/') ? alignPort : apiPort;
    const def = rest.startsWith('sinhala/') ? ALIGN_PORT : API_PORT;
    cb(port === def ? {} : { redirectURL: `http://127.0.0.1:${port}/api/${rest}` });
  });
}

/**
 * The binary that runs the bundled Node servers. On macOS that is the Helper app, not the main executable: Next.js sets
 * process.title, which checks the process in with LaunchServices, and the bare main binary then shows up in the Dock as
 * a generic "exec" app. The Helper app is LSUIElement, so it never gets a Dock icon.
 */
function nodeBinary() {
  if (process.platform !== 'darwin') return process.execPath;
  const exe = path.basename(process.execPath);
  const helper = path.join(path.dirname(process.execPath), '..', 'Frameworks', `${exe} Helper.app`, 'Contents', 'MacOS', `${exe} Helper`);
  return fs.existsSync(helper) ? helper : process.execPath;
}

function startNode(name, script, env, cwd) {
  const child = spawn(nodeBinary(), [script], {
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

/**
 * Where ffmpeg is, for every child that decodes audio (API server and the aligner). Both installers ship
 * ffmpeg/ffprobe in bin/ (scripts/prepare.mjs), which goes first on PATH. GUI apps don't inherit the shell PATH, so on
 * macOS Homebrew and the usual user bin folders are added too (the `claude` CLI lives in ~/.local/bin or the npm global bin).
 */
function ffmpegEnv() {
  const env = {};
  const binDir = path.join(resBase(), 'bin');
  const exe = process.platform === 'win32' ? '.exe' : '';
  const extra = [binDir];
  if (process.platform === 'darwin') extra.push('/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local', 'bin'), path.join(os.homedir(), '.npm-global', 'bin'));
  env.PATH = [...extra, process.env.PATH || ''].join(path.delimiter);
  const ffmpeg = path.join(binDir, `ffmpeg${exe}`);
  const ffprobe = path.join(binDir, `ffprobe${exe}`);
  if (fs.existsSync(ffmpeg)) env.FFMPEG_PATH = ffmpeg;
  if (fs.existsSync(ffprobe)) env.FFPROBE_PATH = ffprobe;
  return env;
}

async function boot() {
  const dataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const base = resBase();
  const avoid = [API_PORT, ALIGN_PORT, ...WEB_PORTS];
  const apiPort = await claimPort(API_PORT, avoid);
  // The aligner starts later (if installed), but the API needs to know where it will be. Anything already on its port
  // is not ours to reuse: it may be a dev service from another checkout.
  // A caption-timing service left by a force-quit Keyframe is stopped; anything else there makes ours move.
  const alignPort = (await portInUse(ALIGN_PORT)) ? await claimPort(ALIGN_PORT, [...avoid, apiPort]) : ALIGN_PORT;
  const env = {
    PORT: String(apiPort), KEYFRAME_DATA_DIR: dataDir, SINHALA_SERVICE_URL: `http://127.0.0.1:${alignPort}`, ...ffmpegEnv(),
  };

  // HOST keeps the API (and its saved API keys) off the LAN.
  const apiDead = startNode('API server', path.join(base, 'server', 'index.mjs'), { ...env, HOST: '127.0.0.1' }, dataDir);
  const webPort = await pickWebPort();
  const webDead = startNode('Web server', path.join(base, 'web', 'server.js'), { PORT: String(webPort), HOSTNAME: '127.0.0.1' }, path.join(base, 'web'));
  mark(`servers spawned (web on ${webPort})`);
  const dead = Promise.race([apiDead, webDead]);
  const apiUp = waitFor(apiPort).then(() => mark('API listening'));
  const webUp = waitFor(webPort).then(() => mark('web listening'));
  apiUp.catch(() => {}); webUp.catch(() => {}); // when a child dies first, `dead` reports it
  await Promise.race([Promise.all([apiUp, webUp]), dead]);
  // A child dying after boot would otherwise leave the editor talking to nothing.
  dead.catch((e) => {
    if (quitting) return;
    dialog.showErrorBox('Keyframe stopped working', String(e && e.message || e));
    app.quit();
  });
  return { webPort, apiPort, alignPort };
}

/** Tell the splash screen what is happening (no-op once the editor has replaced it). */
function splashStatus(text) {
  if (!win || win.isDestroyed()) return;
  win.webContents.executeJavaScript(`window.setStatus && window.setStatus(${JSON.stringify(text)})`).catch(() => {});
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

// ---- Caption-timing setup, driven from the editor UI through preload.js ----
let editorOrigin = null;
let resolveAligner;
const alignerReady = new Promise((r) => { resolveAligner = r; });

// Progress arrives many times a second; the UI only needs a few updates per second.
let pendingState = null;
let stateTimer = null;
function pushAlignerState(s) {
  pendingState = s;
  if (stateTimer) return;
  stateTimer = setTimeout(() => {
    stateTimer = null;
    if (win && !win.isDestroyed()) win.webContents.send('aligner:state', pendingState);
  }, 250);
}

function registerAlignerIpc() {
  // Only the local editor may drive the installer (never a page a link navigated to).
  const fromEditor = (e) => !!editorOrigin && String(e.senderFrame?.url || '').startsWith(`${editorOrigin}/`);
  const handle = (name, fn) => ipcMain.handle(`aligner:${name}`, async (e) => {
    if (!fromEditor(e)) throw new Error('Not allowed');
    return fn(await alignerReady);
  });
  handle('status', (a) => a.state());
  handle('install', (a) => { a.install(); return a.state(); }); // runs in the background; progress arrives as events
  handle('cancel', (a) => { a.cancel(); return a.state(); });
  handle('openLog', (a) => { shell.showItemInFolder(a.paths.log); });
  handle('openLink', (a) => { const url = a.state().link; if (/^https:\/\//.test(url || '')) shell.openExternal(url); });
}

// `booting` is started before Electron is ready (see below), so the servers warm up while the window is being created.
async function createWindow(booting) {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1000, minHeight: 640,
    title: 'Keyframe', backgroundColor: '#0b0b0c',
    icon: path.join(__dirname, 'icon.png'),
    show: false, // shown on ready-to-show so there is never a blank frame
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : { autoHideMenuBar: true }),
    // preload.js exposes only window.keyframeDesktop (caption-timing setup) to the editor.
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.js') },
  });
  win.once('ready-to-show', () => { win.show(); mark('splash shown'); });
  setTimeout(() => { if (win && !win.isDestroyed() && !win.isVisible()) win.show(); }, 3000); // never leave the app invisible
  // Only web links leave the app; file:, smb: and custom protocols are never handed to the OS.
  const external = (url) => { try { if (/^https?:$/.test(new URL(url).protocol)) shell.openExternal(url); } catch {} };
  win.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
  // The window only ever shows the local editor (loadURL/loadFile don't fire this; links and redirects do).
  win.webContents.on('will-navigate', (e, url) => {
    if (editorOrigin && url.startsWith(`${editorOrigin}/`)) return;
    e.preventDefault();
    external(url);
  });
  // Local splash right away (logo + progress) instead of a black window while the servers start.
  win.loadFile(path.join(__dirname, 'splash.html')).then(() => splashStatus('Starting local servers…')).catch(() => {});
  try {
    const { webPort: port, apiPort, alignPort } = await booting;
    if (win.isDestroyed()) return;
    redirectMovedPorts(port, apiPort, alignPort);
    splashStatus('Opening the editor…');
    editorOrigin = `http://127.0.0.1:${port}`;
    await win.loadURL(`http://127.0.0.1:${port}/editor`);
    mark('editor loaded');
    writeTimings();
    // Caption-timing aligner (Python): start it if installed. Installing it is up to the user, from the editor UI.
    // It loads a large model, so wait until the editor has had a few seconds of the CPU to itself.
    const aligner = createAligner({
      userData: app.getPath('userData'), base: resBase(), port: alignPort, track: (c) => children.push(c), env: ffmpegEnv(),
      onState: pushAlignerState,
    });
    resolveAligner(aligner);
    setTimeout(() => {
      aligner.start().then((ok) => { if (!ok) pushAlignerState(aligner.state()); }).catch((e) => console.warn('[aligner]', e));
    }, 4000);
  } catch (e) {
    writeTimings();
    dialog.showErrorBox('Keyframe failed to start', String(e && e.message || e));
    app.quit();
  }
}

// A second instance would fight the first over the ports and the data dir.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  // The servers do not need Electron to be ready, so start them now and overlap their startup with the window's.
  if (process.platform === 'win32') app.setAppUserModelId('lk.keyframe.desktop'); // taskbar grouping + icon, matches the installer's shortcut
  const booting = boot();
  booting.catch(() => {}); // reported by createWindow
  app.whenReady().then(() => {
    mark('electron ready');
    // The editor needs the clipboard, fullscreen, file pickers and (for voice-over) the mic; nothing else.
    const allowed = new Set(['clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'media', 'fileSystem', 'pointerLock']);
    session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(allowed.has(perm)));
    Menu.setApplicationMenu(appMenu());
    registerAlignerIpc();
    return createWindow(booting);
  });
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  quitting = true;
  for (const c of children) {
    try { c.kill(); } catch {}
    // On Windows kill() ends only the process itself; /T also ends anything it started (e.g. ffmpeg, uvicorn workers).
    if (process.platform === 'win32' && c.pid) try { require('node:child_process').spawnSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { windowsHide: true }); } catch {}
  }
});
