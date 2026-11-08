import { ItemList, ItemListName, ItemListNumber, ItemListRow } from './ItemList';
import { ScientificLabel } from './ScientificLabel';
import { useEffect, useRef, useState } from 'react';
import { colors, type Site } from './types';
import { InlineNameEditor } from './InlineNameEditor';
import { RowActions } from './RowActions';

export function SiteList({ sites, selected, disabled, onSelect, onDelete, onHover, onRename }: {
  sites: Site[]; selected: number; disabled: boolean;
  onSelect: (index: number) => void; onDelete: (index: number) => void;
  onHover?: (index: number | null) => void; onRename?: (index: number, name: string) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  useEffect(() => { setRenaming(null); }, [selected, disabled, sites.length]);
  useEffect(() => { list.current?.querySelector('.selected')?.scrollIntoView?.({ block: 'nearest' }); }, [selected, sites.length]);
  return <ItemList ref={list} className="site-list" role="group" aria-label="Sites">
    {sites.map((site, index) => <ItemListRow className={`site-row ${selected === index ? 'selected' : ''}`} key={index} selected={selected === index} actions={<RowActions kind={`site ${index + 1}`} name={site.name} disabled={disabled} trashClassName="site-trash" onRename={onRename ? () => { onHover?.(null); setRenaming(index); } : undefined} onRemove={() => { onHover?.(null); onDelete(index); }}/>}  style={{ borderLeftColor: colors[index % colors.length] }} onPointerEnter={e => { if (e.pointerType !== 'touch') onHover?.(index); }} onPointerLeave={() => onHover?.(null)}>
      {renaming === index && !disabled ? <div className="site-select name-editing"><ItemListNumber value={index + 1}/><InlineNameEditor name={site.name} label="Site name" maxLength={240} rowId={`site-${index}`} onCommit={name => { setRenaming(null); onRename?.(index, name); }} onCancel={() => setRenaming(null)}/></div> : <button id={`site-${index}`} className="site-select" disabled={disabled} aria-pressed={selected === index} tabIndex={selected === index ? 0 : -1} onKeyDown={event => { if (event.altKey || event.ctrlKey || event.metaKey) return; if (['Delete','Backspace'].includes(event.key)) { event.preventDefault(); onHover?.(null); onDelete(index); return; } if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? sites.length - 1 : Math.max(0,Math.min(sites.length-1,index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1))); onSelect(next); list.current?.querySelectorAll<HTMLButtonElement>('.site-select')[next]?.focus(); }} onClick={() => onSelect(index)} onDoubleClick={() => { if (onRename) { onHover?.(null); setRenaming(index); } }} title={`${site.name} · Double-click to rename; Arrow keys select sites; Delete removes this site; Undo restores it`} aria-keyshortcuts="Delete Backspace">
        <ItemListNumber value={index + 1}/>
        <span className="site-text"><ItemListName><ScientificLabel name={site.name}/></ItemListName><small>{site.xvbf?'xVBF':`${site.kind} · ${site.profile}`}</small></span>
      </button>}
    </ItemListRow>)}
  </ItemList>;
}
