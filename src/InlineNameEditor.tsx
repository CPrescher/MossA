import { useLayoutEffect, useRef, useState } from 'react';

export function InlineNameEditor({ name, label, rowId, maxLength = 160, onCommit, onCancel }: {
  name: string; label: string; rowId: string; maxLength?: number; onCommit: (name: string) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState(name), input = useRef<HTMLInputElement>(null), finished = useRef(false);
  useLayoutEffect(() => {
    input.current?.scrollIntoView?.({ block: 'nearest' });
    input.current?.focus({ preventScroll: true }); input.current?.select();
  }, []);
  return <input ref={input} className="inline-name-input" data-return-focus={rowId} aria-label={label} maxLength={maxLength} value={draft} onChange={e => setDraft(e.target.value)}
    onBlur={() => { if (finished.current) return; finished.current = true; const name = draft.trim(); if (name) onCommit(name); else onCancel(); }}
    onKeyDown={e => {
      if (!((e.metaKey || e.ctrlKey) && ['s','o'].includes(e.key.toLowerCase()))) e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); queueMicrotask(() => document.getElementById(rowId)?.focus()); }
      if (e.key === 'Escape') { e.preventDefault(); finished.current = true; onCancel(); queueMicrotask(() => document.getElementById(rowId)?.focus()); }
    }}/>;
}
