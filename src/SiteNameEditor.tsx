import { useEffect, useId, useRef, useState } from 'react';
import { ScientificLabel } from './ScientificLabel';
import { scientificLabel } from './scientific-label';

const examples = ['Fe$^{2+}$', 'Fe$^{3+}$', '$\\alpha$-Fe', 'High-spin Fe$^{2+}$', '$d_{x^2-y^2}$'];
export function SiteNameEditor({ name, onCommit }: { name: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(name), [focused, setFocused] = useState(false), canceled = useRef(false);
  const input = useRef<HTMLInputElement>(null), helpId = useId();
  const label = scientificLabel(draft), hasMath = label.parts.some(part => part.kind === 'math');
  useEffect(() => { setDraft(name); }, [name]);
  return <div className="site-name-control">
    <label className="site-name-editor" title="Rename selected site; Enter to apply. LaTeX is supported.">
      <input ref={input} aria-label="Site name" aria-describedby={helpId} value={draft} placeholder="Site name" maxLength={240} onChange={e => setDraft(e.target.value)} onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); if (!canceled.current && draft !== name) onCommit(draft); canceled.current = false; }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } if (e.key === 'Escape') { canceled.current = true; setDraft(name); e.currentTarget.blur(); } }}/>
      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/></svg>
    </label>
    {(hasMath || focused) && <div className="site-name-preview" aria-label="Site name preview"><ScientificLabel name={draft || 'Site name'}/></div>}
    {label.error && <p className="site-name-error" role="status">{label.error} The name is shown as text.</p>}
    <details className="site-name-help"><summary>LaTeX names</summary><div id={helpId}><p>Use $…$ for math within a name. Commands and braced scripts also work directly. Click an example to edit:</p>
      {examples.map(example => <button type="button" key={example} onClick={() => { setDraft(example); input.current?.focus(); }}><code>{example}</code><ScientificLabel name={example}/></button>)}
      <p>Enter or click away to apply; Escape cancels.</p>
    </div></details>
  </div>;
}
