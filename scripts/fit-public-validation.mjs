// Run the actual browser WASM fitting API on measured spectra.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import init, { fit_json, evaluate_json } from '../src/wasm/mossa_core.js';
const root = new URL('../validation-data/benchmark/', import.meta.url);
const wasm = readFileSync(new URL('../src/wasm/mossa_core_bg.wasm', import.meta.url));
await init({module_or_path:wasm});
const cases = JSON.parse(readFileSync(new URL('cases.json',root),'utf8'));
const clone = p=>JSON.parse(JSON.stringify(p));
let seed=18407;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
const results=[];
function run(c,variant,p){
 const start=performance.now();
 try {
  const result=JSON.parse(fit_json(JSON.stringify(p)));
  const record={id:c.id,variant,initial_project:p,result,elapsed_ms:performance.now()-start};
  results.push(record);
  console.log(c.id,variant,'SSE',result.evaluation.sse.toPrecision(7),'iterations',result.iterations,result.converged,result.termination);
 }catch(error){results.push({id:c.id,variant,initial_project:p,error:String(error)});console.log(c.id,variant,'ERROR',String(error));}
 writeFileSync(new URL('wasm-results.json',root),JSON.stringify({wasm_sha256:createHash('sha256').update(wasm).digest('hex'),seed:18407,runs:results},null,2)+'\n');
}
for(const c of cases){
 const base=clone(c.project);
 run(c,'reference-assisted',base);
 for(let j=1;j<=4;j++){
  const p=clone(base);
  for(const s of p.sites){
   s.params.cs.value+=(random()-.5)*.14;
   s.params.qs.value+=(random()-.5)*.15;
   s.params.bhf.value=Math.max(1,s.params.bhf.value+(random()-.5)*1.6);
   s.params.fwhm.value*=.75+.5*random();
   s.params.intensity.value*=.7+.6*random();
  }
  run(c,`perturbed-${j}`,p);
 }
 const coarse=clone(base);
 for(const s of coarse.sites){s.params.cs.value=Math.round(s.params.cs.value*2)/2;s.params.bhf.value=Math.round(s.params.bhf.value/5)*5;s.params.fwhm.value=.35;s.params.qs.value=Math.round(s.params.qs.value*2)/2;}
 run(c,'coarse-start',coarse);
 const ratios=clone(base);
 for(const s of ratios.sites){s.params.a12.fit=true;if(s.kind==='Sextet')s.params.a13.fit=true;}
 run(c,'free-line-ratios',ratios);
 if(c.source.record==='14959531'){
  const p=clone(base);p.weighting='counts';run(c,'count-weighted',p);
 }else{
  const p=clone(base);p.spectrum.y=p.spectrum.y.map(y=>y*1e6);p.background.forEach(b=>{b.value*=1e6;if(b.min!==null)b.min*=1e6;if(b.max!==null)b.max*=1e6;});p.sites.forEach(s=>s.params.intensity.value*=1e6);
  run(c,'intensity-scaled-1e6',p);
 }
}
