import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { decodeWorkspace, modelSnapshot, type Workspace } from './workspace';
import { decodeSession, defaultLayout, snapshotVersion, type Layout } from './session';

export type WorkspaceSession = { version: 1 | 2; workspace: Workspace; layout: Layout };
export const workspaceSessionVersion = (workspace: Workspace): 1 | 2 => workspace.spectra.some(s => s.velocityReversed) ? 2 : 1;
const DATABASE = 'mossa-projects', KEY = 'current', FALLBACK_KEY = 'mossa.workspace.v1';

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('Browser database unavailable.')); return; }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sessions');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Browser database is blocked.'));
  });
}
async function databaseRead() {
  const db = await database();
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction('sessions').objectStore('sessions').get(KEY);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
async function databaseWrite(value: WorkspaceSession) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('sessions', 'readwrite');
      transaction.objectStore('sessions').put(value, KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
export function decodeWorkspaceSession(value: unknown): WorkspaceSession {
  const session = value as WorkspaceSession;
  if (![1,2].includes(session?.version)) throw new Error('Unsupported local project version.');
  const workspace = decodeWorkspace(session.workspace);
  if (session.version === 1 && workspaceSessionVersion(workspace) === 2) throw new Error('Reversed velocities require local project version 2.');
  // Apply the existing layout validation without creating another schema.
  const s = workspace.spectra[0], m = s.models[0];
  const snapshot = modelSnapshot(s, m);
  const layout = decodeSession(JSON.stringify({ version: snapshotVersion(snapshot), snapshot, layout: session.layout ?? defaultLayout, fit: null, elapsed: null }), true).layout;
  return { version: workspaceSessionVersion(workspace), workspace, layout };
}

export async function readWorkspaceSession(): Promise<{ session: WorkspaceSession | null; error: string }> {
  try {
    // A synchronous fallback is also a small journal for the final blur/close
    // event. Prefer it if present; normal database saves remove it on success.
    let journal: string | null = null;
    try { journal = localStorage.getItem(FALLBACK_KEY); } catch { /* Database can still work. */ }
    if (journal) return { session: decodeWorkspaceSession(JSON.parse(journal)), error: '' };
    let stored: unknown;
    try { stored = await databaseRead(); }
    catch { if (globalThis.indexedDB) return { session: null, error: 'The browser project database could not be read. Open a saved project to recover it.' }; stored = null; }
    return { session: stored ? decodeWorkspaceSession(stored) : null, error: '' };
  } catch { return { session: null, error: 'The previous project could not be restored. Open a saved project to recover it.' }; }
}

// Serialize writes so an older completion cannot replace a newer session.
let pending = Promise.resolve();
let issued = 0;
export function writeWorkspaceSession(session: WorkspaceSession): Promise<boolean> {
  session = { ...session, version: workspaceSessionVersion(session.workspace) };
  const token = ++issued;
  const write = async () => {
    try { await databaseWrite(session); if (token === issued) { try { localStorage.removeItem(FALLBACK_KEY); } catch { /* Optional journal. */ } } return true; }
    catch { try { localStorage.setItem(FALLBACK_KEY, JSON.stringify(session)); return true; } catch { return false; } }
  };
  const result = pending.then(write, write);
  pending = result.then(() => {});
  return result;
}
export function useWorkspaceAutosave(session: WorkspaceSession, enabled: boolean) {
  const latest = useRef(session), active = useRef(enabled), generation = useRef(0);
  latest.current = { ...session, version: workspaceSessionVersion(session.workspace) }; active.current = enabled;
  const [error, setError] = useState('');
  const save = () => {
    if (!active.current) return;
    const token = ++generation.current;
    void writeWorkspaceSession(latest.current).then(ok => {
      if (token === generation.current) setError(ok ? '' : 'Local autosave is unavailable. Use Save project to keep all spectra and models.');
    });
  };
  useEffect(() => { const timer = setTimeout(save, 200); return () => clearTimeout(timer); }, [session.workspace, session.layout, enabled]);
  useEffect(() => {
    const leaving = () => {
      flushSync(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
      if (!active.current) return;
      try { localStorage.setItem(FALLBACK_KEY, JSON.stringify(latest.current)); } catch { /* Larger projects use the database. */ }
      save();
    };
    const hidden = () => { if (document.visibilityState === 'hidden') leaving(); };
    window.addEventListener('pagehide', leaving); window.addEventListener('beforeunload', leaving); document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('pagehide', leaving); window.removeEventListener('beforeunload', leaving); document.removeEventListener('visibilitychange', hidden); };
  }, []);
  return error;
}

