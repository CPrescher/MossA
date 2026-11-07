// Physical-model checks: keep the sextet selection-rule ratio A13=3.
// A12=1.5 assumes a randomly oriented absorber; varying A12 is only a texture diagnostic.
import {readFileSync,writeFileSync} from 'node:fs';
import init,{fit_json} from '../src/wasm/mossa_core.js';
const root=new URL('../validation-data/benchmark/',import.meta.url);
await init({module_or_path:readFileSync(new URL('../src/wasm/mossa_core_bg.wasm',import.meta.url))});
const cases=JSON.parse(readFileSync(new URL('cases.json',root),'utf8'));
const runs=JSON.parse(readFileSync(new URL('wasm-results.json',root),'utf8')).runs;
const results=[];
function run(id,variant,p){const start=performance.now();try{const result=JSON.parse(fit_json(JSON.stringify(p)));results.push({id,variant,initial_project:p,result,elapsed_ms:performance.now()-start});console.log(id,variant,result.evaluation.sse,result.iterations,result.termination);}catch(e){results.push({id,variant,error:String(e)});console.log(id,variant,String(e));}writeFileSync(new URL('physical-results.json',root),JSON.stringify(results,null,2)+'\n');}
for(const c of cases){
 const best=runs.filter(r=>r.id===c.id && (r.variant==='reference-assisted'||r.variant.startsWith('perturbed-')||r.variant==='coarse-start') && r.result).sort((a,b)=>a.result.evaluation.sse-b.result.evaluation.sse)[0];
 const t=structuredClone(best.result.project);t.mode='transmission';t.max_iterations=400;
 for(const s of t.sites){s.params.intensity.value/=t.background[0].value;s.params.fwhm.value=Math.max(.08,s.params.fwhm.value-.097);}
 run(c.id,'transmission-random-powder',t);
 const oriented=structuredClone(t);for(const s of oriented.sites)if(s.kind==='Sextet')s.params.a12.fit=true;
 run(c.id,'transmission-texture-diagnostic',oriented);
}
