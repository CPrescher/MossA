import { existsSync } from 'node:fs';
import { basename } from 'node:path';

// Keep ordinary Markdown images authorable in one place. Each application
// screenshot must have a real dark-theme capture with the same basename.
export default function themeScreenshots() {
  return (tree, file) => {
    function walk(parent) {
      if (!parent.children) return;
      parent.children = parent.children.map(node => {
        if (node.type !== 'element' || node.tagName !== 'img') {
          walk(node);
          return node;
        }
        const src = String(node.properties?.src ?? '');
        if (!/assets\/(screenshots\/[^/]+|first-fit)\.(png|jpg)$/.test(src)) return node;
        const name = basename(src).replace(/\.(png|jpg)$/, '');
        const dark = `/MossA/manual/screenshots/dark/${name}.jpg`;
        if (!existsSync(new URL(`../public/screenshots/dark/${name}.jpg`, import.meta.url))) {
          file.fail(`Missing dark screenshot for ${src}`);
        }
        node.properties = { ...node.properties, className: ['screenshot-light'] };
        return {
          type: 'element', tagName: 'span', properties: { className: ['theme-screenshot'] },
          children: [node, {
            type: 'element', tagName: 'img', properties: {
              src: dark, alt: node.properties.alt ?? '', className: ['screenshot-dark'],
              width: 1280, height: 720, loading: 'lazy', decoding: 'async',
            }, children: [],
          }],
        };
      });
    }
    walk(tree);
  };
}
