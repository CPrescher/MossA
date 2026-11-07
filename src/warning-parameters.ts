import type {FitSummary} from './session';
import {parameterAt,uncertainty} from './results';
import {plainScientificLabel} from './plain-label';
import {labels,type Project} from './types';

export type WarningParameter={id:string;label:string;location:string;site?:number;tab:'sites'|'Gen'|'xVBF';view?:'cs'|'qs'|'corr';field:string};
/** List unavailable estimates, not inferred active bounds: linked/derived values
 * can also lack std, and the engine owns the reason and bound tolerance. */
export function warningParameters(project:Project,result:FitSummary):WarningParameter[] {
 const items=Object.keys(result.errors).filter(id=>uncertainty(project,result,id).state==='unavailable').flatMap<WarningParameter>(id=>{
  const parts=id.split(':');
  if(parts[0]==='bkg')return [{id,label:`Background · I${parts[1]}`,location:'Fitting options → General',tab:'Gen' as const,field:`Background ${parts[1]}`}];
  const index=Number(parts[1]),site=project.sites[index];if(parts[0]!=='site'||!site)return [];
  const prefix=`Site ${index+1} · ${plainScientificLabel(site.name)}`,key=parts[2];
  if(site.xvbf&&(key==='delta'||key==='csd'||key==='qsd'||key==='cs'||key==='qs')) {
   const view=key==='delta'?'corr':key.startsWith('cs')?'cs':'qs',axis=view.toUpperCase();
   const field=key==='delta'?'xVBF coupling':`${axis} ${Number(parts[3]??0)+1} ${parts[4]??'center'}`;
   const name=key==='delta'?'xVBF coupling δ':parts.length===5?`xVBF ${axis} component ${Number(parts[3])+1} ${parts[4]}`:`xVBF mean ${axis}`;
   return [{id,label:`${prefix} · ${name}`,location:`Fitting options → xVBF → ${view==='corr'?'Corr':axis}`,site:index,tab:'xVBF' as const,view,field}];
  }
  return [{id,label:`${prefix} · ${labels[key]??key}`,location:'Sites → selected site',site:index,tab:'sites' as const,field:`${labels[key]??key} value`}];
 });
 return items.map(item=>{
  let source=item.id;const seen=new Set<string>();
  while(!seen.has(source)) {seen.add(source);const link=parameterAt(project,source)?.link;if(!link||link.factor===0)break;source=link.target;}
  if(source===item.id)return item;
  const sourceItem=items.find(candidate=>candidate.id===source);
  return sourceItem?{...sourceItem,id:item.id,label:`${item.label} (linked to ${sourceItem.label})`}:item;
 });
}
