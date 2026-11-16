// Builds the Next standalone app + bundles the API server into desktop/build.
import { execSync } from 'node:child_process';
import { cpSync, rmSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
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
