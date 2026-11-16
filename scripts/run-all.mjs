// Runs the API server, the Python aligner and the web app together, on macOS, Linux and Windows (no `&` in cmd).
// Usage: node scripts/run-all.mjs dev|start. Ctrl+C stops all three.
import { spawn } from 'node:child_process';

const mode = process.argv[2] === 'start' ? 'start' : 'dev';
const jobs = mode === 'dev'
  ? [['api', 'npm --prefix server run dev'], ['py', 'npm run py:dev'], ['web', 'npm --prefix web run dev']]
  : [['api', 'npm --prefix server start'], ['py', 'npm run py:start'], ['web', 'npm --prefix web start']];

const children = jobs.map(([name, cmd]) => {
  // Fixed command strings only, so the shell is safe here (Windows needs it to run npm.cmd).
  const child = spawn(cmd, { shell: true, stdio: 'inherit' });
  child.on('exit', (code) => {
    console.log(`[${name}] exited with ${code}`);
    stop(code ?? 1);
  });
  return child;
});

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill();
  process.exitCode = code;
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
