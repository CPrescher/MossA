import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ProjectFiles, openDesktopProject } from '../src/project-files';
import { freshWorkspace, renameEntry, useWorkspaceHistory } from '../src/workspace';

function desktop() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://tauri.localhost/' });
  const original = { window: globalThis.window, document: globalThis.document, isTauri: (globalThis as any).isTauri };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
  const calls: { command: string; args: any }[] = [];
  let answer: any = null;
  (dom.window as any).__TAURI_INTERNALS__ = { invoke: async (command: string, args: any) => {
    calls.push({ command, args }); if (answer instanceof Error) throw answer; return answer;
  } };
  return { calls, answer(value: any) { answer = value; }, close() { Object.assign(globalThis, original); dom.window.close(); } };
}

test('first Save chooses a file, later Save reuses it, and Save As selects a new current file', async () => {
  const env = desktop(), files = new ProjectFiles(), document = {};
  try {
    env.answer({ id: 'first', filename: 'first.mossa' });
    assert.equal(await files.save(document, 'Untitled.mossa', 'Fe³⁺'), true);
    assert.deepEqual(env.calls.at(-1), { command: 'save_project_file', args: { target: null, filename: 'Untitled.mossa', contents: 'Fe³⁺', saveAs: false } });
    await files.save(document, 'Renamed project.mossa', 'edited');
    assert.equal(env.calls.at(-1)!.args.target, 'first');
    env.answer({ id: 'copy', filename: 'copy.mossa' });
    await files.save(document, 'Renamed project.mossa', 'copy', true);
    assert.equal(env.calls.at(-1)!.args.target, 'first'); assert.equal(env.calls.at(-1)!.args.saveAs, true);
    await files.save(document, 'Renamed project.mossa', 'copy edited');
    assert.equal(env.calls.at(-1)!.args.target, 'copy'); assert.equal(env.calls.at(-1)!.args.saveAs, false);
  } finally { env.close(); }
});

test('canceling or failing Save As retains the current target; canceling the first Save leaves it untitled', async () => {
  const env = desktop(), files = new ProjectFiles(), document = {};
  try {
    assert.equal(await files.save(document, 'Untitled.mossa', '{}'), false);
    assert.equal(await files.save(document, 'Untitled.mossa', '{}'), false);
    assert.equal(env.calls.at(-1)!.args.target, null);
    files.opened(document, { id: 'opened', filename: 'input.mossa' });
    assert.equal(await files.save(document, 'input.mossa', '{}', true), false);
    env.answer(new Error('Disk full'));
    await assert.rejects(files.save(document, 'input.mossa', '{}', true), /Disk full/);
    env.answer({ id: 'opened', filename: 'input.mossa' });
    await files.save(document, 'input.mossa', '{}');
    assert.equal(env.calls.at(-1)!.args.target, 'opened');
  } finally { env.close(); }
});

test('Open returns a file capability that is adopted only after successful project loading', async () => {
  const env = desktop(), files = new ProjectFiles(), document = {};
  try {
    files.opened(document, { id: 'previous', filename: 'previous.mossa' });
    assert.equal(await openDesktopProject(), null);
    env.answer({ id: 'invalid', filename: 'invalid.mossa', contents: 'invalid JSON' });
    const invalid = await openDesktopProject();
    assert.throws(() => JSON.parse(invalid!.contents));
    env.answer({ id: 'previous', filename: 'previous.mossa' });
    await files.save(document, 'previous.mossa', '{}');
    assert.equal(env.calls.at(-1)!.args.target, 'previous');
    env.answer({ id: 'opened', filename: 'opened.mossa', contents: '{}' });
    const opened = await openDesktopProject(); files.opened(document, opened!);
    await files.save(document, opened!.filename, '{}');
    assert.equal(env.calls.at(-1)!.args.target, 'opened');
  } finally { env.close(); }
});

test('document identities follow Undo/Redo across New and Open without leaking into project JSON', async () => {
  const env = desktop();
  const root = createRoot(document.getElementById('root')!);
  let history: ReturnType<typeof useWorkspaceHistory>;
  function Harness() { history = useWorkspaceHistory(freshWorkspace); return null; }
  const files = new ProjectFiles();
  try {
    await act(async () => root.render(<Harness/>));
    const first = history!.document;
    files.opened(first, { id: 'first', filename: 'first.mossa' });
    await act(async () => { history!.setWorkspace(renameEntry(history!.workspace, 'project', 'Renamed')); });
    assert.equal(history!.document, first);
    await act(async () => { history!.set({ ...history!.present, selected: 0 }); });
    assert.equal(history!.document, first);
    await act(async () => { history!.setWorkspace(freshWorkspace(), true, true); });
    const second = history!.document; assert.notEqual(second, first);
    await files.save(second, 'New.mossa', '{}'); assert.equal(env.calls.at(-1)!.args.target, null);
    await act(async () => history!.undo()); assert.equal(history!.document, first);
    env.answer({ id: 'first', filename: 'first.mossa' });
    await files.save(history!.document, 'Renamed.mossa', '{}'); assert.equal(env.calls.at(-1)!.args.target, 'first');
    await act(async () => history!.redo()); assert.equal(history!.document, second);
    const reopened = structuredClone(history!.workspace);
    await act(async () => { history!.setWorkspace(reopened, true, true); });
    assert.notEqual(history!.document, second);
    assert.deepEqual(Object.keys(history!.workspace).sort(), Object.keys(freshWorkspace()).sort());
    assert.ok(!JSON.stringify(history!.workspace).includes('project-file-'));
  } finally { await act(async () => root.unmount()); env.close(); }
});
