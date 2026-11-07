import { plainScientificLabel } from './plain-label';
import { ScientificLabel } from './ScientificLabel';
import { useEffect, useRef } from 'react';
import { colors, siteColor, type Site } from './types';

export function SiteList({ sites, selected, disabled, onSelect, onDelete, onHover, onColor, onColorStart, compact=false }: { compact?:boolean; sites: Site[]; selected: number; disabled: boolean; onSelect: (index: number) => void; onDelete: (index: number) => void; onHover?: (index: number | null) => void; onColor?: (index:number,color:string)=>void; onColorStart?:()=>void }) {
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
    <input className="site-color" type="color" onPointerDown={onColorStart} onFocus={onColorStart} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')onColorStart?.();}} aria-label={`Site ${selected+1} color`} title="Choose site color" value={siteColor(sites[selected],selected)} disabled={disabled} onInput={e=>onColor?.(selected,e.currentTarget.value)} onChange={e=>onColor?.(selected,e.target.value)}/><label htmlFor="selected-site">Site</label><select id="selected-site" aria-label="Selected site" disabled={disabled} value={selected} onChange={e => { onHover?.(null); onSelect(Number(e.target.value)); }}>
      {sites.map((site,index)=><option key={index} value={index}>{index+1} · {plainScientificLabel(site.name)} · {site.xvbf?'xVBF':site.kind}</option>)}
    </select><button className="site-combo-delete" aria-label={`Delete site ${selected+1}: ${sites[selected]?.name}`} title="Delete selected site; Undo restores it" disabled={disabled} onClick={()=>{onHover?.(null);onDelete(selected);}}>−</button>
  </div>;
  return <div ref={list} {...focusProps} className="site-list" role="group" aria-label="Sites">
    {sites.map((site, index) => <div className={`site-row ${selected === index ? 'selected' : ''}`} key={index} style={{ borderLeftColor: siteColor(site,index) }} onPointerEnter={e => { if (e.pointerType !== 'touch') onHover?.(index); }} onPointerLeave={() => onHover?.(null)}>
      <input className="site-color" type="color" onPointerDown={onColorStart} onFocus={onColorStart} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')onColorStart?.();}} aria-label={`Site ${index+1} color`} title="Choose site color" value={siteColor(site,index)} disabled={disabled} onInput={e=>onColor?.(index,e.currentTarget.value)} onChange={e=>onColor?.(index,e.target.value)}/>
      <button className="site-select" disabled={disabled} aria-pressed={selected === index} tabIndex={selected === index ? 0 : -1} onKeyDown={event => { if (event.altKey || event.ctrlKey || event.metaKey) return; if (['Delete','Backspace'].includes(event.key)) { event.preventDefault(); onHover?.(null); onDelete(index); return; } if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? sites.length - 1 : Math.max(0,Math.min(sites.length-1,index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1))); onSelect(next); list.current?.querySelectorAll<HTMLButtonElement>('.site-select')[next]?.focus(); }} onClick={() => onSelect(index)} title={`${site.name} · Arrow keys select sites; Delete removes this site; Undo restores it`} aria-keyshortcuts="Delete Backspace">
        <span className="site-number" style={{ color: siteColor(site,index) }}>{index + 1}</span>
        <span className="site-text"><strong><ScientificLabel name={site.name}/></strong><small>{site.xvbf?'xVBF':`${site.kind} · ${site.profile}`}</small></span>
      </button>
      <button className="site-trash" tabIndex={-1} aria-label={`Delete site ${index + 1}: ${site.name}`} title={`Delete ${site.name}`} disabled={disabled} onClick={() => { onHover?.(null); onDelete(index); }}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>
      </button>
    </div>)}
  </div>;
}
