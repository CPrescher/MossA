import { useEffect, useRef, useState } from 'react';

export function displayNumber(value: number | null) {
  return value === null ? '' : String(Number(value.toPrecision(5)));
}

export function Numeric({ value, onChange, label, nullable = false, disabled = false }: { value: number | null; onChange: (v: number | null) => void; label: string; nullable?: boolean; disabled?: boolean }) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [bad, setBad] = useState(false);
  const dirty = useRef(false);
  useEffect(() => { setEditing(false); setBad(false); dirty.current = false; setDraft(value === null ? '' : String(value)); }, [value]);
  const commit = () => {
    if (!dirty.current) { setEditing(false); setBad(false); return; }
    const text = draft.trim(), next = !text && nullable ? null : Number(text);
    if ((!text && !nullable) || (next !== null && !Number.isFinite(next))) { setBad(true); return; }
    dirty.current = false; setBad(false); setEditing(false);
    if (next !== value) onChange(next);
  };
  return <input type="text" inputMode="decimal" aria-label={label} title={bad ? 'Enter a finite number.' : `${label}${value === null ? '' : `: ${value}`}`} aria-invalid={bad} className={bad ? 'number invalid' : 'number'} value={editing || bad ? draft : displayNumber(value)}
    onFocus={() => { if (!bad) setDraft(value === null ? '' : String(value)); dirty.current = bad; setEditing(true); }}
    onChange={e => { dirty.current = true; setDraft(e.target.value); }} onBlur={commit}
    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { dirty.current = false; setBad(false); setEditing(false); e.currentTarget.blur(); } }} disabled={disabled}/>;
}
