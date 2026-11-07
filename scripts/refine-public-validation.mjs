import {readFileSync,writeFileSync} from 'node:fs';
import init,{fit_json} from '../src/wasm/mossa_core.js';
const root=new URL('../validation-data/benchmark/',import.meta.url);
await init({module_or_path:readFileSync(new URL('../src/wasm/mossa_core_bg.wasm',import.meta.url))});
const cases=JSON.parse(readFileSync(new URL('cases.json',root),'utf8'));
const runs=JSON.parse(readFileSync(new URL('wasm-results.json',root),'utf8')).runs;
const results=[];
function run(id,variant,p){const start=performance.now();try{const result=JSON.parse(fit_json(JSON.stringify(p)));results.push({id,variant,initial_project:p,result,elapsed_ms:performance.now()-start});console.log(id,variant,result.evaluation.sse,result.iterations,result.termination);}catch(e){results.push({id,variant,error:String(e)});}writeFileSync(new URL('refinement-results.json',root),JSON.stringify(results,null,2)+'\n');}
for(const c of cases){
 const f=runs.find(r=>r.id===c.id && r.variant==='free-line-ratios').result.project;
 const pv=structuredClone(f);pv.sites.forEach(s=>{s.profile='PseudoVoigt';s.params.mix={value:.99,fit:true,min:0,max:1,link:null};});run(c.id,'pseudo-voigt-from-lorentz',pv);
 if(c.source.record==='15331051' || c.project.sites.length===3){
  const alternatives=runs.filter(r=>r.id===c.id && (r.variant==='coarse-start'||r.variant==='perturbed-1'));
  for(const [i,r] of alternatives.entries()){
   const p=structuredClone(r.result.project);p.sites.forEach(s=>{s.params.a12.fit=true;if(s.kind==='Sextet')s.params.a13.fit=true;});run(c.id,`free-ratios-alternative-${i+1}`,p);
  }
 }
}
