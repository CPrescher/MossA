import { useRef } from 'react';
import type { Snapshot } from './session';
import type { Project } from './types';

// A native picker can emit dozens of changes during one drag. Keep the live
// preview, but record only its starting state in scientific editing history.
function sameProject(a:Project,b:Project){return Object.keys(a).length===Object.keys(b).length&&Object.entries(a).every(([key,value])=>value===b[key as keyof Project]);}
export function useSiteColors(snapshot:Snapshot, set:(value:Snapshot,record?:boolean)=>void) {
  const group=useRef<{active:boolean;recorded:boolean;renderBase:Project;last?:Project}>({active:false,recorded:false,renderBase:snapshot.project});
  if(group.current.active && group.current.last && !sameProject(snapshot.project,group.current.last) && !sameProject(snapshot.project,group.current.renderBase)) group.current={active:true,recorded:false,renderBase:snapshot.project};
  group.current.renderBase=snapshot.project;
  const begin=()=>{group.current={active:true,recorded:false,renderBase:snapshot.project};};
  const change=(index:number,color:string)=>{
    if(!/^#[0-9a-f]{6}$/i.test(color)||!snapshot.project.sites[index]||snapshot.project.sites[index].color===color)return;
    const next={...snapshot.project,sites:snapshot.project.sites.map((site,i)=>i===index?{...site,color}:site)};
    const record=!group.current.active||!group.current.recorded;
    group.current.recorded=true;group.current.last=next;
    set({...snapshot,project:next},record);
  };
  return {begin,change};
}
