import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SidebarScrollbars } from '../src/SidebarScrollbars';

test('persistent sidebar scrollbars support thumb dragging, wheel/track scrolling, and disappear when overflow ends', async () => {
  const dom = new JSDOM('<aside class="left-panel"><div class="site-editor"></div></aside><div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  let onResize = () => {};
  class Observer { constructor(callback: () => void) { onResize = callback; } observe() {} unobserve() {} disconnect() {} }
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, getComputedStyle: dom.window.getComputedStyle, MutationObserver: dom.window.MutationObserver, ResizeObserver: Observer, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true });
  const target = document.querySelector<HTMLElement>('.site-editor')!, sidebar = document.querySelector<HTMLElement>('aside')!;
  sidebar.style.overflow = 'hidden';
  const bounds = (y: number, height: number) => ({ x: 0, y, width: 214, height, top: y, bottom: y + height, left: 0, right: 214, toJSON() {} });
  sidebar.getBoundingClientRect = () => bounds(0, 600);
  target.getBoundingClientRect = () => bounds(100, 200);
  Object.defineProperties(target, { clientHeight: { value: 200 }, scrollHeight: { value: 800, configurable: true } });
  const proto = dom.window.HTMLElement.prototype as any;
  proto.setPointerCapture = () => {}; proto.hasPointerCapture = () => true; proto.releasePointerCapture = () => {};
  const root = createRoot(document.getElementById('root')!);
  const flush = () => act(async () => new Promise(resolve => setTimeout(resolve, 35)));
  const pointer = async (element: Element, type: string, y: number) => act(async () => { const event = new dom.window.MouseEvent(type, { clientY: y, button: 0, bubbles: true }); Object.defineProperty(event, 'pointerId', { value: 1 }); element.dispatchEvent(event); });
  try {
    await act(async () => root.render(<SidebarScrollbars/>)); await flush();
    const track = document.querySelector<HTMLElement>('.sidebar-scroll-track')!, thumb = document.querySelector<HTMLElement>('.sidebar-scroll-thumb')!;
    assert.ok(track); assert.equal(track.style.top, '100px'); assert.equal(thumb.style.height, '50px');
    await pointer(thumb, 'pointerdown', 110); await pointer(thumb, 'pointermove', 135); await pointer(thumb, 'pointerup', 135); await flush();
    assert.equal(target.scrollTop, 100); assert.equal(thumb.style.top, '25px');
    await act(async () => track.dispatchEvent(new dom.window.WheelEvent('wheel', { deltaY: 50, bubbles: true }))); await flush(); assert.equal(target.scrollTop, 150);
    await pointer(track, 'pointerdown', 270); await flush(); assert.equal(target.scrollTop, 320);
    Object.defineProperty(target, 'scrollHeight', { value: 200, configurable: true }); await act(async () => onResize()); await flush();
    assert.equal(document.querySelector('.sidebar-scroll-track'), null);
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});
