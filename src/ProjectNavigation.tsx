import { ItemList, ItemListName, ItemListNumber, ItemListRow } from './ItemList';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { activeModel, activeSpectrum, type ModelEntry, type Workspace } from './workspace';
import { InlineNameEditor } from './InlineNameEditor';
import { RowActions } from './RowActions';

type RenameKind = 'project' | 'spectrum' | 'model';
export function FitDot({ model }: { model: ModelEntry }) {
  const state = !model.fit ? 'unfitted' : !model.fit.converged || model.fit.warnings.length ? 'warning' : 'fitted';
  return <span className={`fit-dot ${state}`} title={state === 'unfitted' ? 'Not fitted' : state === 'warning' ? 'Fit needs review' : 'Fitted'} />;
}
export function useOutsideClose(ref: React.RefObject<HTMLDivElement | null>, close: () => void) {
  useEffect(() => {
    const pointer = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', pointer); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', pointer); document.removeEventListener('keydown', key); };
  }, [close]);
}
export function RenameDialog({ kind, name, onSave, onClose }: { kind: RenameKind; name: string; onSave: (name: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), [draft, setDraft] = useState(name);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="rename-dialog" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <form onSubmit={e => { e.preventDefault(); if (draft.trim()) { onSave(draft); onClose(); } }}>
      <h2>Rename {kind}</h2><label className="stack-label">Name<input autoFocus aria-label={`${kind} name`} maxLength={160} value={draft} onFocus={e => e.target.select()} onChange={e => setDraft(e.target.value)}/></label>
      <div className="rename-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit" disabled={!draft.trim()}>Save name</button></div>
    </form>
  </dialog>;
}
type ModelMenuTarget = { id: string; x: number; y: number; trigger: HTMLButtonElement };
function ModelContextMenu({ target, model, canDuplicate, canRemove, onClose, onAction }: {
  target: ModelMenuTarget; model: ModelEntry; canDuplicate: boolean; canRemove: boolean;
  onClose: () => void; onAction: (action: 'duplicate' | 'rename' | 'remove', id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClose(ref, onClose);
  useLayoutEffect(() => {
    const menu = ref.current!;
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(target.x, window.innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(target.y, window.innerHeight - bounds.height - 8))}px`;
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [target]);
  return createPortal(<div ref={ref} className="model-context-menu" role="menu" aria-label={`Actions for ${model.name}`} style={{ left: target.x, top: target.y }} onContextMenu={e => e.preventDefault()} onKeyDown={e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); target.trigger.focus(); return; }
    const buttons = Array.from(ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? (index + 1) % buttons.length : e.key === 'ArrowUp' ? (index - 1 + buttons.length) % buttons.length : e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : null;
    if (next !== null) { e.preventDefault(); buttons[next]?.focus(); }
    if (e.key === 'Tab') onClose();
  }}>
    <div className="model-context-title">{model.name}</div>
    <button role="menuitem" tabIndex={-1} disabled={!canDuplicate} onClick={() => onAction('duplicate', model.id)}>Duplicate model</button>
    <button role="menuitem" tabIndex={-1} onClick={() => onAction('rename', model.id)}>Rename model</button>
    <div className="model-context-divider" role="separator"/>
    <button role="menuitem" tabIndex={-1} className="remove-model" disabled={!canRemove} onClick={() => onAction('remove', model.id)}>Remove model</button>
    <p>{canRemove ? 'Removal can be undone.' : 'Keep at least one model per spectrum.'}</p>
  </div>, document.body);
}

export function ModelNavigation({ workspace, disabled, onSelect, onDuplicate, onNew, onRename, onRemove, onCompare, renamingModelId, onCommitName, onCancelName }: {
  workspace: Workspace; disabled: boolean; onSelect: (id: string) => void; onDuplicate: (id?: string) => void;
  onNew: () => void; onRename: (id?: string) => void; onRemove: (id?: string) => void;
  onCompare?: () => void;
  renamingModelId?: string; onCommitName?: (name: string) => void; onCancelName?: () => void;
}) {
  const spectrum = activeSpectrum(workspace), current = activeModel(workspace);
  const limitReached = spectrum.models.length >= 256 || workspace.spectra.reduce((n, s) => n + s.models.length, 0) >= 4096;
  const tabs = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<ModelMenuTarget | null>(null);
  const contextModel = spectrum.models.find(m => m.id === context?.id);
  useEffect(() => { setContext(null); }, [spectrum.id, disabled]);
  useEffect(() => { tabs.current?.querySelector('[aria-selected=true]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }, [current.id]);
  return <div className="model-navigation vertical-models">
    <div className="model-list-heading"><h2>Models <span className="count">{spectrum.models.length}</span></h2><div className="model-actions">
      <button disabled={disabled || limitReached} className="duplicate-model" aria-label="Duplicate model" onClick={() => onDuplicate(current.id)} title="Duplicate selected model"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4"/></svg></button>
      <button disabled={disabled || limitReached} aria-label="New model" title="New model with no sites" onClick={onNew}>＋</button>
    </div></div>
    <div className="model-spectrum-name" title={spectrum.name}>{spectrum.name}</div>
    <ItemList className="model-tabs" role="tablist" aria-orientation="vertical" aria-label="Spectrum models" ref={tabs}>
      {spectrum.models.map((m, i) => <ItemListRow key={m.id} className="model-entry-row" role="presentation" selected={m.id === current.id} actions={<RowActions kind="model" name={m.name} disabled={disabled} removeDisabled={spectrum.models.length === 1} onRename={() => onRename(m.id)} onRemove={() => onRemove(m.id)}/>}>{renamingModelId === m.id ? <div key={m.id} id={`model-${m.id}`} className={`model-name-row name-editing ${m.id === current.id ? 'selected' : ''}`}><ItemListNumber value={i + 1}/><InlineNameEditor name={m.name} label="Model name" rowId={`model-${m.id}`} onCommit={name => onCommitName?.(name)} onCancel={() => onCancelName?.()}/></div> : <button className="model-select" role="tab" id={`model-${m.id}`} aria-controls="model-workspace" aria-selected={m.id === current.id} tabIndex={m.id === current.id ? 0 : -1} disabled={disabled} key={m.id} onClick={() => onSelect(m.id)} onDoubleClick={() => onRename(m.id)} onContextMenu={e => { e.preventDefault(); if (!disabled) { setContext({ id: m.id, x: e.clientX, y: e.clientY, trigger: e.currentTarget }); } }} title={`${m.name}${m.fit ? ` · Reduced objective ${m.fit.reduced_objective.toPrecision(5)} · ${m.fit.free_parameters} free parameters` : ' · Not fitted'}`} onKeyDown={e => {
        if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) { e.preventDefault(); const bounds = e.currentTarget.getBoundingClientRect(); setContext({ id: m.id, x: bounds.left, y: bounds.bottom, trigger: e.currentTarget }); return; }
        const next = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? (i + 1) % spectrum.models.length : (e.key === 'ArrowUp' || e.key === 'ArrowLeft') ? (i - 1 + spectrum.models.length) % spectrum.models.length : e.key === 'Home' ? 0 : e.key === 'End' ? spectrum.models.length - 1 : null;
        if (next !== null) { e.preventDefault(); onSelect(spectrum.models[next].id); tabs.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus(); }
      }}><ItemListNumber value={i + 1}/><ItemListName>{m.name}</ItemListName><FitDot model={m}/><small className={m.fit ? 'model-has-fit' : ''}>{!m.fit ? '—' : m.fit.converged && !m.fit.warnings.length ? 'fit' : 'review'}</small></button>}</ItemListRow>)}
    </ItemList>
    {onCompare && <div className="model-compare-actions"><button className="compare-models-button" disabled={disabled || spectrum.models.length < 2} title={spectrum.models.length < 2 ? 'Duplicate or create a second model to compare alternatives' : 'Compare fits and test additional components with simulated spectra'} onClick={onCompare}>Compare models</button></div>}
    {context && contextModel && !disabled && <ModelContextMenu target={context} model={contextModel} canDuplicate={!limitReached} canRemove={spectrum.models.length > 1} onClose={() => setContext(null)} onAction={(action, id) => { setContext(null); if (action === 'duplicate') onDuplicate(id); else if (action === 'rename') onRename(id); else onRemove(id); }}/>}
  </div>;
}
