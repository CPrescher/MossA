// Benchmark-only alignment of interchangeable ordinary, unlinked site labels.
// Before/after checks always retain original labels and the original fixed gates.
import {compareAnalytical} from './analytical-validation.mjs';
const parameterSame=(x,y)=>y&&!x.link&&!y.link&&x.fit===y.fit&&x.min===y.min&&x.max===y.max&&(x.fit||x.value===y.value);
const ordinary=s=>!s.xvbf&&Object.values(s.params).every(p=>!p.link);
const same=(a,b)=>a.kind===b.kind&&a.profile===b.profile&&ordinary(a)&&ordinary(b)
 &&Object.keys(a.params).length===Object.keys(b.params).length&&Object.keys(a.params).every(k=>{
  return parameterSame(a.params[k],b.params[k]);
 });
function remap(values,order){
 const inverse=order.map((_,i)=>order.indexOf(i));
 return Object.fromEntries(Object.entries(values).map(([k,v])=>[k.replace(/^site:(\d+):/,(_,i)=>`site:${inverse[Number(i)]}:`),v]));
}
export function compareEquivalentSites(reference,actual){
 const raw=compareAnalytical(reference,actual),a=reference.project,b=actual.project,n=a.sites.length;
 if(raw.passed||a.mode!=='thin'||!raw.same_minimum||n!==b.sites.length||n>6||a.mode!==b.mode||a.weighting!==b.weighting
  ||JSON.stringify(a.spectrum)!==JSON.stringify(b.spectrum)||JSON.stringify(a.nuclear_constants)!==JSON.stringify(b.nuclear_constants)
  ||a.background.length!==b.background.length||!a.background.every((p,i)=>parameterSame(p,b.background[i]))
  ||!a.sites.every(ordinary)||!b.sites.every(ordinary)||a.background.some(p=>p.link)||b.background.some(p=>p.link))return {...raw,raw_comparison:raw,site_permutation:null};
 function* permutations(prefix,remaining){if(!remaining.length){yield prefix;return;}for(const i of remaining)if(same(a.sites[i],b.sites[prefix.length]))yield*permutations([...prefix,i],remaining.filter(j=>j!==i));}
 for(const order of permutations([],Array.from({length:n},(_,i)=>i))){
  const r=structuredClone(reference);r.project.sites=order.map(i=>reference.project.sites[i]);r.errors=remap(reference.errors,order);r.evaluation.parameters=remap(reference.evaluation.parameters,order);r.evaluation.components=order.map(i=>reference.evaluation.components[i]);r.intensity_fractions=order.map(i=>reference.intensity_fractions[i]);
  const q=compareAnalytical(r,actual);if(q.passed&&q.same_minimum)return {...q,raw_comparison:raw,site_permutation:order};
 }
 return {...raw,raw_comparison:raw,site_permutation:null};
}
