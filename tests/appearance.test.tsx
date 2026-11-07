import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTextSize, readTextSize, textSizeStorageKey } from '../src/appearance';
import { TextSizeControl } from '../src/TextSizeControl';
import { FittingTabs } from '../src/FittingTabs';

test('text size defaults safely, persists across mounts, and works without browser storage', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url:'http://localhost' });
  Object.assign(globalThis, { window:dom.window, document:dom.window.document, IS_REACT_ACT_ENVIRONMENT:true });
  const root = createRoot(document.getElementById('root')!);
  try {
    assert.equal(readTextSize(), 'comfortable');
    window.localStorage.setItem(textSizeStorageKey, 'invalid');
    assert.equal(readTextSize(), 'comfortable');
    await act(async () => root.render(<TextSizeControl/>));
    const select = document.querySelector('select')!;
    await act(async () => { select.value = 'extra-large'; select.dispatchEvent(new dom.window.Event('change', { bubbles:true })); });
    assert.equal(document.documentElement.dataset.textSize, 'extra-large');
    assert.equal(readTextSize(), 'extra-large');
    await act(async () => root.render(null));
    await act(async () => root.render(<TextSizeControl/>));
    assert.equal(document.querySelector('select')!.value, 'extra-large');
    Object.defineProperty(window, 'localStorage', { get:() => { throw new Error('unavailable'); } });
    assert.equal(readTextSize(), 'comfortable');
    await act(async () => { const field = document.querySelector('select')!; field.value = 'large'; field.dispatchEvent(new dom.window.Event('change', { bubbles:true })); });
    assert.equal(document.documentElement.dataset.textSize, 'large');
    applyTextSize('comfortable');
    assert.equal(document.documentElement.dataset.textSize, 'comfortable');
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});

test('fitting tabs expose clear names, one tab stop, arrow wrapping and Home/End navigation', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  Object.assign(globalThis, { window:dom.window, document:dom.window.document, IS_REACT_ACT_ENVIRONMENT:true });
  const root = createRoot(document.getElementById('root')!);
  function Harness() { const [selected,setSelected] = useState('Gen'); return <FittingTabs selected={selected} onSelect={setSelected}/>; }
  try {
    await act(async () => root.render(<Harness/>));
    assert.deepEqual([...document.querySelectorAll('[role=tab]')].map(t => t.textContent), ['General','Bounds','xVBF','Fit options']);
    const press = async (key:string, expected:string) => {
      await act(async () => document.querySelector('[aria-selected=true]')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key,bubbles:true,cancelable:true })));
      assert.equal(document.activeElement?.id, `tab-${expected}`);
      assert.equal(document.activeElement?.getAttribute('aria-selected'), 'true');
      assert.equal(document.querySelectorAll('[role=tab][tabindex="0"]').length, 1);
    };
    await press('ArrowLeft','Opt'); await press('ArrowRight','Gen'); await press('End','Opt'); await press('Home','Gen');
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});
