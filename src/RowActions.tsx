export function PencilIcon() {
  return <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/></svg>;
}

export function TrashIcon() {
  return <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>;
}

export function RowActions({ kind, name, disabled, removeDisabled = false, onRename, onRemove, trashClassName = '' }: {
  kind: string; name: string; disabled: boolean; removeDisabled?: boolean;
  onRename?: () => void; onRemove: () => void; trashClassName?: string;
}) {
  return <span className="row-actions">
    {onRename && <button className="row-rename" aria-label={`Rename ${kind}: ${name}`} title={`Rename ${name}`} disabled={disabled} onClick={onRename}><PencilIcon/></button>}
    <button className={`row-trash ${trashClassName}`} aria-label={`Delete ${kind}: ${name}`} title={removeDisabled ? 'Keep at least one model per spectrum' : `Delete ${name}; Undo restores it`} disabled={disabled || removeDisabled} onClick={onRemove}><TrashIcon/></button>
  </span>;
}
