import { useEffect, useRef, useState } from 'react';
import type { Site } from './types';

export function AddSiteMenu({ disabled, kind, profile, onKind, onProfile, onDefine, onAdd }: { disabled: boolean; kind: Site['kind']; profile: Site['profile']; onKind: (kind: Site['kind']) => void; onProfile: (profile: Site['profile']) => void; onDefine: () => void; onAdd?: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), first = useRef<HTMLSelectElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div className="add-site-control" ref={root} onBlur={e => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); trigger.current?.focus(); } }}>
    <button ref={trigger} title="Open New site to choose Site type and Line profile" aria-label="Add site" aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={() => setOpen(v => !v)}>＋ Add</button>
    {open && <div className="add-site-popover" role="dialog" aria-label="New site">
      <label className="stack-label">Site type<select ref={first} aria-label="New site type" value={kind} onChange={e => onKind(e.target.value as Site['kind'])}>{['Singlet','Doublet','Sextet'].map(v => <option key={v}>{v}</option>)}</select></label>
      <label className="stack-label">Line profile<select aria-label="New line profile" value={profile} onChange={e => onProfile(e.target.value as Site['profile'])}>{['Lorentzian','Gaussian','PseudoVoigt','LorSquared'].map(v => <option key={v}>{v}</option>)}</select></label>
      {onAdd && <><button className="add-site-numerically" onClick={() => { setOpen(false); onAdd(); }}>Add with starting values</button><p className="add-site-note">Edit the parameters, then fit. Graph picking is optional.</p></>}
      <button className="define-new-site" onClick={() => { setOpen(false); onDefine(); }}>Define on graph</button>
    </div>}
  </div>;
}
