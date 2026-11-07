import { spawnSync } from 'node:child_process';
import { dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

const env = { ...process.env };
if (process.platform === 'darwin') {
  // Tauri needs Apple's recursive xattr, not a Python xattr executable or shim.
  // Retain the active Node installation for frontend build hooks.
  env.PATH = [dirname(process.execPath), '/usr/bin', '/bin', '/usr/sbin', '/sbin', env.PATH].join(delimiter);
}
const cli = fileURLToPath(new URL('../node_modules/@tauri-apps/cli/tauri.js', import.meta.url));
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
