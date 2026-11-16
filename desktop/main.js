const { app, BrowserWindow, shell, dialog } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');

const API_PORT = 8787;
let children = [];
let win;

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

function startNode(script, env, cwd) {
  const child = spawn(process.execPath, [script], {
    cwd,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...env },
    stdio: 'inherit',
  });
  children.push(child);
  return child;
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
  // Windows builds ship their own ffmpeg/ffprobe next to the app (see package.json win.extraResources).
  const binDir = path.join(base, 'bin');
  const ffmpeg = path.join(binDir, 'ffmpeg.exe');
  const ffprobe = path.join(binDir, 'ffprobe.exe');
  if (process.platform === 'win32' && fs.existsSync(ffmpeg)) {
    env.FFMPEG_PATH = ffmpeg;
    if (fs.existsSync(ffprobe)) env.FFPROBE_PATH = ffprobe;
  }

  startNode(path.join(base, 'server', 'index.mjs'), env, dataDir);
  const webPort = await freePort();
  startNode(path.join(base, 'web', 'server.js'), { PORT: String(webPort), HOSTNAME: '127.0.0.1' }, path.join(base, 'web'));
  await Promise.all([waitFor(API_PORT), waitFor(webPort)]);
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
  } catch (e) {
    dialog.showErrorBox('Keyframe failed to start', String(e && e.message || e));
    app.quit();
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { for (const c of children) try { c.kill(); } catch {} });
