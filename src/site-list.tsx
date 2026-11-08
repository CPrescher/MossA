import { ItemList, ItemListName, ItemListNumber, ItemListRow } from './ItemList';
import { plainScientificLabel } from './plain-label';
import { ScientificLabel } from './ScientificLabel';
import { useEffect, useRef, useState } from 'react';
import { InlineNameEditor } from './InlineNameEditor';
import { siteColor, type Site } from './types';
import { PencilIcon, RowActions, TrashIcon } from './RowActions';

export function SiteList({ sites, selected, disabled, onSelect, onDelete, onHover, onColor, onColorStart, onRename, compact=false }: { onRename?: (index: number, name: string) => void; compact?:boolean; sites: Site[]; selected: number; disabled: boolean; onSelect: (index: number) => void; onDelete: (index: number) => void; onHover?: (index: number | null) => void; onColor?: (index:number,color:string)=>void; onColorStart?:()=>void }) {
  const [renaming, setRenaming] = useState<number | null>(null);
  useEffect(() => { setRenaming(null); }, [selected, compact, disabled, sites.length]);
  const list = useRef<HTMLDivElement>(null), selectorFocused=useRef(false);
  const focusProps={onFocusCapture:(event:React.FocusEvent<HTMLDivElement>)=>{selectorFocused.current=(event.target as HTMLElement).matches('select,.site-select');},onBlurCapture:(event:React.FocusEvent<HTMLDivElement>)=>{if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget as Node))selectorFocused.current=false;}};
  useEffect(()=>{const outside=(event:PointerEvent)=>{if(!list.current?.contains(event.target as Node))selectorFocused.current=false;};document.addEventListener('pointerdown',outside,true);return()=>document.removeEventListener('pointerdown',outside,true);},[]);
  useEffect(()=>{if(selectorFocused.current)list.current?.querySelector<HTMLElement>('select,.site-select[aria-pressed=true]')?.focus({preventScroll:true});},[compact,selected,sites.length]);
  useEffect(() => {
    const element=list.current;
    if(!element)return;
    const reveal=()=>element.querySelector('.selected')?.scrollIntoView?.({block:'nearest',inline:'nearest'});
    reveal();
    if(typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(reveal);
    observer.observe(element);
    return()=>observer.disconnect();
  }, [selected, sites.length]);
  if(compact||sites.length > 4) return <div ref={list} {...focusProps} className="site-combo" role="group" aria-label="Sites">
    <input className="site-color" type="color" onPointerDown={onColorStart} onFocus={onColorStart} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')onColorStart?.();}} aria-label={`Site ${selected+1} color`} title="Choose site color" value={siteColor(sites[selected],selected)} disabled={disabled} onInput={e=>onColor?.(selected,e.currentTarget.value)} onChange={e=>onColor?.(selected,e.target.value)}/><label htmlFor={renaming === selected ? undefined : "selected-site"}>Site</label>{renaming === selected && !disabled && sites[selected] ? <InlineNameEditor name={sites[selected].name} label="Site name" maxLength={240} rowId="selected-site" onCommit={name => { setRenaming(null); onRename?.(selected, name); }} onCancel={() => setRenaming(null)}/> : <select id="selected-site" aria-label="Selected site" disabled={disabled} value={selected} onChange={e => { onHover?.(null); onSelect(Number(e.target.value)); }}>
      {sites.map((site,index)=><option key={index} value={index}>{index+1} · {plainScientificLabel(site.name)} · {site.xvbf?'xVBF':site.kind}</option>)}
    </select>}
    {onRename && <button className="site-combo-rename" aria-label="Rename selected site" title="Rename selected site" disabled={disabled || !sites[selected]} onClick={() => { onHover?.(null); setRenaming(selected); }}><PencilIcon/></button>}
    <button className="site-combo-delete" aria-label={`Delete site ${selected+1}: ${sites[selected]?.name}`} title="Delete selected site; Undo restores it" disabled={disabled || !sites[selected]} onClick={() => { onHover?.(null); onDelete(selected); }}><TrashIcon/></button>
  </div>;
  return <ItemList ref={list} {...focusProps} className="site-list" role="group" aria-label="Sites">
    {sites.map((site, index) => <ItemListRow className={`site-row ${selected === index ? 'selected' : ''}`} key={index} selected={selected === index} actions={<RowActions kind={`site ${index + 1}`} name={site.name} disabled={disabled} trashClassName="site-trash" onRename={onRename ? () => { onHover?.(null); setRenaming(index); } : undefined} onRemove={() => { onHover?.(null); onDelete(index); }}/>}  style={{ borderLeftColor: siteColor(site,index) }} onPointerEnter={e => { if (e.pointerType !== 'touch') onHover?.(index); }} onPointerLeave={() => onHover?.(null)}>
      <input className="site-color" type="color" onPointerDown={onColorStart} onFocus={onColorStart} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')onColorStart?.();}} aria-label={`Site ${index+1} color`} title="Choose site color" value={siteColor(site,index)} disabled={disabled} onInput={e=>onColor?.(index,e.currentTarget.value)} onChange={e=>onColor?.(index,e.target.value)}/>
      {renaming === index && !disabled ? <div className="site-select name-editing"><ItemListNumber value={index + 1}/><InlineNameEditor name={site.name} label="Site name" maxLength={240} rowId={`site-${index}`} onCommit={name => { setRenaming(null); onRename?.(index, name); }} onCancel={() => setRenaming(null)}/></div> : <button id={`site-${index}`} className="site-select" disabled={disabled} aria-pressed={selected === index} tabIndex={selected === index ? 0 : -1} onKeyDown={event => { if (event.altKey || event.ctrlKey || event.metaKey) return; if (['Delete','Backspace'].includes(event.key)) { event.preventDefault(); onHover?.(null); onDelete(index); return; } if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? sites.length - 1 : Math.max(0,Math.min(sites.length-1,index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1))); onSelect(next); list.current?.querySelectorAll<HTMLButtonElement>('.site-select')[next]?.focus(); }} onClick={() => onSelect(index)} onDoubleClick={() => { if (onRename) { onHover?.(null); setRenaming(index); } }} title={`${site.name} · Double-click to rename; Arrow keys select sites; Delete removes this site; Undo restores it`} aria-keyshortcuts="Delete Backspace">
        <ItemListNumber value={index + 1}/>
        <span className="site-text"><ItemListName><ScientificLabel name={site.name}/></ItemListName><small>{site.xvbf?'xVBF':`${site.kind} · ${site.profile}`}</small></span>
      </button>}
    </ItemListRow>)}
  </ItemList>;
}
