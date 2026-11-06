import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { writeSession, type Session } from './session';

export function useAutosave(session: Session, enabled = true) {
  const latest = useRef(session), active = useRef(enabled);
  latest.current = session; active.current = enabled;
  const [error, setError] = useState('');
  const save = () => { if (active.current) setError(writeSession(latest.current) ? '' : 'Local autosave is unavailable. Use Save project to keep your work.'); };
  useEffect(() => { const timer = setTimeout(save, 200); return () => clearTimeout(timer); }, [session.snapshot,session.layout,session.fit,session.elapsed,enabled]);
  useEffect(() => {
    const leaving = () => { flushSync(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); }); save(); };
    const hidden = () => { if (document.visibilityState === 'hidden') leaving(); };
    window.addEventListener('pagehide',leaving); window.addEventListener('beforeunload',leaving); document.addEventListener('visibilitychange',hidden);
    return () => { window.removeEventListener('pagehide',leaving); window.removeEventListener('beforeunload',leaving); document.removeEventListener('visibilitychange',hidden); };
  }, []);
  return error;
}
