import { test } from 'node:test';
import assert from 'node:assert/strict';
import rebaseLinks from '../manual/plugins/rebase-links.mjs';

test('preview manual links, tutorial downloads, and dark images stay in the preview site', () => {
  const tree = { children: [
    { type: 'element', properties: { href: '/MossA/manual/tutorial-data/example.mossa' } },
    { type: 'element', properties: { src: '/MossA/manual/screenshots/dark/example.jpg' } },
    { type: 'element', properties: { href: 'https://cprescher.github.io/MossA/' } },
    { type: 'element', properties: { href: 'https://github.com/CPrescher/MossA/blob/main/README.md' } },
  ] };
  const stable = structuredClone(tree);
  rebaseLinks()(stable);
  assert.deepEqual(stable, tree, 'stable URLs must retain their established values');
  rebaseLinks({ appBase: '/MossA/preview', sourceRef: 'develop' })(tree);
  assert.equal(tree.children[0].properties.href, '/MossA/preview/manual/tutorial-data/example.mossa');
  assert.equal(tree.children[1].properties.src, '/MossA/preview/manual/screenshots/dark/example.jpg');
  assert.equal(tree.children[2].properties.href, 'https://cprescher.github.io/MossA/preview/');
  assert.equal(tree.children[3].properties.href, 'https://github.com/CPrescher/MossA/blob/develop/README.md');
});
