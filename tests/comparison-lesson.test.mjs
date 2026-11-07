import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const replay = JSON.parse(await readFile(new URL('../manual/public/tutorial-data/site-comparison/replay.json', import.meta.url)));
const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/', pretendToBeVisual: true });
const window = dom.window;
const prior = new Map();
for (const name of ['window', 'document', 'HTMLElement', 'customElements', 'matchMedia', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'fetch']) prior.set(name, globalThis[name]);
Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, customElements: window.customElements,
  matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
  ResizeObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window), fetch: async () => ({ ok: true, json: async () => structuredClone(replay) }) });
const { fRatio, binImprovements } = await import('../manual/public/comparison-lesson.mjs');
after(() => { dom.window.close(); for (const [key, value] of prior) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
async function lesson() { const node = document.createElement('site-comparison-lesson'); node.dataset.src = '/replay.json'; document.body.append(node); await settle(); assert.equal(node.dataset.ready, 'true'); return node; }

test('F arithmetic responds to the selected residual error and counts parameters, not sites', () => {
  assert.ok(Math.abs(fRatio(300, 290, 5, 9, 256) - 2.1293103448275863) < 1e-12);
  const node = document.createElement('f-ratio-lesson'); document.body.append(node);
  assert.match(node.querySelector('[data-f]').textContent, /2\.13/);
  node.querySelector('[data-large]').click(); assert.match(node.querySelector('[data-f]').textContent, /26\.46/);
  const input = node.querySelector('input'); input.value = 299; input.dispatchEvent(new window.Event('input'));
  assert.match(node.querySelector('[data-bar-label]').textContent, /299.*1 were removed/); node.remove();
});

test('histogram preserves every trial and counts >= observed correctly even within the same bin', () => {
  const bins = binImprovements([0, 1, 1.1, 1.2, 4], 1.1, 5, 2);
  assert.equal(bins.reduce((n, b) => n + b.ordinary + b.extreme, 0), 5);
  assert.equal(bins.reduce((n, b) => n + b.extreme, 0), 3);
  for (const item of replay.cases) {
    assert.equal(item.samples.length, 199); assert.equal(item.improvements.length, 199);
    assert.equal(item.exceedances, item.improvements.filter(value => value >= item.improvement).length);
    assert.equal(item.p, (item.exceedances + 1) / 200);
  }
});

test('replay steps, finishes, resets, and treats the weak p-value as borderline', async () => {
  const node = await lesson();
  assert.match(node.querySelector('[data-result]').textContent, /Finish all 199/);
  node.querySelector('[data-next]').click(); assert.match(node.querySelector('[data-stage]').textContent, /spectrum 1 of 199/);
  node.querySelector('[data-all]').click(); assert.match(node.querySelector('[data-result]').textContent, /0\.28/);
  assert.match(node.querySelector('[data-result]').textContent, /no clear support/);
  const select = node.querySelector('select'); select.value = 'weak'; select.dispatchEvent(new window.Event('change'));
  assert.match(node.querySelector('[data-progress]').textContent, /^0 \/ 199/);
  node.querySelector('[data-all]').click(); assert.match(node.querySelector('[data-result]').textContent, /Borderline/);
  assert.match(node.querySelector('[data-result]').textContent, /0\.04/);
  select.value = 'clear'; select.dispatchEvent(new window.Event('change')); node.querySelector('[data-all]').click();
  assert.match(node.querySelector('[data-result]').textContent, /0\.005/);
  assert.match(node.querySelector('[data-result]').textContent, /earns its flexibility/);
  node.querySelector('[data-reset]').click(); assert.match(node.querySelector('[data-stage]').textContent, /Observed teaching/); node.remove();
});

test('reduced-motion play completes statically and fetch failure leaves a readable fallback', async () => {
  const node = await lesson(); node.querySelector('[data-play]').click();
  assert.match(node.querySelector('[data-progress]').textContent, /^199 \/ 199/);
  assert.equal(node.running, false); node.remove();
  const saved = globalThis.fetch; globalThis.fetch = async () => { throw new Error('offline'); };
  const fallback = document.createElement('site-comparison-lesson'); document.body.append(fallback); await settle();
  assert.match(fallback.textContent, /worked table and downloadable projects/); fallback.remove(); globalThis.fetch = saved;
});
