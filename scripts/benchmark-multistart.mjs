import {readFileSync,writeFileSync} from 'node:fs';
import init,{fit_json,evaluate_json} from '../src/wasm/mossa_core.js';
import {fitMultiStart} from '../src/multistart.mjs';
await init({module_or_path:readFileSync(new URL('../src/wasm/mossa_core_bg.wasm',import.meta.url))});
const runs=JSON.parse(readFileSync(new URL('../validation-data/benchmark/wasm-results.json',import.meta.url))).runs;
const results=[];
for(const id of ['MS_Fe2O3-Fe3O4_30-70','MS-Fe2O3-Fe3O4_70-30','MS_Fe2O3-Fe3O4_50-50','MS_MexicanMagnetite']){
 const old=runs.find(r=>r.id===id && r.variant==='coarse-start');
 const p=structuredClone(old.initial_project);p.search_starts=12;
 const start=performance.now();const result=fitMultiStart(p,q=>JSON.parse(fit_json(JSON.stringify(q))),q=>JSON.parse(evaluate_json(JSON.stringify(q))));
 const row={id,single_start_sse:old.result.evaluation.sse,multistart_sse:result.evaluation.sse,improvement_factor:old.result.evaluation.sse/result.evaluation.sse,elapsed_ms:performance.now()-start,result};results.push(row);
 console.log(id,row.single_start_sse,row.multistart_sse,row.improvement_factor,result.search);
 writeFileSync(new URL('../validation-data/benchmark/multistart-results.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
}
