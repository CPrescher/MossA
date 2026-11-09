import {useEffect,useState,type RefObject} from 'react';
import {keys,type Site} from './types';
/** Prefer a selector only when the pane cannot fit its list and primary values. */
export function useCompactSites(panel:RefObject<HTMLElement|null>,sites:Site[]) {
  const [geometry,setGeometry]=useState({height:0,text:16,coarse:false}),[expanded,setExpanded]=useState(false);
  useEffect(()=>{
    const node=panel.current;if(!node)return;
    const measure=()=>{const height=node.getBoundingClientRect().height;if(height>0)setGeometry({height,text:Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize)||16,coarse:window.matchMedia?.('(pointer:coarse)').matches??false});};
    measure();const observer=new ResizeObserver(measure);observer.observe(node);
    window.addEventListener('mossa-appearance-change',measure);const pointer=window.matchMedia?.('(pointer:coarse)');pointer?.addEventListener('change',measure);
    return()=>{observer.disconnect();window.removeEventListener('mossa-appearance-change',measure);pointer?.removeEventListener('change',measure);};
  },[panel]);
  const rows=Math.min(5,Math.max(0,...sites.map(site=>keys(site).length)));
  const siteRow=Math.max(2.25*geometry.text,geometry.coarse?48:0),parameterRow=Math.max(2.2*geometry.text,geometry.coarse?48:0);
  const needed=6.7*geometry.text+Math.min(sites.length,4)*siteRow+rows*parameterRow;
  const recommended=sites.length>=2&&geometry.height>0&&needed>geometry.height;
  return {compact:sites.length>4||(recommended&&!expanded),canToggle:recommended&&sites.length<=4,toggle:()=>setExpanded(value=>!value)};
}
