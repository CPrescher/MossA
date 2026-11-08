import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import init, { fit_json } from '../src/wasm/mossa_core.js';
import { FoldingDialog } from '../src/FoldingDialog';
import type { Project } from '../src/types';

await init({ module_or_path: readFileSync(new URL('../src/wasm/mossa_core_bg.wasm', import.meta.url)) });

test('opening alignment retains the sample center; manual and automatic choices apply without an Apply button', async () => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  class Worker {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    constructor() { queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } })); }
    postMessage({ id, project }: { id: number; project: Project }) {
      queueMicrotask(() => this.onmessage?.({ data: { id, result: JSON.parse(fit_json(JSON.stringify(project))), elapsed: 1 } }));
    }
    terminate() {}
  }
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Worker,
    ResizeObserver: class { observe() {} disconnect() {} }, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root')!);
  const counts = Array.from({ length: 514 }, (_, i) => 10000 + 300 * Math.cos(2 * Math.PI * (i + 1 - 258) / 514));
  const changes: { center: number; automatic: boolean }[] = [];
  let closed = false;
  try {
    await act(async () => root.render(<FoldingDialog counts={counts} initialCenter={256.5} onApply={(center, automatic) => changes.push({ center, automatic })} onClose={() => { closed = true; }}/>));
    assert.deepEqual(changes, []);
    assert.equal(document.querySelector<HTMLInputElement>('[aria-label="Inspected fold center"]')!.value, '256.5');
    const button = (text: string) => Array.from(document.querySelectorAll('button')).find(b => b.textContent === text)!;
    assert.equal(button('Apply folding'), undefined);
    await act(async () => document.querySelector('[aria-label="Use fold center 257"]')!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
    assert.deepEqual(changes, [{ center: 257, automatic: false }]);
    const input = document.querySelector<HTMLInputElement>('[aria-label="Inspected fold center"]')!;
    const edit = async (text: string) => {
      await act(async () => input.focus());
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, text);
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      });
      await act(async () => input.blur());
    };
    await edit('257.2');
    assert.equal(changes.length, 1);
    assert.match(document.querySelector('[role="alert"]')!.textContent!, /half-integer/);
    await edit('257.5');
    assert.deepEqual(changes.at(-1), { center: 257.5, automatic: false });
    await act(async () => button('Find automatically').click());
    assert.deepEqual(changes.at(-1), { center: 258, automatic: true });
    await act(async () => button('Done').click());
    assert.equal(closed, true);
    assert.equal(changes.length, 3);
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});
