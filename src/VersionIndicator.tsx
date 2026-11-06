import { useCallback, useEffect, useRef, useState } from 'react';
import { buildInfo, latestDeployment, type BuildInfo } from './version';

type Status = 'checking' | 'current' | 'update' | 'unavailable';

export function VersionIndicator({ build = buildInfo, reload = () => window.location.reload() }: { build?: BuildInfo; reload?: () => void }) {
  const deployed = build.channel === 'github-pages' && !!build.commit && !build.dirty;
  const [status, setStatus] = useState<Status>('checking');
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
  const message = !deployed ? 'Local build' : status === 'current' ? 'Latest deployed version' : status === 'update' ? 'Update available — reload to update' : status === 'unavailable' ? 'Could not check for updates — click to retry' : 'Checking latest deployment…';
  const title = `${label}\n${build.builtAt ? `Built ${build.builtAt}\n` : ''}${message}${deployed && status === 'current' ? ' — click to check again' : ''}`;
  return <div className={`version-indicator ${deployed ? status : 'local'}`}>
    {deployed ? <button className="version-button" title={title} aria-label={`${label}. ${message}`} onClick={() => status === 'update' ? reload() : void check()}>
      <span className="version-dot" aria-hidden="true"/>{label}{status === 'update' && <strong>Update available ↻</strong>}
    </button> : <span className="version-local" title={title}>{label} · local</span>}
    <span className="version-announcement" role="status">{deployed && status === 'update' ? 'A newer MossA 2 version is available. Use the version button to reload when ready.' : ''}</span>
  </div>;
}
