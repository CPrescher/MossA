import { useEffect, useRef, useState } from 'react';
export function SiteNameEditor({ name, onCommit }: { name: string; onCommit: (name: string) => void }) {
  const [draft,setDraft] = useState(name), canceled = useRef(false);
  useEffect(() => { setDraft(name); }, [name]);
  return <label className="site-name-editor" title="Rename selected site; Enter to apply">
    <input aria-label="Site name" value={draft} placeholder="Site name" maxLength={80} onChange={e => setDraft(e.target.value)}
      onBlur={() => { if (!canceled.current && draft !== name) onCommit(draft); canceled.current = false; }}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } if (e.key === 'Escape') { canceled.current = true; setDraft(name); e.currentTarget.blur(); } }}/>
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/></svg>
  </label>;
}
