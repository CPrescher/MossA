// Build a self-contained desktop payload without changing the Pages artifact.
import { spawnSync } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const env = { ...process.env, MOSSA_DESKTOP: '1' };
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const dev = process.argv.includes('--dev');
if (!dev) {
  run('npm', ['exec', '--', 'tsc', '--project', 'tsconfig.desktop.json']);
  run('npm', ['exec', '--', 'vite', 'build']);
}
run('npm', ['run', 'build:manual']);
const output = new URL('../dist-desktop/', import.meta.url);
const target = new URL('MossA/manual/', output);
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(new URL('../manual/dist-desktop/', import.meta.url), target, { recursive: true });
run('node', ['scripts/desktop-notices.mjs']);
if (dev) run('npm', ['run', 'dev', '--', '--port', '1420', '--strictPort']);
else run('node', ['scripts/verify-desktop.mjs']);
