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
  channel: process.env.MOSSA_DESKTOP === '1' ? 'desktop' : process.env.GITHUB_ACTIONS === 'true' ? 'github-pages' : 'local',
  dirty: !!git('status', '--porcelain'),
};

export default defineConfig({
  plugins: [react(), {
    name: 'desktop-manual-dev',
    async configureServer(server) {
      if (process.env.MOSSA_DESKTOP !== '1') return;
      const { default: sirv } = await import('sirv');
      server.middlewares.use('/MossA/manual', sirv('dist-desktop/MossA/manual', { dev: true }));
    },
  }, {
    name: 'mossa-build-info',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify(buildInfo, null, 2) + '\n' });
      for (const [fileName, sourceName] of [['LICENSE.txt', 'LICENSE'], ['THIRD_PARTY_NOTICES.txt', 'THIRD_PARTY_NOTICES.txt']]) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(new URL(`./${sourceName}`, import.meta.url), 'utf8') });
      }
    },
  }],
  define: { __MOSSA_BUILD__: JSON.stringify(buildInfo) },
  // Use the same bundled TeX outlines as the label renderer; no second font family.
  resolve: { alias: { '#default-font/svg/default.js': '@mathjax/mathjax-tex-font/js/svg/default.js' } },
  base: './',
  build: { outDir: process.env.MOSSA_DESKTOP === '1' ? 'dist-desktop' : 'dist' },
  server: {
    watch: { ignored: ['**/src-tauri/**', '**/dist-desktop/**'] },
  },
  worker: { format: 'es' },
});
