// Additional alternating pairs for the longest mixture search; no concurrent runs.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {NativeFixture} from '../tests/native-transport.ts';
import {fitMultiStartAsync} from '../src/multistart.mjs';
import {compareAnalytical} from './analytical-validation.mjs';
const base='validation-data/performance',runtime=`${base}/runtime/variable-projection-refined`,input=`${base}/variable-projection-refined-search12-mixture.json`;
const project={...JSON.parse(readFileSync(input)).runs.find(r=>r.id.endsWith('-full')).projected_project};
const paths={reference:`${runtime}/baseline/native_fixture`,optimized:'rust-core/target/release/examples/native_fixture'},fixtures=Object.fromEntries(Object.entries(paths).map(([k,p])=>[k,new NativeFixture(resolve(p))]));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
async function run(f){let core_ms=0;const compute=async(operation,project,state)=>{const r=await f.transport.invoke('native_compute',{session:'repeat',operation,project,...(state?{state}:{})});assert.equal(r.execution.fallback,undefined);assert.deepEqual(r.execution.projection_handoffs??[],[]);core_ms+=r.elapsed;return r.result;};const t=performance.now();const result=await fitMultiStartAsync(project,p=>compute('fit',p),p=>compute('evaluate',p),undefined,p=>compute('finalize-fit',p.project,p.state));return {result,wall_ms:performance.now()-t,core_ms};}
try{
 for(const f of Object.values(fixtures))await f.transport.invoke('native_compute_start',{session:'repeat'});
 const warm={};for(const [k,f]of Object.entries(fixtures))warm[k]=await run(f);assert.deepEqual(warm.reference.result,warm.optimized.result);
 const samples={reference:[],optimized:[]};
 for(let i=0;i<9;i++)for(const k of i%2?['optimized','reference']:['reference','optimized']){const r=await run(fixtures[k]);assert.deepEqual(r.result,warm[k].result);samples[k].push({wall_ms:r.wall_ms,core_ms:r.core_ms});}
 const quality=compareAnalytical(warm.reference.result,warm.optimized.result);assert.ok(quality.passed&&quality.same_minimum);
 const timing={};for(const metric of ['wall_ms','core_ms']){const a=samples.reference.map(s=>s[metric]),b=samples.optimized.map(s=>s[metric]);timing[metric]={reference:median(a),optimized:median(b),speedup:median(a)/median(b),median_paired_ratio:median(a.map((v,i)=>b[i]/v))};}
 const report={date:new Date().toISOString(),repeats:9,method:'Nine additional alternating pairs after excluded warmup, original vs refined projection, longest full twelve-start mixture. Production ordered search. Both wall and summed native compute times. No concurrent browser/build/test runs. All 12 local fits follow original paths; complete winning result must be exact.',project,samples,timing,...quality,complete_result_exact:true,reference:warm.reference.result,analytical:warm.optimized.result,hashes:Object.fromEntries([input,...Object.values(paths),'scripts/benchmark-variable-projection-refined-repeat.mjs'].map(p=>[p,hash(p)]))};
 writeFileSync(`${base}/variable-projection-refined-repeat.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(timing));
}finally{for(const f of Object.values(fixtures))await f.close();}
