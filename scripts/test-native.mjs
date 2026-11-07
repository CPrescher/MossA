// Exercise the actual native core/session registry through the desktop adapter.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../', import.meta.url));
const built = spawnSync('cargo', ['build', '--locked', '--release', '--manifest-path', 'rust-core/Cargo.toml', '--example', 'native_fixture', '--message-format', 'json'], { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
if (built.stderr) process.stderr.write(built.stderr);
if (built.status !== 0) { if (built.stdout) process.stderr.write(built.stdout); process.exit(built.status ?? 1); }
const executable = built.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line)).find(message => message.reason === 'compiler-artifact' && message.target.name === 'native_fixture' && message.executable)?.executable;
if (!executable) throw new Error('The native parity test executable was not built.');
const tested = spawnSync(process.execPath, ['--import', 'tsx', '--test', 'tests/native-backend.integration.tsx'], { cwd, env: { ...process.env, MOSSA_NATIVE_FIXTURE: executable }, stdio: 'inherit' });
process.exit(tested.status ?? 1);
