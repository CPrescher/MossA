import {readFileSync,writeFileSync} from 'node:fs';
import init,{fit_json} from '../src/wasm/mossa_core.js';
const root=new URL('../validation-data/benchmark/',import.meta.url);
await init({module_or_path:readFileSync(new URL('../src/wasm/mossa_core_bg.wasm',import.meta.url))});
const cases=JSON.parse(readFileSync(new URL('cases.json',root),'utf8'));
const runs=JSON.parse(readFileSync(new URL('wasm-results.json',root),'utf8')).runs;
const results=[];
function run(id,variant,p){const start=performance.now();try{const result=JSON.parse(fit_json(JSON.stringify(p)));results.push({id,variant,initial_project:p,result,elapsed_ms:performance.now()-start});console.log(id,variant,result.evaluation.sse,result.iterations,result.termination);}catch(e){results.push({id,variant,error:String(e)});console.log(id,variant,String(e));}writeFileSync(new URL('variant-results.json',root),JSON.stringify(results,null,2)+'\n');}
for(const c of cases){
 const simple=runs.filter(r=>r.id===c.id && /^reference-assisted$|^perturbed|^coarse-start$/.test(r.variant) && r.result).sort((a,b)=>a.result.evaluation.sse-b.result.evaluation.sse)[0];
 const p=structuredClone(simple.result.project);
 for(const s of p.sites){s.profile='PseudoVoigt';s.params.mix={value:.8,fit:true,min:0,max:1,link:null};s.params.a12.fit=true;if(s.kind==='Sextet')s.params.a13.fit=true;}
 run(c.id,'pseudo-voigt-free-ratios',p);
 if(c.source.record==='14959531'){
  const t=structuredClone(simple.result.project);t.mode='transmission';t.max_iterations=400;
  for(const s of t.sites){s.params.intensity.value/=t.background[0].value;s.params.fwhm.value=Math.max(.08,s.params.fwhm.value-.097);s.params.a12.fit=true;s.params.a13.fit=true;}
  run(c.id,'transmission-free-ratios',t);
 }
 if(['dk23289v','dk23287v'].includes(c.id)){
  const linked=structuredClone(c.project);
  linked.sites[1].params.intensity.link={target:'site:0:intensity',factor:3};
  linked.sites[1].params.fwhm.link={target:'site:0:fwhm',factor:1};
  if(c.id==='dk23287v')linked.sites[4].params.fwhm.link={target:'site:3:fwhm',factor:1};
  run(c.id,'reference-constraints',linked);
 }
}
