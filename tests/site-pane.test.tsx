import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SiteListPane } from '../src/SiteListPane';
test('site list reserves four rows and supports pointer and keyboard resizing', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.getElementById('root')!, root = createRoot(container);
  const proto = dom.window.HTMLElement.prototype as any;
  proto.setPointerCapture = () => {}; proto.hasPointerCapture = () => true; proto.releasePointerCapture = () => {};
  try {
    await act(async () => root.render(<SiteListPane count={4}><div>Sites</div></SiteListPane>));
    const pane = container.querySelector('.site-list-pane') as HTMLElement, splitter = container.querySelector('[role="separator"]')!;
    assert.equal(pane.style.height, 'min(160px, 9rem)');
    for (const [type,y] of [['pointerdown',200],['pointermove',252],['pointerup',252]] as const) await act(async () => { const event = new dom.window.MouseEvent(type, { clientY:y, button:0, bubbles:true }); Object.defineProperty(event,'pointerId',{value:1}); splitter.dispatchEvent(event); });
    assert.equal(pane.style.height,'min(212px, 9rem)');
    await act(async () => splitter.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key:'Home', bubbles:true })));
    assert.equal(pane.style.height,'min(52px, 9rem)');
    await act(async () => splitter.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key:'ArrowDown', bubbles:true })));
    assert.equal(pane.style.height,'min(78px, 9rem)');
  } finally { await act(async () => root.unmount()); }
});
