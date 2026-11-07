import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act, useState } from 'react';
import { InlineNameEditor } from '../src/InlineNameEditor';

test('inline names select existing text, commit on Enter/blur, and cancel Escape/empty edits once', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root')!), committed: string[] = [];
  let canceled = 0;
  function Harness() {
    const [name, setName] = useState('Original model'), [editing, setEditing] = useState(true);
    return <>{editing ? <InlineNameEditor name={name} label="Model name" rowId="model-row" onCommit={value => { committed.push(value); setName(value); setEditing(false); }} onCancel={() => { canceled++; setEditing(false); }}/> : <button id="model-row" onClick={() => setEditing(true)}>{name}</button>}<button id="outside">Outside</button></>;
  }
  const input = () => document.querySelector<HTMLInputElement>('input')!;
  const type = async (value: string) => act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input(), value); input().dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
  const key = async (value: string) => act(async () => { input().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })); });
  const edit = async () => act(async () => document.getElementById('model-row')!.click());
  try {
    await act(async () => root.render(<Harness/>));
    assert.equal(document.activeElement, input()); assert.equal(input().selectionStart, 0); assert.equal(input().selectionEnd, 'Original model'.length);
    await type('  Named alternative  '); await key('Enter');
    assert.deepEqual(committed, ['Named alternative']); assert.equal(document.activeElement?.id, 'model-row');
    await edit(); await type('Canceled alternative'); await key('Escape');
    assert.equal(canceled, 1); assert.deepEqual(committed, ['Named alternative']); assert.equal(document.getElementById('model-row')!.textContent, 'Named alternative');
    await edit(); await type('Saved on blur'); await act(async () => document.getElementById('outside')!.focus());
    assert.deepEqual(committed, ['Named alternative', 'Saved on blur']); assert.equal(document.activeElement?.id, 'outside');
    await edit(); await type('   '); await key('Enter');
    assert.equal(canceled, 2); assert.deepEqual(committed, ['Named alternative', 'Saved on blur']);
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});
