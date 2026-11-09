// Opt-in instrumented native build; diagnostic timings are not performance claims.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {NativeFixture} from '../tests/native-transport.ts';
import {fitMultiStartAsync} from '../src/multistart.mjs';
import {compareAnalytical} from './analytical-validation.mjs';
const args=process.argv.slice(2),option=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const row=JSON.parse(readFileSync('validation-data/performance/variable-projection-search.json')).runs.find(r=>r.id===option('--case','MS_MexicanMagnetite_coarse-full'));
const fixture=new NativeFixture(resolve(option('--binary','rust-core/target/release/examples/native_fixture')));
const p={...row.initial_project,thin_solver:'variable_projection',search_starts:Number(option('--starts',String(row.initial_project.search_starts)))},trials=[];
const compute=async(operation,project,state)=>fixture.transport.invoke('native_compute',{session:'profile',operation,project,...(state?{state}:{})});
try{
 await fixture.transport.invoke('native_compute_start',{session:'profile'});
 const result=await fitMultiStartAsync(p,async project=>{
  const r=await compute('fit',project);trials.push({start:trials.length+1,input:project,result:r.result,elapsed_ms:r.elapsed,execution:r.execution});return r.result;
 },async project=>(await compute('evaluate',project)).result,undefined,async pending=>(await compute('finalize-fit',pending.project,pending.state)).result);
 if(!args.includes('--changed'))assert.deepEqual(result,row.analytical,'instrumentation must not change production output');
 const binary=option('--binary','rust-core/target/release/examples/native_fixture');
 let trial_audits;
 if(args.includes('--audit-trials')){
  const old=new NativeFixture(resolve('validation-data/performance/runtime/variable-projection-multistart/baseline/native_fixture'));
  try{
   await old.transport.invoke('native_compute_start',{session:'audit'});
   const before=JSON.parse(readFileSync('validation-data/performance/variable-projection-multistart-profile.json'));
   trial_audits=[];
   for(let i=0;i<trials.length;i++){
    const finalize=async(f,r)=>{const q=r.finalization;return(await f.transport.invoke('native_compute',{session:'audit',operation:'finalize-fit',project:q.project,state:q.state})).result;};
    const a=await finalize(old,before.trials[i].result),b=await finalize(old,trials[i].result);
    const current=(await compute('finalize-fit',trials[i].result.finalization.project,trials[i].result.finalization.state)).result;
    assert.deepEqual(current,b,'full covariance implementation must remain exact at identical coordinates');
    const quality=compareAnalytical(a,b);assert.ok(quality.passed&&quality.same_minimum,JSON.stringify(quality));
    trial_audits.push({start:i+1,before:a,after:b,...quality});
   }
  }finally{await old.close();}
 }
 const out={trial_audits,date:new Date().toISOString(),binary_sha256:createHash('sha256').update(readFileSync(binary)).digest('hex'),trials,result};
 writeFileSync(option('--output','validation-data/performance/variable-projection-multistart-profile.json'),JSON.stringify(out,null,2)+'\n');
 for(const r of trials){const s=r.execution.projection_profile;console.log(r.start,`${r.elapsed_ms.toFixed(1)}ms`,r.result.iterations,r.result.evaluation.objective,JSON.stringify({...s,trace:undefined}));}
}finally{await fixture.close();}
