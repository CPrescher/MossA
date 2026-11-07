import {readFileSync,writeFileSync} from 'node:fs';
import init,{fit_json} from '../src/wasm/mossa_core.js';
const base=new URL('../validation-data/benchmark/',import.meta.url);
await init({module_or_path:readFileSync(new URL('../src/wasm/mossa_core_bg.wasm',import.meta.url))});
const cases=JSON.parse(readFileSync(new URL('cases.json',base),'utf8'));
const runs=JSON.parse(readFileSync(new URL('wasm-results.json',base),'utf8')).runs;
const results=[];
for(const id of ['MS_Fe2O3','MS_Fe3O4']){
 const initial=runs.find(r=>r.id===id && r.variant==='reference-assisted').result.project;
 for(const freeRatios of [false,true]){
  const p=structuredClone(initial);p.mode='transmission';p.max_iterations=250;
  const baseline=p.background[0].value;
  for(const s of p.sites){s.params.intensity.value/=baseline;s.params.fwhm.value=Math.max(.08,s.params.fwhm.value-.097);if(freeRatios){s.params.a12.fit=true;s.params.a13.fit=true;}}
  const start=performance.now();
  try{const result=JSON.parse(fit_json(JSON.stringify(p)));results.push({id,variant:freeRatios?'transmission-free-ratios':'transmission-powder-ratios',initial_project:p,result,elapsed_ms:performance.now()-start});console.log(id,results.at(-1).variant,result.evaluation.sse,result.iterations,result.termination,performance.now()-start);}
  catch(e){results.push({id,error:String(e)});console.log(id,'ERROR',String(e));}
  writeFileSync(new URL('transmission-results.json',base),JSON.stringify(results,null,2)+'\n');
 }
}
