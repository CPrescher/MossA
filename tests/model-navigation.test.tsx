import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ModelNavigation } from '../src/ProjectNavigation';
import { activeModel, activeSpectrum, addModel, removeModel, renameEntry, selectEntry, workspaceFromSnapshot, type Workspace } from '../src/workspace';
import { demo } from '../src/demo';

test('model context menus target inactive models correctly and support keyboard access, dismissal, and last-model protection', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById('root')!);
  const initial = workspaceFromSnapshot({ project: demo(), raw: null, cal: { max: 10, shift: 0, folding: false, sinusoidal: false, center: 256.5 }, filename: 'Example', selected: 0 });
  let two = renameEntry(addModel(initial, true), 'model', 'Different model');
  activeModel(two).project.sites[0].params.cs.value = .7;
  let current = two, renamed: string | undefined;
  function Harness({ start, disabled = false }: { start: Workspace; disabled?: boolean }) {
    const [workspace, setWorkspace] = useState(start); current = workspace;
    return <ModelNavigation workspace={workspace} disabled={disabled}
      onSelect={id => setWorkspace(w => selectEntry(w, w.activeSpectrumId, id))}
      onDuplicate={id => setWorkspace(w => addModel(w, true, id))}
      onNew={() => setWorkspace(w => addModel(w, false))}
      onRename={id => { renamed = id; }} onRemove={id => setWorkspace(w => removeModel(w, id))}/>;
  }
  const tabs = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[role=tab]'));
  const open = async (tab: HTMLButtonElement) => act(async () => { tab.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 200, clientY: 100 })); });
  const item = (name: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')).find(b => b.textContent === name)!;
  try {
    await act(async () => root.render(<Harness start={two}/>));
    const activeId = activeModel(current).id, targetId = activeSpectrum(current).models[0].id;
    await open(tabs()[0]);
    assert.equal(activeModel(current).id, activeId, 'opening the context menu must not switch the active model');
    assert.equal(document.activeElement, item('Duplicate model'));
    await act(async () => item('Duplicate model').click());
    assert.equal(activeSpectrum(current).models.length, 3);
    assert.equal(activeModel(current).name, 'Model 1 copy');
    assert.equal(activeModel(current).project.sites[0].params.cs.value, initial.spectra[0].models[0].project.sites[0].params.cs.value);
    await open(tabs()[0]); await act(async () => item('Rename model').click()); assert.equal(renamed, targetId);
    const stillActive = activeModel(current).id;
    await open(tabs()[0]); await act(async () => item('Remove model').click());
    assert.equal(activeModel(current).id, stillActive); assert.equal(activeSpectrum(current).models.length, 2);
    await act(async () => { tabs()[0].focus(); tabs()[0].dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true })); });
    await act(async () => document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })));
    assert.equal(document.activeElement, item('Rename model'));
    await act(async () => document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    assert.equal(document.querySelector('[role=menu]'), null); assert.equal(document.activeElement, tabs()[0]);
    await open(tabs()[0]); await act(async () => document.body.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true })));
    assert.equal(document.querySelector('[role=menu]'), null);
    const beforeDelete = activeModel(current).id;
    const inactive = activeSpectrum(current).models.find(m => m.id !== beforeDelete)!;
    await act(async () => document.querySelector<HTMLButtonElement>(`[aria-label="Rename model: ${inactive.name}"]`)!.click());
    assert.equal(renamed, inactive.id);
    await act(async () => document.querySelector<HTMLButtonElement>(`[aria-label="Delete model: ${inactive.name}"]`)!.click());
    assert.equal(activeModel(current).id, beforeDelete);
    assert.equal(activeSpectrum(current).models.length, 1);
    assert.equal(document.querySelector<HTMLButtonElement>('.row-trash')!.disabled, true);
    await act(async () => root.render(<Harness key="single" start={initial}/>));
    await open(tabs()[0]); assert.equal(item('Remove model').disabled, true);
    await act(async () => root.render(<Harness key="disabled" start={initial} disabled/>));
    await open(tabs()[0]); assert.equal(document.querySelector('[role=menu]'), null);
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});
