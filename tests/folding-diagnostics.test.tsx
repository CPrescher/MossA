import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FoldingDiagnostics } from '../src/FoldingDiagnostics';

test('choosing a center updates diagnostic halves and markers without changing raw data', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: class { observe() {} disconnect() {} } });
  const container = document.getElementById('root')!, root = createRoot(container);
  const counts = Array.from({ length: 514 }, (_, i) => 10000 + 300 * Math.cos(2 * Math.PI * (i + 1 - 258) / 514)), original = [...counts];
  function Harness({ disabled = false }: { disabled?: boolean }) { const [center, setCenter] = useState(258); return <FoldingDiagnostics counts={counts} center={center} disabled={disabled} onCenter={setCenter}/>; }
  const candidate = (center: number) => container.querySelector(`[aria-label="Use fold center ${center}"]`) as SVGElement;
  try {
    await act(async () => root.render(<Harness/>));
    assert.match(container.textContent!, /Raw spectrum/); assert.match(container.textContent!, /Paired halves/);
    assert.equal(candidate(258).getAttribute('aria-pressed'), 'true');
    const oldResidual = container.querySelectorAll('[data-testid="fold-difference"]')[10]!.getAttribute('cy');
    await act(async () => candidate(254).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
    assert.equal(candidate(254).getAttribute('aria-pressed'), 'true');
    assert.notEqual(container.querySelectorAll('[data-testid="fold-difference"]')[10]!.getAttribute('cy'), oldResidual);
    await act(async () => candidate(258.5).dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    assert.equal(candidate(258.5).getAttribute('aria-pressed'), 'true');
    await act(async () => root.render(<Harness disabled/>));
    await act(async () => candidate(256).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
    assert.equal(candidate(258.5).getAttribute('aria-pressed'), 'true');
    assert.deepEqual(counts, original);
    assert.ok(!container.innerHTML.includes('NaN'));
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});
