// Experimental SIMD FFT build. Keep out of production until its numerical
// differences meet the same equivalence gate as the scalar optimizations.
import { spawnSync } from 'node:child_process';
const result = spawnSync('wasm-pack', ['build', 'rust-core', '--target', 'web', '--out-dir', '../validation-data/performance/runtime/simd128', '--release', '--features', 'wasm-simd'], {
  stdio: 'inherit', shell: process.platform === 'win32',
  env: { ...process.env, RUSTFLAGS: [process.env.RUSTFLAGS, '-C target-feature=+simd128'].filter(Boolean).join(' ') },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
