import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import themeScreenshots from './plugins/theme-screenshots.mjs';
import mathSearch from './plugins/math-search.mjs';
import rebaseLinks from './plugins/rebase-links.mjs';

const appBase = (process.env.MOSSA_PUBLIC_BASE || '/MossA').replace(/\/$/, '');
const manualBase = `${appBase}/manual`;
const sourceRef = process.env.MOSSA_SOURCE_REF || (process.env.MOSSA_PREVIEW === '1' ? 'develop' : 'main');

export default defineConfig({
  site: 'https://cprescher.github.io',
  cacheDir: process.env.MOSSA_DESKTOP === '1' ? './node_modules/.astro-desktop' : './node_modules/.astro-browser',
  outDir: process.env.MOSSA_DESKTOP === '1' ? './dist-desktop' : './dist',
  base: manualBase,
  trailingSlash: 'always',
  markdown: { processor: unified({ remarkPlugins: [remarkMath], rehypePlugins: [rehypeKatex, mathSearch, themeScreenshots, [rebaseLinks, { appBase, sourceRef, offline: process.env.MOSSA_DESKTOP === '1' }]] }) },
  integrations: [
    starlight({
      title: process.env.MOSSA_PREVIEW === '1' ? 'MossA 2 manual · Develop preview' : 'MossA 2 manual',
      description: 'A practical guide to Mössbauer spectrum analysis in MossA 2.',
      favicon: '/favicon.svg',
      head: [
        { tag: 'script', attrs: { src: `${manualBase}/screenshot-zoom.js`, defer: true } },
        { tag: 'script', attrs: { src: `${manualBase}/comparison-lesson.mjs`, type: 'module' } },
      ],
      social: [{ icon: 'github', label: 'Source code', href: `https://github.com/CPrescher/MossA/tree/${sourceRef}` }],
      editLink: { baseUrl: `https://github.com/CPrescher/MossA/edit/${sourceRef}/manual/` },
      customCss: ['katex/dist/katex.min.css', './src/styles/custom.css', './src/styles/comparison-lesson.css'],
      sidebar: [
        { label: 'Open MossA ↗', link: `https://cprescher.github.io${appBase}/` },
        { slug: 'index', label: 'About this manual' },
        { label: 'Start here', items: ['getting-started/workspace', 'guides/folding-and-calibration', 'getting-started/first-fit'] },
        { label: 'Physics and equations', items: ['foundations/physics', 'foundations/line-shapes', 'foundations/transmission-integral', 'foundations/model-comparison'] },
        { label: 'Measured-data tutorials', items: ['tutorials/almandine', 'tutorials/sms', 'tutorials/syncmoss'] },
        { label: 'Analyze a spectrum', items: ['guides/importing-data', 'guides/building-models', 'guides/reading-results', 'guides/saving-and-exporting'] },
        { label: 'Advanced workflows', items: ['guides/source-profiles', 'guides/xvbf', 'guides/comparing-models'], collapsed: true },
        { label: 'Reference', items: ['reference/conventions-and-validation', 'reference/troubleshooting'], collapsed: true },
      ],
    }),
  ],
});
