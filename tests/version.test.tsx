import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { VersionIndicator } from '../src/VersionIndicator';
import type { BuildInfo } from '../src/version';

const current = 'a'.repeat(40), newer = 'b'.repeat(40);
const build: BuildInfo = { application: 'MossA 2 preview', version: '2.0.0-preview.1', commit: current, branch: 'mossa2', builtAt: '2026-11-06T12:00:00Z', channel: 'github-pages', dirty: false };

test('version identifies the running bundle, detects deployments, and only reloads on request', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://cprescher.github.io/MossA/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
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
  const button = () => container.querySelector('button')!;
  try {
    await act(async () => root.render(<VersionIndicator build={build} reload={() => reloads++}/>));
    assert.match(button().title, /Latest deployed version/);
    assert.match(button().textContent!, /v2.0.0-preview.1 · aaaaaaa/);
    latest = newer;
    await act(async () => window.dispatchEvent(new dom.window.Event('focus')));
    assert.match(button().textContent!, /Update available/);
    assert.match(button().textContent!, /aaaaaaa/);
    assert.doesNotMatch(button().textContent!, /bbbbbbb/);
    assert.equal(reloads, 0);
    await act(async () => button().click());
    assert.equal(reloads, 1);
    // Metadata failures must not claim the app is current or lose its identity.
    fail = true;
    await act(async () => window.dispatchEvent(new dom.window.Event('focus')));
    assert.match(button().title, /Could not check/);
    assert.match(button().textContent!, /aaaaaaa/);
    fail = false; invalid = true;
    await act(async () => button().click());
    assert.match(button().title, /Could not check/);
    invalid = false; latest = current;
    await act(async () => button().click());
    assert.match(button().title, /Latest deployed version/);
    const previousRequests = requests;
    await act(async () => root.render(<VersionIndicator build={{ ...build, channel: 'local', dirty: true }}/>));
    assert.equal(container.querySelector('button'), null);
    assert.match(container.textContent!, /modified.*local/);
    await act(async () => window.dispatchEvent(new dom.window.Event('focus')));
    assert.equal(requests, previousRequests);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    dom.window.close();
  }
});
