// Builds the Next standalone app + bundles the API server into desktop/build.
import { execSync } from 'node:child_process';
import { cpSync, rmSync, mkdirSync, existsSync, realpathSync, readdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, '..');
const root = path.resolve(desktop, '..');
const out = path.join(desktop, 'build');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

console.log('> next build (standalone)');
execSync('npx next build', { cwd: path.join(root, 'web'), stdio: 'inherit', env: { ...process.env, KEYFRAME_DESKTOP: '1' } });
const standalone = path.join(root, 'web', '.next', 'standalone');
// Monorepo-aware: server.js may sit in a nested folder; find it.
const nested = existsSync(path.join(standalone, 'server.js')) ? standalone : path.join(standalone, 'web');
cpSync(realpathSync(nested), path.join(out, 'web'), { recursive: true, dereference: true });
cpSync(path.join(root, 'web', '.next', 'static'), path.join(out, 'web', '.next', 'static'), { recursive: true });
cpSync(path.join(root, 'web', 'public'), path.join(out, 'web', 'public'), { recursive: true });

console.log('> bundling API server');
await build({
  entryPoints: [path.join(root, 'server', 'src', 'index.ts')],
  outfile: path.join(out, 'server', 'index.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node20',
  banner: { js: "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);" },
});
// ---------------------------------------------------------------------------
// Caption-timing aligner (Python service). The desktop app installs its heavy dependencies and the ~1.2 GB model on
// first run (see desktop/main.js), so only the source and a pinned `uv` binary are bundled here.
// ---------------------------------------------------------------------------
const isWin = process.argv.includes('--win');
const UV_VERSION = '0.11.16';
const UV_ASSETS = {
  win32: { file: 'uv-x86_64-pc-windows-msvc.zip', sha256: 'dd9d6d6554bfab265bfa98aa8e8a406c5c3a7b97582f93de1f4d48d9154a0395', bin: 'uv.exe' },
  darwin: { file: 'uv-aarch64-apple-darwin.tar.gz', sha256: '2b25be1af546be330b340b0a76b99f989daa6d92678fdffb87438e661e9d88fb', bin: 'uv' },
};

function findFile(dir, name) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { const hit = findFile(full, name); if (hit) return hit; }
    else if (e.name === name) return full;
  }
  return null;
}

async function bundleUv(target) {
  const asset = UV_ASSETS[target];
  const cache = path.join(desktop, '.cache', `uv-${UV_VERSION}-${target}`);
  const archive = path.join(cache, asset.file);
  mkdirSync(cache, { recursive: true });
  const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
  if (!existsSync(archive) || sha(archive) !== asset.sha256) {
    const url = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${asset.file}`;
    console.log(`> downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not download ${url}: HTTP ${res.status}`);
    writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
  }
  if (sha(archive) !== asset.sha256) throw new Error(`Checksum mismatch for ${asset.file}; refusing to bundle it.`);
  const unpacked = path.join(cache, 'unpacked');
  rmSync(unpacked, { recursive: true, force: true });
  mkdirSync(unpacked, { recursive: true });
  execFileSync('tar', ['-xf', archive, '-C', unpacked]); // bsdtar reads both .tar.gz and .zip (macOS and Windows 10+)
  const found = findFile(unpacked, asset.bin);
  if (!found) throw new Error(`${asset.bin} not found inside ${asset.file}`);
  mkdirSync(path.join(out, 'bin'), { recursive: true });
  const dest = path.join(out, 'bin', asset.bin);
  cpSync(found, dest);
  chmodSync(dest, 0o755);
}

console.log('> bundling Python aligner service');
// Layout mirrors the repo (pyroot/python + pyroot/web/src/lib) because keyframe_sinhala/fm.py finds its table at ../../web/src/lib.
const pyroot = path.join(out, 'pyroot');
const pyFiles = ['app.py', 'pyproject.toml', 'uv.lock', 'README.md'];
mkdirSync(path.join(pyroot, 'python'), { recursive: true });
for (const f of pyFiles) cpSync(path.join(root, 'python', f), path.join(pyroot, 'python', f));
cpSync(path.join(root, 'python', 'keyframe_sinhala'), path.join(pyroot, 'python', 'keyframe_sinhala'), {
  recursive: true, filter: (src) => !src.includes('__pycache__'),
});
mkdirSync(path.join(pyroot, 'web', 'src', 'lib'), { recursive: true });
cpSync(path.join(root, 'web', 'src', 'lib', 'fm-table.json'), path.join(pyroot, 'web', 'src', 'lib', 'fm-table.json'));
await bundleUv(isWin ? 'win32' : 'darwin');

if (process.argv.includes('--win')) {
  // Windows installer ships its own ffmpeg + ffprobe (the server reads FFMPEG_PATH / FFPROBE_PATH).
  console.log('> bundling Windows ffmpeg + ffprobe');
  const require = createRequire(import.meta.url);
  const ffmpegDir = path.dirname(require.resolve('ffmpeg-static/package.json'));
  const ffprobeDir = path.dirname(require.resolve('ffprobe-static/package.json'));
  const sources = {
    'ffmpeg.exe': path.join(ffmpegDir, 'ffmpeg.exe'),
    'ffmpeg.exe.LICENSE': path.join(ffmpegDir, 'ffmpeg.exe.LICENSE'),
    'ffmpeg.exe.README': path.join(ffmpegDir, 'ffmpeg.exe.README'),
    'ffprobe.exe': path.join(ffprobeDir, 'bin', 'win32', 'x64', 'ffprobe.exe'),
  };
  mkdirSync(path.join(out, 'bin'), { recursive: true });
  for (const [name, src] of Object.entries(sources)) {
    if (!existsSync(src)) {
      throw new Error(`Missing ${src}. From desktop/ run: npm_config_platform=win32 npm_config_arch=x64 node node_modules/ffmpeg-static/install.js`);
    }
    cpSync(src, path.join(out, 'bin', name));
  }
}
console.log('done');
