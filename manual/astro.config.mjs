import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default defineConfig({
  site: 'https://cprescher.github.io',
  outDir: process.env.MOSSA_DESKTOP === '1' ? './dist-desktop' : './dist',
  base: '/MossA/manual',
  trailingSlash: 'always',
  markdown: { processor: unified({ remarkPlugins: [remarkMath], rehypePlugins: [rehypeKatex] }) },
  integrations: [
    starlight({
      title: 'MossA 2 manual',
      description: 'A practical guide to Mössbauer spectrum analysis in MossA 2.',
      favicon: '/favicon.svg',
      head: [{ tag: 'script', attrs: { src: '/MossA/manual/screenshot-zoom.js', defer: true } }],
      social: [{ icon: 'github', label: 'Source code', href: 'https://github.com/CPrescher/MossA/tree/mossa2' }],
      editLink: { baseUrl: 'https://github.com/CPrescher/MossA/edit/mossa2/manual/' },
      customCss: ['katex/dist/katex.min.css', './src/styles/custom.css'],
      sidebar: [
        { label: 'Open MossA ↗', link: 'https://cprescher.github.io/MossA/' },
        { slug: 'index', label: 'About this manual' },
        { label: 'Start here', items: ['getting-started/first-fit', 'getting-started/workspace'] },
        { label: 'Measured-data tutorials', items: ['tutorials/almandine', 'tutorials/clinopyroxenes', 'tutorials/sms'] },
        { label: 'Analyze a spectrum', items: ['guides/importing-data', 'guides/folding-and-calibration', 'guides/building-models', 'guides/reading-results', 'guides/saving-and-exporting'] },
        { label: 'Advanced workflows', items: ['guides/source-profiles', 'guides/xvbf', 'guides/comparing-models'], collapsed: true },
        { label: 'Reference', items: ['reference/conventions-and-validation', 'reference/troubleshooting'], collapsed: true },
      ],
    }),
  ],
});
