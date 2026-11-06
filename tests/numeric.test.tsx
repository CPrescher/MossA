import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act, useState } from 'react';
import { Numeric, displayNumber } from '../src/Numeric';
const dom = new JSDOM('<div id="root"></div>');
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
const { createRoot } = await import('react-dom/client');

test('compact numeric display preserves small values and trims insignificant digits', () => {
  assert.equal(displayNumber(.123456789), '0.12346');
  assert.equal(displayNumber(1.23456789e-12), '1.2346e-12');
  assert.equal(displayNumber(100000), '100000');
  assert.equal(displayNumber(null), '');
});
test('numeric focus/blur preserves precision, edits commit once, and Escape cancels', async () => {
  const container = document.getElementById('root')!, root = createRoot(container);
  const changes: (number | null)[] = [];
  function Harness() { const [value, setValue] = useState<number | null>(.123456789); return <Numeric label="Value" value={value} onChange={v => { changes.push(v); setValue(v); }}/>; }
  const input = () => container.querySelector('input')!;
  const type = async (value: string) => act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input(), value); input().dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
  try {
    await act(async () => root.render(<Harness/>)); assert.equal(input().value, '0.12346');
    await act(async () => input().focus()); assert.equal(input().value, '0.123456789');
    await act(async () => input().blur()); assert.equal(changes.length, 0);
    await act(async () => input().focus()); await type('0.987654321'); await act(async () => input().blur());
    assert.deepEqual(changes, [.987654321]); assert.equal(input().value, '0.98765');
    await act(async () => input().focus()); await type('7'); await act(async () => input().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.deepEqual(changes, [.987654321]); assert.equal(input().value, '0.98765');
    await act(async () => input().focus()); await type('invalid'); await act(async () => input().blur());
    assert.equal(input().getAttribute('aria-invalid'), 'true'); assert.equal(changes.length, 1);
  } finally { await act(async () => root.unmount()); }
});
