import { useLayoutEffect, useRef, useState } from 'react';

export function InlineNameEditor({ name, label, rowId, onCommit, onCancel }: {
  name: string; label: string; rowId: string; onCommit: (name: string) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState(name), input = useRef<HTMLInputElement>(null), finished = useRef(false);
  useLayoutEffect(() => {
    input.current?.scrollIntoView?.({ block: 'nearest' });
    input.current?.focus({ preventScroll: true }); input.current?.select();
  }, []);
  return <input ref={input} className="inline-name-input" aria-label={label} maxLength={160} value={draft} onChange={e => setDraft(e.target.value)}
    onBlur={() => { if (finished.current) return; finished.current = true; const name = draft.trim(); if (name) onCommit(name); else onCancel(); }}
    onKeyDown={e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); queueMicrotask(() => document.getElementById(rowId)?.focus()); }
      if (e.key === 'Escape') { e.preventDefault(); finished.current = true; onCancel(); queueMicrotask(() => document.getElementById(rowId)?.focus()); }
    }}/>;
}
