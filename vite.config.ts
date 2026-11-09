import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
  channel: process.env.MOSSA_DESKTOP === '1' ? 'desktop' : process.env.MOSSA_PREVIEW === '1' ? 'github-pages-preview' : process.env.GITHUB_ACTIONS === 'true' ? 'github-pages' : 'local',
  dirty: !!git('status', '--porcelain'),
  fittingBackend: process.env.MOSSA_DESKTOP === '1' ? 'native-rust' : 'wasm',
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
  resolve: { alias: {
    '#default-font/svg/default.js': '@mathjax/mathjax-tex-font/js/svg/default.js',
    ...(process.env.MOSSA_DESKTOP === '1' ? {
      './engine': fileURLToPath(new URL('./src/native-engine.ts', import.meta.url)),
      './comparison-client': fileURLToPath(new URL('./src/native-comparison.ts', import.meta.url)),
    } : {}),
  } },
  base: './',
  build: { outDir: process.env.MOSSA_DESKTOP === '1' ? 'dist-desktop' : 'dist' },
  server: {
    // WebKit blocks some Vite-transformed worker imports under COEP. The
    // bundled preview/desktop/local server enables the shared fast path;
    // development defaults to the portable message path.
    headers: process.env.MOSSA_SHARED_DERIVATIVES === '1' ? { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' } : undefined,
    watch: { ignored: ['**/src-tauri/**', '**/dist-desktop/**'] },
  },
  preview: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' } },
  worker: { format: 'es' },
});
