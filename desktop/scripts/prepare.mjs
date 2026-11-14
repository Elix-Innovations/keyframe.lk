// Builds the Next standalone app + bundles the API server into desktop/build.
import { execSync } from 'node:child_process';
import { cpSync, rmSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
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
console.log('done');
