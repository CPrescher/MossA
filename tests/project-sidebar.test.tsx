import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ProjectSidebar, clampProjectSplit } from '../src/ProjectSidebar';
import { activeSpectrum, appendSpectra, removeSpectrum, selectEntry, workspaceFromSnapshot } from '../src/workspace';
import { decodeSession, defaultLayout } from '../src/session';
import { decodeWorkspaceSession } from '../src/workspaceStorage';
import { demo } from '../src/demo';

test('project sidebar split supports dragging, keyboard limits/reset, collapse, and spectrum navigation', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  class ResizeObserverMock { observe() {} disconnect() {} }
  Object.assign(globalThis, { ResizeObserver: ResizeObserverMock });
  const proto = dom.window.HTMLElement.prototype as any;
  proto.setPointerCapture = () => {}; proto.hasPointerCapture = () => true; proto.releasePointerCapture = () => {};
  const root = createRoot(document.getElementById('root')!);
  const snapshot = { project: demo(), raw: null, cal: { max: 10, shift: 0, folding: false, sinusoidal: false, center: 256.5 }, filename: 'First spectrum', selected: 0 };
  const initial = appendSpectra(workspaceFromSnapshot(snapshot), [{ ...snapshot, filename: 'Second spectrum' }]);
  let removedId: string | undefined;
  function Harness() {
    const [workspace, setWorkspace] = useState(initial), [ratio, setRatio] = useState(.55), [collapsed, setCollapsed] = useState(false);
    return <ProjectSidebar workspace={workspace} disabled={false} ratio={ratio} onRatio={setRatio} collapsed={collapsed} onCollapse={() => setCollapsed(!collapsed)} onSelect={id => setWorkspace(w => selectEntry(w, id))} onImport={() => {}} onRename={() => {}} onRemove={id => { removedId = id; setWorkspace(w => removeSpectrum(w, id)); }}><div>{activeSpectrum(workspace).name} models</div></ProjectSidebar>;
  }
  const separator = () => document.querySelector<HTMLElement>('[aria-label="Resize spectra and models"]')!;
  const key = async (key: string) => act(async () => { separator().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
  try {
    await act(async () => root.render(<Harness/>));
    assert.equal(separator().getAttribute('aria-valuenow'), '55');
    for (const [type, y] of [['pointerdown', 200], ['pointermove', 300], ['pointerup', 300]] as const) await act(async () => { const event = new dom.window.MouseEvent(type, { clientY: y, button: 0, bubbles: true }); Object.defineProperty(event, 'pointerId', { value: 1 }); separator().dispatchEvent(event); });
    assert.equal(separator().getAttribute('aria-valuenow'), '72');
    await key('Home'); assert.equal(separator().getAttribute('aria-valuenow'), separator().getAttribute('aria-valuemin'));
    await key('End'); assert.equal(separator().getAttribute('aria-valuenow'), separator().getAttribute('aria-valuemax'));
    await key('ArrowUp'); assert.equal(separator().getAttribute('aria-valuenow'), '71');
    await act(async () => separator().dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true })));
    assert.equal(separator().getAttribute('aria-valuenow'), '55');
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Collapse project sidebar"]')!.click());
    assert.equal(document.getElementById('project-browser-content')!.hidden, true);
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Expand project sidebar"]')!.click());
    assert.equal(document.getElementById('project-browser-content')!.hidden, false);
    assert.equal(separator().getAttribute('aria-valuenow'), '55');
    const rows = Array.from(document.querySelectorAll<HTMLButtonElement>('.spectrum-row'));
    await act(async () => rows[0].click()); assert.equal(rows[0].getAttribute('aria-current'), 'true');
    await act(async () => rows[0].dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })));
    assert.equal(rows[1].getAttribute('aria-current'), 'true'); assert.equal(document.activeElement, rows[1]);
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Delete spectrum: First spectrum"]')!.click());
    assert.equal(removedId, initial.spectra[0].id);
    assert.equal(document.querySelectorAll('.spectrum-row').length, 1);
    assert.equal(document.querySelector('.spectrum-row')?.getAttribute('aria-current'), 'true');
    assert.equal(document.querySelector('.spectrum-row strong')?.textContent, 'Second spectrum');
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});

test('sidebar layout migrates older sessions, round-trips independent panel flags, and sanitizes split values', () => {
  const snapshot = { project: demo(), raw: null, cal: { max: 10, shift: 0, folding: false, sinusoidal: false, center: 256.5 }, filename: 'Example', selected: 0 };
  const workspace = workspaceFromSnapshot(snapshot);
  const layout = { ...defaultLayout, projectCollapsed: true, optionsCollapsed: false, projectSplit: .71 };
  assert.deepEqual(decodeWorkspaceSession({ version: 1, workspace, layout }).layout, layout);
  assert.deepEqual(decodeSession(JSON.stringify({ version: 2, snapshot, layout, fit: null, elapsed: null })).layout, layout);
  const migrated = decodeWorkspaceSession({ version: 1, workspace, layout: { resultsHeight: 200, sitesHeight: 104, tab: 'Bnds', optionsOpen: true } }).layout;
  assert.equal(migrated.projectCollapsed, true); assert.equal(migrated.optionsCollapsed, false); assert.equal(migrated.projectSplit, .55); assert.equal(migrated.tab, 'Bnds'); assert.equal(migrated.optionsOpen, true);
  const clean = decodeWorkspaceSession({ version: 1, workspace, layout: { projectSplit: 99, projectCollapsed: 'yes', optionsCollapsed: 1 } }).layout;
  assert.equal(clean.projectSplit, .8); assert.equal(clean.projectCollapsed, true); assert.equal(clean.optionsCollapsed, false);
  for (const height of [0, 120, 240, 600, 1000]) for (const value of [-99, 0, .55, 1, 99, NaN]) assert.ok(clampProjectSplit(value, height) >= .2 && clampProjectSplit(value, height) <= .8);
});

test('the last spectrum can be removed in the sidebar and the empty project still accepts imports', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(globalThis, { ResizeObserver: class { observe() {} disconnect() {} } });
  const root = createRoot(document.getElementById('root')!);
  const snapshot = { project: demo(), raw: null, cal: { max: 10, shift: 0, folding: false, sinusoidal: false, center: 256.5 }, filename: 'Only spectrum', selected: 0 };
  function Harness() {
    const [workspace, setWorkspace] = useState(() => workspaceFromSnapshot(snapshot));
    return <ProjectSidebar workspace={workspace} disabled={false} ratio={.55} onRatio={() => {}} collapsed={false} onCollapse={() => {}} onSelect={() => {}} onImport={() => setWorkspace(w => appendSpectra(w, [snapshot]))} onRename={() => {}} onRemove={id => setWorkspace(w => removeSpectrum(w, id))}><div/></ProjectSidebar>;
  }
  const remove = () => document.querySelector<HTMLButtonElement>('[aria-label^="Delete spectrum:"]')!;
  try {
    await act(async () => root.render(<Harness/>));
    assert.equal(remove().disabled, false);
    await act(async () => remove().click());
    assert.equal(document.querySelectorAll('.spectrum-row').length, 0);
    assert.equal(document.querySelector('.no-spectra')?.textContent, 'No spectra yet.');
    assert.equal(remove(), null);
    assert.equal(document.querySelector('.project-sidebar-footer')?.textContent, '0 spectra · 0 models');
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Add spectra"]')!.click());
    assert.equal(document.querySelectorAll('.spectrum-row').length, 1);
    assert.equal(remove().disabled, false);
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});
