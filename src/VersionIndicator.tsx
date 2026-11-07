import { useCallback, useEffect, useRef, useState } from 'react';
import { buildInfo, latestDeployment, type BuildInfo } from './version';
import { changelog } from './changelog';

type Status = 'checking' | 'current' | 'update' | 'unavailable';

export function VersionIndicator({ build = buildInfo, reload = () => window.location.reload() }: { build?: BuildInfo; reload?: () => void }) {
  const deployed = build.channel === 'github-pages' && !!build.commit && !build.dirty;
  const [status, setStatus] = useState<Status>('checking');
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const check = useCallback(async () => {
    if (!deployed || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    setStatus('checking');
    try {
      const commit = await latestDeployment(controller.signal);
      if (alive.current && !controller.signal.aborted) setStatus(commit === build.commit ? 'current' : 'update');
    } catch {
      if (alive.current && pending.current === controller) setStatus('unavailable');
    } finally {
      clearTimeout(timeout);
      if (pending.current === controller) pending.current = null;
    }
  }, [build.commit, deployed]);
  useEffect(() => {
    alive.current = true;
    void check();
    const visibleCheck = () => { if (document.visibilityState === 'visible') void check(); };
    const timer = deployed ? setInterval(visibleCheck, 5 * 60 * 1000) : undefined;
    window.addEventListener('focus', visibleCheck);
    document.addEventListener('visibilitychange', visibleCheck);
    return () => {
      alive.current = false;
      pending.current?.abort();
      pending.current = null;
      clearInterval(timer);
      window.removeEventListener('focus', visibleCheck);
      document.removeEventListener('visibilitychange', visibleCheck);
    };
  }, [check, deployed]);

  const label = `v${build.version} · ${build.commit?.slice(0, 7) ?? 'unknown'}${build.dirty ? ' (modified)' : ''}`;
  const desktop = build.channel === 'desktop';
  const message = desktop ? 'Offline desktop app' : !deployed ? 'Local build' : status === 'current' ? 'Latest deployed version' : status === 'update' ? 'Update available' : status === 'unavailable' ? 'Could not check for updates' : 'Checking latest deployment…';
  const title = `${label}\n${build.builtAt ? `Built ${build.builtAt}\n` : ''}${message} — click for changelog`;
  return <div className={`version-indicator ${deployed ? status : 'local'}`}>
    <button className="version-button" title={title} aria-label={`${label}. ${message}. Open changelog`} aria-haspopup="dialog" aria-expanded={open} onClick={() => { dialog.current?.showModal(); setOpen(true); void check(); }}>
      <span className="version-dot" aria-hidden="true"/>{label}{!deployed && (desktop ? ' · desktop' : ' · local')}{deployed && status === 'update' && <strong>Update available ↻</strong>}
    </button>
    <dialog className="changelog-dialog" ref={dialog} aria-labelledby="changelog-heading" onClose={() => setOpen(false)} onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}>
      <div className="changelog-heading"><h2 id="changelog-heading">What’s new in MossA 2</h2><form method="dialog"><button aria-label="Close changelog">×</button></form></div>
      <p className="changelog-build" title={build.builtAt ? `Built ${build.builtAt}` : undefined}>Running {label}{!deployed && (desktop ? ' · desktop' : ' · local')}</p>
      <div className="changelog-entries">{changelog.map(entry => <section key={entry.version}>
        <h3>v{entry.version}<time dateTime={entry.date}>{entry.date}</time></h3>
        <ul>{entry.changes.map(change => <li key={change}>{change}</li>)}</ul>
      </section>)}</div>
      <div className="changelog-footer"><span role="status">{message}</span>{deployed && <div className="changelog-actions">
        <button disabled={status === 'checking'} onClick={() => void check()}>Check for updates</button>
        {status === 'update' && <button className="changelog-reload" onClick={reload}>Reload to update</button>}
      </div>}<a href="https://github.com/CPrescher/MossA/commits/main/" target="_blank" rel="noreferrer">Full history on GitHub ↗</a></div>
    </dialog>
    <span className="version-announcement" role="status">{deployed && status === 'update' ? 'A newer MossA 2 version is available. Open the changelog to reload when ready.' : ''}</span>
  </div>;
}
