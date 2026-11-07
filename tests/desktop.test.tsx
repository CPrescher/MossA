import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { saveBlob, saveText } from '../src/file-save';

test('MSI numeric package version tracks the displayed application version', () => {
  const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version as string;
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-preview\.(\d+))?$/);
  assert.ok(match, 'Update the MSI mapping when introducing a different prerelease convention');
  const fields = match.slice(1).filter(value => value !== undefined);
  fields.forEach((value, index) => assert.ok(Number(value) <= (index < 2 ? 255 : 65535)));
  const config = JSON.parse(readFileSync(new URL('../src-tauri/tauri.windows.conf.json', import.meta.url), 'utf8'));
  assert.equal(config.bundle.windows.wix.version, fields.join('.'));
});

test('native exports preserve binary bytes and propagate cancellation and write failures', async () => {
  const dom = new JSDOM('', { url: 'https://tauri.localhost/' });
  const originalWindow = globalThis.window;
  const originalFlag = (globalThis as any).isTauri;
  Object.assign(globalThis, { window: dom.window, isTauri: true });
  const calls: any[] = [];
  let saved = true, failure = false;
  (dom.window as any).__TAURI_INTERNALS__ = { invoke: async (command: string, args: unknown) => {
    calls.push({ command, args });
    if (failure) throw new Error('Disk full');
    return saved;
  } };
  try {
    assert.equal(await saveBlob(new Blob([new Uint8Array([0, 127, 128, 255])]), 'spectrum.png'), true);
    assert.deepEqual(calls[0], { command: 'save_file', args: { filename: 'spectrum.png', data: [0, 127, 128, 255] } });
    saved = false;
    assert.equal(await saveText('project.mossa', 'Fe³⁺', 'application/json'), false);
    assert.deepEqual(calls[1].args.data, Array.from(new TextEncoder().encode('Fe³⁺')));
    failure = true;
    await assert.rejects(saveText('project.mossa', '{}', 'application/json'), /Disk full/);
  } finally {
    Object.assign(globalThis, { window: originalWindow, isTauri: originalFlag });
    dom.window.close();
  }
});

test('desktop links open local documentation and save tutorials without contacting the hosted site', async () => {
  for (const base of ['tauri://localhost/', 'http://tauri.localhost/']) {
    const dom = new JSDOM('<a id="manual" href="./manual/" target="_blank">Manual</a><a id="hosted" href="https://cprescher.github.io/MossA/manual/guides/importing-data/">Guide</a><a id="external" href="https://example.org/">Paper</a><a id="legal" href="./LICENSE.txt" target="_blank">License</a><a id="tutorial" href="/MossA/manual/tutorial-data/test.mossa">Example</a><a id="app" href="https://cprescher.github.io/MossA/">App</a>', { url: base, runScripts: 'outside-only' });
    const calls: any[] = [], requests: string[] = [], errors: string[] = [];
    (dom.window as any).__TAURI__ = { core: { invoke: async (command: string, args: unknown) => { calls.push({ command, args }); return false; } } };
    (dom.window as any).fetch = async (url: URL) => { requests.push(url.href); return { ok: true, arrayBuffer: async () => new Uint8Array([0, 255]).buffer }; };
    dom.window.alert = message => errors.push(String(message));
    dom.window.eval(readFileSync(new URL('../src-tauri/desktop-bridge.js', import.meta.url), 'utf8'));
    try {
      for (const id of ['manual', 'hosted', 'external', 'legal', 'tutorial', 'app']) (dom.window.document.getElementById(id) as HTMLAnchorElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));
      assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
        { command: 'open_document', args: { path: 'MossA/manual/' } },
        { command: 'open_document', args: { path: 'MossA/manual/guides/importing-data/' } },
        { command: 'open_external', args: { url: 'https://example.org/' } },
        { command: 'open_document', args: { path: 'LICENSE.txt' } },
        { command: 'focus_main' },
        { command: 'save_file', args: { filename: 'test.mossa', data: [0, 255] } },
      ]);
      assert.deepEqual(requests, [new URL('/MossA/manual/tutorial-data/test.mossa', base).href]);
      assert.deepEqual(errors, [], 'canceling a tutorial Save As is not an error');
    } finally { dom.window.close(); }
  }
});
