// Verify every archived fit against one captured current runtime, then preserve it.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import init,{evaluate_json} from '../src/wasm/mossa_core.js';
const root=new URL('../validation-data/benchmark/',import.meta.url);
const wasm=readFileSync(new URL('../src/wasm/mossa_core_bg.wasm',import.meta.url));
await init({module_or_path:wasm});
const original=JSON.parse(readFileSync(new URL('wasm-results.json',root),'utf8'));
const runs=[...original.runs,...['variant-results.json','refinement-results.json','physical-results.json'].flatMap(n=>JSON.parse(readFileSync(new URL(n,root),'utf8')))];
let worst=0;
for(const r of runs){
 if(!r.result)continue;
 const current=JSON.parse(evaluate_json(JSON.stringify(r.result.project)));
 const scale=Math.max(...r.result.project.spectrum.y.map(Math.abs));
 const diff=Math.max(...current.y.map((v,i)=>Math.abs(v-r.result.evaluation.y[i])))/scale;
 if(diff>1e-12)throw new Error(`Runtime evaluation drift: ${r.id} ${r.variant}: ${diff}`);
 worst=Math.max(worst,diff);
}
const dest=new URL('runtime/',root);mkdirSync(dest,{recursive:true});
for(const name of ['mossa_core.js','package.json','LICENSE'])writeFileSync(new URL(name,dest),readFileSync(new URL(`../src/wasm/${name}`,import.meta.url)));
writeFileSync(new URL('mossa_core_bg.wasm',dest),wasm);
const result={checked_runs:runs.length,original_batch_wasm_sha256:original.wasm_sha256,captured_runtime_sha256:createHash('sha256').update(wasm).digest('hex'),maximum_prediction_difference_relative_to_observed_scale:worst,criterion:1e-12};
writeFileSync(new URL('runtime-verification.json',root),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
