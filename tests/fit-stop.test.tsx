import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Evaluation, FitProgress, FitResult, Project } from '../src/types';

// Exercise the actual editor and engine lifecycle; CSS has no behavior in JSDOM.
const styles = registerHooks({ resolve(specifier, context, next) {
  return specifier.endsWith('.css') ? { url: 'data:text/javascript,export%20default%20%7B%7D', shortCircuit: true } : next(specifier, context);
} });
const { default: App } = await import('../src/App');
styles.deregister();

function evaluate(project: Project): Evaluation {
  return { parameters: {}, y: project.spectrum.y, background: project.spectrum.y.map(() => project.background[0].value),
    components: project.sites.map(() => project.spectrum.y.map(() => 0)), residual: project.spectrum.y.map(() => 0), sse: 12, objective: 12 };
}
class FitWorker {
  static instances: FitWorker[] = [];
  onmessage: ((event: { data: any }) => void) | null = null;
  onerror = null;
  stopped = false;
  requests: { id: number; method: string; project: Project }[] = [];
  constructor() { FitWorker.instances.push(this); queueMicrotask(() => this.send({ type: 'ready' })); }
  send(data: any) { this.onmessage?.({ data }); }
  postMessage(request: { id: number; method: string; project: Project }) {
    this.requests.push(request);
    if (request.method === 'evaluate') queueMicrotask(() => this.send({ id: request.id, result: evaluate(request.project), elapsed: 1 }));
  }
  get fit() { return this.requests.findLast(request => request.method === 'fit')!; }
  progress(value: number, iteration = 2) {
    const project = structuredClone(this.fit.project);
    project.sites[0].params.cs.value = value;
    // The local solver resets the wrapper's search count in its snapshots.
    project.search_starts = 1;
    const progress: FitProgress = { project, evaluation: evaluate(project), iteration, elapsed_ms: 200, search_start: 2, search_starts: 4 };
    this.send({ id: this.fit.id, progress });
  }
  finish(value: number) {
    const project = structuredClone(this.fit.project);
    project.sites[0].params.cs.value = value;
    const result: FitResult = { project, evaluation: evaluate(project), errors: { 'site:0:cs': .01 }, iterations: 8,
      converged: true, termination: 'converged', free_parameters: 1, dof: project.spectrum.y.length - 1,
      rank: 1, reduced_objective: .1, warnings: [] };
    this.send({ id: this.fit.id, result, elapsed: 400 });
  }
  terminate() { this.stopped = true; }
}

async function editor() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const originals = new Map<string, unknown>();
  const globals = { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, Element: dom.window.Element, MutationObserver: dom.window.MutationObserver,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    ResizeObserver: class { observe() {} disconnect() {} }, Worker: FitWorker, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(globals)) { originals.set(key, (globalThis as any)[key]); (globalThis as any)[key] = value; }
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} } as any);
  FitWorker.instances = [];
  const root = createRoot(document.getElementById('root')!);
  const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 120)));
  const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => (button.getAttribute('aria-label') ?? button.textContent?.trim()) === text)!;
  const click = async (text: string) => { const target = button(text); assert.ok(target, `Missing button: ${text}`); assert.equal(target.disabled, false); await act(async () => target.click()); };
  const value = () => Number(document.querySelector<HTMLInputElement>('[aria-label="CS value"]')!.value);
  const worker = () => FitWorker.instances.at(-1)!;
  const travel = async (key: string, shiftKey = false) => {
    await act(async () => document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, ctrlKey: true, shiftKey, bubbles: true })));
    await settle();
  };
  await act(async () => root.render(<App/>));
  await settle();
  return { dom, button, click, value, worker, settle, travel, async close() {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, value] of originals) (globalThis as any)[key] = value;
  } };
}

test('Stop & keep retains the newest snapshot, clears old std, persists, undoes, and refits from kept values', async () => {
  const app = await editor();
  try {
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(tab => tab.textContent === 'Fit options')!.click());
    const starts = document.querySelector<HTMLSelectElement>('[aria-label="Starting models"]')!;
    await act(async () => { starts.value = '4'; starts.dispatchEvent(new app.dom.window.Event('change', { bubbles: true })); });
    await app.click('Fit spectrum');
    await act(async () => app.worker().finish(.12));
    assert.equal(app.value(), .12);
    assert.match(document.querySelector('.results-note')!.textContent!, /1 std/);
    const mainButton = app.button('Fit spectrum');
    const cancelButton = app.button('Cancel fit');
    assert.equal(cancelButton.getAttribute('aria-hidden'), 'true');
    await app.click('Fit spectrum');
    assert.equal(app.button('Stop & keep'), mainButton);
    assert.equal(app.button('Cancel fit'), cancelButton);
    assert.equal(cancelButton.getAttribute('aria-hidden'), 'false');
    assert.equal(app.button('Stop & keep').disabled, true);
    const oldWorker = app.worker();
    await act(async () => oldWorker.progress(.34));
    const keep = app.button('Stop & keep');
    assert.equal(keep.disabled, false);
    // Stop within the same React batch as a newer progress update.
    await act(async () => { oldWorker.progress(.56, 3); keep.click(); });
    await app.settle();
    assert.equal(oldWorker.stopped, true);
    assert.equal(app.value(), .56);
    assert.equal(app.button('Fit spectrum'), mainButton);
    assert.equal(cancelButton.getAttribute('aria-hidden'), 'true');
    assert.match(document.querySelector('.status-current')!.textContent!, /current values kept/);
    assert.match(document.querySelector('.results-note')!.textContent!, /fit to estimate std/);
    assert.equal(app.button('Export parameters').disabled, true);
    // The terminated request cannot overwrite the kept model.
    await act(async () => { oldWorker.progress(.78); oldWorker.finish(.99); });
    assert.equal(app.value(), .56);
    await act(async () => window.dispatchEvent(new app.dom.window.Event('pagehide')));
    const saved = JSON.parse(localStorage.getItem('mossa.workspace.v1')!);
    const model = saved.workspace.spectra[0].models[0];
    assert.equal(model.project.sites[0].params.cs.value, .56);
    assert.equal(model.project.search_starts, 4);
    assert.equal(model.fit, null);
    await app.travel('z');
    assert.equal(app.value(), .12);
    assert.match(document.querySelector('.results-note')!.textContent!, /1 std/);
    await app.travel('z', true);
    assert.equal(app.value(), .56);
    await app.click('Fit spectrum');
    assert.equal(app.worker().fit.project.sites[0].params.cs.value, .56);
    await act(async () => app.worker().finish(.6));
    assert.equal(app.value(), .6);
    assert.match(document.querySelector('.results-note')!.textContent!, /1 std/);
  } finally { await app.close(); }
});

test('Cancel fit restores the previous model and fit, including cancellation before any progress', async () => {
  const app = await editor();
  try {
    await app.click('Fit spectrum');
    await act(async () => app.worker().finish(.21));
    for (const withProgress of [false, true]) {
      await app.click('Fit spectrum');
      const oldWorker = app.worker();
      if (withProgress) await act(async () => oldWorker.progress(.65));
      await app.click('Cancel fit');
      await app.settle();
      assert.equal(oldWorker.stopped, true);
      assert.equal(app.value(), .21);
      assert.match(document.querySelector('.status-current')!.textContent!, /previous fit restored/);
      assert.match(document.querySelector('.results-note')!.textContent!, /1 std/);
      assert.equal(app.button('Export parameters').disabled, false);
      await act(async () => oldWorker.finish(.99));
      assert.equal(app.value(), .21);
    }
  } finally { await app.close(); }
});
