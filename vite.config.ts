import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function git(...args: string[]) {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}
const buildInfo = {
  application: 'MossA 2 preview',
  version: JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string,
  commit: process.env.GITHUB_SHA || git('rev-parse', 'HEAD') || null,
  branch: process.env.GITHUB_REF_NAME || git('branch', '--show-current'),
  builtAt: new Date().toISOString(),
  channel: process.env.GITHUB_ACTIONS === 'true' ? 'github-pages' : 'local',
  dirty: !!git('status', '--porcelain'),
};

export default defineConfig({
  plugins: [react(), {
    name: 'mossa-build-info',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify(buildInfo, null, 2) + '\n' });
    },
  }],
  define: { __MOSSA_BUILD__: JSON.stringify(buildInfo) },
  base: './',
  worker: { format: 'es' },
});
