import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { VersionIndicator } from '../src/VersionIndicator';
import type { BuildInfo } from '../src/version';
import { changelog } from '../src/changelog';
import { readFileSync } from 'node:fs';

const current = 'a'.repeat(40), newer = 'b'.repeat(40);
const build: BuildInfo = { application: 'MossA 2 preview', version: '2.0.0-preview.1', commit: current, branch: 'mossa2', builtAt: '2026-11-06T12:00:00Z', channel: 'github-pages', dirty: false };

test('version opens changelog, retains build identity, and only reloads through the explicit update action', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://cprescher.github.io/MossA/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  // jsdom does not implement native modal dialogs. Real close/focus behavior is checked in the browser.
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  const originalFetch = globalThis.fetch;
  const container = document.getElementById('root')!, root = createRoot(container);
  let latest = current, fail = false, invalid = false, requests = 0, reloads = 0;
  globalThis.fetch = (async (url: URL, options: RequestInit) => {
    requests++;
    assert.equal(url.pathname, '/MossA/build-info.json');
    assert.ok(url.searchParams.has('check'));
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal);
    if (fail) throw new Error('Offline');
    return { ok: true, json: async () => invalid ? { commit: newer } : { application: 'MossA 2 preview', commit: latest } };
  }) as typeof fetch;
  const button = () => container.querySelector('.version-button') as HTMLButtonElement;
  const checkButton = () => Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Check for updates')!;
  try {
    await act(async () => root.render(<VersionIndicator build={build} reload={() => reloads++}/>));
    assert.match(button().title, /Latest deployed version/);
    assert.match(button().textContent!, /v2.0.0-preview.1 · aaaaaaa/);
    await act(async () => button().click());
    assert.equal(container.querySelector('dialog')!.open, true);
    assert.equal(button().getAttribute('aria-expanded'), 'true');
    assert.match(container.querySelector('dialog')!.textContent!, /What’s new in MossA 2/);
    assert.match(container.querySelector('dialog')!.textContent!, /Click the version to see what changed/);
    assert.equal(changelog[0].version, JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
    latest = newer;
    await act(async () => window.dispatchEvent(new dom.window.Event('focus')));
    assert.match(button().textContent!, /Update available/);
    assert.match(button().textContent!, /aaaaaaa/);
    assert.doesNotMatch(button().textContent!, /bbbbbbb/);
    assert.equal(reloads, 0);
    await act(async () => button().click());
    assert.equal(reloads, 0, 'opening release notes must not reload, even if an update is available');
    const reloadButton = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Reload to update')!;
    await act(async () => reloadButton.click());
    assert.equal(reloads, 1);
    // Metadata failures must not claim the app is current or lose its identity.
    fail = true;
    await act(async () => window.dispatchEvent(new dom.window.Event('focus')));
    assert.match(button().title, /Could not check/);
    assert.match(button().textContent!, /aaaaaaa/);
    fail = false; invalid = true;
    await act(async () => checkButton().click());
    assert.match(button().title, /Could not check/);
    invalid = false; latest = current;
    await act(async () => checkButton().click());
    assert.match(button().title, /Latest deployed version/);
    await act(async () => {
      container.querySelector('dialog')!.open = false;
      container.querySelector('dialog')!.dispatchEvent(new dom.window.Event('close'));
    });
    assert.equal(button().getAttribute('aria-expanded'), 'false');
    const previousRequests = requests;
    await act(async () => root.render(<VersionIndicator build={{ ...build, channel: 'local', dirty: true }}/>));
    assert.equal(checkButton(), undefined);
    assert.match(button().textContent!, /modified.*local/);
    await act(async () => button().click());
    assert.equal(container.querySelector('dialog')!.open, true, 'local and offline users can also read release notes');
    await act(async () => window.dispatchEvent(new dom.window.Event('focus')));
    assert.equal(requests, previousRequests);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    dom.window.close();
  }
});
