import { test } from 'node:test';
import assert from 'node:assert/strict';

// Each node:test file runs in its own process. Set the build channel before the
// storage modules initialize, as Vite does for a real preview bundle.
(globalThis as any).__MOSSA_BUILD__ = { channel: 'github-pages-preview' };
const { readSession } = await import('../src/session');
const { readWorkspaceSession, writeWorkspaceSession } = await import('../src/workspaceStorage');
const { freshWorkspace } = await import('../src/workspace');
const { defaultLayout } = await import('../src/session');

test('preview autosave and legacy migration never read or replace stable projects', async () => {
  const values = new Map([['mossa.session.v1', 'stable legacy project'], ['mossa.workspace.v1', 'stable project journal']]);
  const accessed: string[] = [];
  (globalThis as any).localStorage = {
    getItem(key: string) { accessed.push(key); return values.get(key) ?? null; },
    setItem(key: string, value: string) { accessed.push(key); values.set(key, value); },
    removeItem(key: string) { accessed.push(key); values.delete(key); },
  };
  (globalThis as any).indexedDB = undefined;
  assert.equal(readSession().session, null);
  assert.equal((await readWorkspaceSession()).session, null);
  const workspace = freshWorkspace();
  workspace.name = 'Preview experiment';
  assert.equal(await writeWorkspaceSession({ version: 1, workspace, layout: defaultLayout }), true);
  assert.equal((await readWorkspaceSession()).session?.workspace.name, 'Preview experiment');
  assert.equal(values.get('mossa.workspace.v1'), 'stable project journal');
  assert.equal(values.get('mossa.session.v1'), 'stable legacy project');
  assert.ok(accessed.every(key => key.startsWith('mossa.preview.')));
  values.delete('mossa.preview.mossa.workspace.v1');
  const databases: string[] = [];
  (globalThis as any).indexedDB = { open(name: string) {
    databases.push(name);
    const request: any = { error: new Error('Test database unavailable') };
    queueMicrotask(() => request.onerror());
    return request;
  } };
  await readWorkspaceSession();
  assert.deepEqual(databases, ['mossa.preview.mossa-projects']);
});
