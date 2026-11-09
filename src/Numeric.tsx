import { createContext,useContext,type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react';

const NumericContext=createContext('');
/** Reset only local text drafts when an editor changes document/model/site. */
export function NumericScope({scopeKey,children}:{scopeKey:string;children:ReactNode}) {return <NumericContext.Provider value={scopeKey}>{children}</NumericContext.Provider>;}

export function displayNumber(value: number | null) {
  return value === null ? '' : String(Number(value.toPrecision(5)));
}

function normalizedNumericText(text:string) {
 const minus=text.replaceAll('−','-');
 if(/^[-+]?\d{1,3},\d{3}$/.test(minus)&&Number(minus.split(',')[0])!==0)return minus;
 const normalized=/^[-+]?(?:\d+,\d*|,\d+)(?:[eE][-+]?\d+)?$/.test(minus)?minus.replace(',','.'):minus;
 return normalized;
}

export function parseNumericText(text:string) {return Number(normalizedNumericText(text));}
export function numericInputError(text:string) {
 const plain=text.trim().replaceAll('−','-');
 return /^[-+]?\d{1,3},\d{3}$/.test(plain)&&Number(plain.split(',')[0])!==0?`Ambiguous comma: use ${plain.replace(',','.')} or ${plain.replace(',','')}.`:'Enter a finite number, such as 1.5 or 1,5. Escape cancels the edit.';
}

export function Numeric({ value, onChange, label, nullable = false, disabled = false }: { value: number | null; onChange: (v: number | null) => void; label: string; nullable?: boolean; disabled?: boolean }) {
  const errorId = useId(),scope=useContext(NumericContext);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [bad, setBad] = useState(false);
  const dirty = useRef(false),field=useRef<HTMLInputElement>(null),selectAfterCommit=useRef(false);
  useLayoutEffect(()=>{if(selectAfterCommit.current){selectAfterCommit.current=false;if(document.activeElement===field.current)field.current?.select();}});
  useLayoutEffect(() => { setEditing(false); setBad(false); dirty.current = false; setDraft(displayNumber(value)); }, [value,scope]);
  const commit = () => {
    if (!dirty.current) { setEditing(false); setBad(false); return true; }
    const text = draft.trim(), next = !text && nullable ? null : parseNumericText(text);
    if ((!text && !nullable) || (next !== null && !Number.isFinite(next))) { setBad(true); return false; }
    dirty.current = false; setBad(false); setEditing(false);
    if (normalizedNumericText(text) === displayNumber(value)) return true;
    if (next !== value) onChange(next);
    return true;
  };
  return <><input ref={field} type="text" inputMode="text" autoCapitalize="off" autoCorrect="off" spellCheck={false} aria-label={label} title={bad ? numericInputError(draft) : `${label}${value === null ? '' : `: ${value}`}`} aria-invalid={bad} aria-describedby={bad ? errorId : undefined} className={bad ? 'number invalid' : 'number'} value={editing || bad ? draft : displayNumber(value)}
    onFocus={() => { if (!bad) setDraft(displayNumber(value)); dirty.current = bad; setEditing(true); }}
    onChange={e => { dirty.current = true; setEditing(true);setDraft(e.target.value); }} onBlur={commit}
    onKeyDown={e => {
      if(e.key==='Enter'&&!e.metaKey&&!e.ctrlKey&&!e.altKey){e.preventDefault();selectAfterCommit.current=!e.shiftKey;if(!commit()){selectAfterCommit.current=false;return;}if(e.shiftKey){const scope=e.currentTarget.closest('.site-editor,.options-content,.option-section,dialog')??e.currentTarget.form??document;const fields=Array.from(scope.querySelectorAll<HTMLInputElement>('input.number:not(:disabled)')).filter(field=>field.getClientRects().length>0),next=fields[fields.indexOf(e.currentTarget)+1];if(next){next.focus();next.select();}}else e.currentTarget.select();}
      if (e.key === 'Escape'&&(editing||bad||dirty.current)) { e.preventDefault();e.stopPropagation();dirty.current = false;setDraft(displayNumber(value));setBad(false);setEditing(false);e.currentTarget.select(); }
    }} disabled={disabled}/>{bad && <span id={errorId} className="visually-hidden">{numericInputError(draft)}</span>}</>;
}
