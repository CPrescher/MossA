import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
export function HeaderOptions({children,prefix,label='Display and help',title='Text size, theme, manual, and help',className='',buttonContent=<span aria-hidden="true">•••</span>}:{children:ReactNode;prefix?:ReactNode;label?:string;title?:string;className?:string;buttonContent?:ReactNode}) {
 const id=useId(),root=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null),[open,setOpen]=useState(false);
 const [compact,setCompact]=useState(()=>typeof window!=='undefined'&&(window.matchMedia?.('(max-width:1100px)').matches??false));
 const currentLabel=prefix&&!compact?'Manual and help':label,currentTitle=prefix&&!compact?'Manual and help':title;
 useEffect(()=>{const media=window.matchMedia?.('(max-width:1100px)');if(!media)return;const change=()=>setCompact(media.matches);change();media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 useEffect(()=>{if(!open)return;const outside=(event:PointerEvent)=>{if(!document.querySelector('dialog[open]')&&!root.current?.contains(event.target as Node))setOpen(false);};document.addEventListener('pointerdown',outside,true);return()=>document.removeEventListener('pointerdown',outside,true);},[open]);
 return <div ref={root} className={`header-options ${className} ${open?'is-open':''}`} onKeyDown={event=>{if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();setOpen(false);button.current?.focus();}}} onBlur={event=>{if(event.relatedTarget instanceof HTMLElement&&event.relatedTarget.closest('dialog[open]'))return;if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget as Node))setOpen(false);}}>
  {prefix&&!compact&&<div className="header-inline-appearance">{prefix}</div>}
  <button ref={button} type="button" className="header-more-toggle" aria-label={currentLabel} title={currentTitle} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();setOpen(true);window.requestAnimationFrame(()=>Array.from(root.current?.querySelectorAll<HTMLElement>('.header-options-content button,.header-options-content select,.header-options-content a')??[]).find(node=>!node.matches(':disabled,[hidden]')&&node.getClientRects().length>0)?.focus());}}}>{buttonContent}</button>
  <div id={id} className="header-options-content" role="group" aria-label={currentLabel}>{prefix&&compact&&prefix}{children}</div>
 </div>;
}
