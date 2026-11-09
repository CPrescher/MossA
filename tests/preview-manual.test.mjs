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


test('bootstrap replay data follows its manual base without changing external URLs', () => {
  const tree = { children: [
    { type: 'element', properties: { dataSrc: '/MossA/manual/tutorial-data/site-comparison/replay.json' } },
    { type: 'element', properties: { 'data-src': '/MossA/manual/tutorial-data/site-comparison/replay.json' } },
    { type: 'element', properties: { href: 'https://example.org/reference' } },
  ] };
  const stable = structuredClone(tree);
  rebaseLinks()(stable);
  assert.deepEqual(stable, tree);
  rebaseLinks({ appBase: '/MossA/preview', sourceRef: 'develop' })(tree);
  assert.equal(tree.children[0].properties.dataSrc, '/MossA/preview/manual/tutorial-data/site-comparison/replay.json');
  assert.equal(tree.children[1].properties['data-src'], '/MossA/preview/manual/tutorial-data/site-comparison/replay.json');
  assert.equal(tree.children[2].properties.href, 'https://example.org/reference');
});


test('desktop manual pins its source and retains an explicit video link without an online iframe', () => {
  const commit = 'a'.repeat(40);
  const tree = { children: [
    { type: 'element', tagName: 'iframe', properties: { src: 'https://www.youtube-nocookie.com/embed/example' } },
    { type: 'element', tagName: 'a', properties: { href: 'https://www.youtube.com/watch?v=example' } },
    { type: 'element', tagName: 'a', properties: { href: 'https://github.com/CPrescher/MossA/blob/main/PORTING.md' } },
  ] };
  const browser = structuredClone(tree);
  rebaseLinks()(browser);
  assert.equal(browser.children.length, 3, 'browser manual retains its player');
  rebaseLinks({ sourceRef: commit, offline: true })(tree);
  assert.equal(tree.children.length, 2);
  assert.equal(tree.children[0].properties.href, 'https://www.youtube.com/watch?v=example');
  assert.equal(tree.children[1].properties.href, `https://github.com/CPrescher/MossA/blob/${commit}/PORTING.md`);
});


test('desktop manual removes authored raw HTML video while preserving adjacent content', () => {
  const tree = { children: [{ type: 'raw', value: '<iframe class="tutorial-video" src="https://www.youtube-nocookie.com/embed/example" allowfullscreen></iframe><p>Keep the written tutorial.</p>' }] };
  const browser = structuredClone(tree);
  rebaseLinks()(browser);
  assert.match(browser.children[0].value, /<iframe/);
  rebaseLinks({ offline: true })(tree);
  assert.equal(tree.children[0].value, '<p>Keep the written tutorial.</p>');
});
