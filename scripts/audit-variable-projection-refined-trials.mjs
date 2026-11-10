// Refit every frozen input and finalize all local minima with both binaries.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {NativeFixture} from '../tests/native-transport.ts';
import {compareAnalytical} from './analytical-validation.mjs';
const base='validation-data/performance',runtime=`${base}/runtime/variable-projection-refined`;
const beforePath=`${runtime}/baseline/native_fixture`,afterPath='rust-core/target/release/examples/native_fixture';
const before=new NativeFixture(resolve(beforePath)),after=new NativeFixture(resolve(afterPath));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const diagnosticPath=`${base}/variable-projection-refined-mixture-trajectories.json`,diagnostic=JSON.parse(readFileSync(diagnosticPath));
const files=[beforePath,afterPath,diagnosticPath],report={date:new Date().toISOString(),runs:[]};
async function compute(f,operation,project,state){return(await f.transport.invoke('native_compute',{session:'refined-audit',operation,project,...(state?{state}:{})})).result;}
try{
 for(const f of [before,after])await f.transport.invoke('native_compute_start',{session:'refined-audit'});
 for(const [name,count]of [['trials-final',4],['mixture-trials-final',12]]){
  const path=`${base}/variable-projection-refined-${name}.json`,d=JSON.parse(readFileSync(path));files.push(path);assert.equal(d.binary_sha256,sha(afterPath));assert.equal(d.trials.length,count);
  for(const trial of d.trials){
   const old=await compute(before,'fit',trial.input),current=await compute(after,'fit',trial.input);assert.deepEqual(current,trial.result,'frozen improved trial must reproduce');
   const a=old.finalization,b=current.finalization;
   const oldFinal=await compute(before,'finalize-fit',a.project,a.state),newFinal=await compute(after,'finalize-fit',b.project,b.state),samePoint=await compute(before,'finalize-fit',b.project,b.state);
   assert.deepEqual(newFinal,samePoint,'full-coordinate finalization must remain exact at identical coordinates');
   const quality=compareAnalytical(oldFinal,newFinal);assert.ok(quality.passed&&quality.same_minimum,`${name}:${trial.start}:${JSON.stringify(quality)}`);
   assert.equal(oldFinal.dof,newFinal.dof);assert.equal(oldFinal.free_parameters,newFinal.free_parameters);assert.deepEqual(Object.keys(oldFinal.errors).sort(),Object.keys(newFinal.errors).sort());
   const mixture=name.startsWith('mixture');if(mixture){assert.deepEqual(old,diagnostic.trials[trial.start-1].result,'diagnostic fits must reproduce the uninstrumented original binary');assert.deepEqual(current,old);assert.deepEqual(newFinal,oldFinal);assert.deepEqual(trial.execution.projection_handoffs??[],[]);}
   report.runs.push({case:mixture?'mixture':'magnetite',start:trial.start,...quality,full_fit_exact:JSON.stringify(oldFinal)===JSON.stringify(newFinal),same_coordinate_finalization_exact:true,reference:oldFinal,analytical:newFinal,projection_handoffs:trial.execution.projection_handoffs??[]});
  }
 }
 report.passed=true;report.hashes=Object.fromEntries(files.map(p=>[p,sha(p)]));
 writeFileSync(`${base}/variable-projection-refined-trial-audit.json`,JSON.stringify(report,null,2)+'\n');
 console.log('Audited 16 individual starts: all minima/std pass; all 12 mixture fits and uncertainties are exact; same-coordinate finalization is exact.');
}finally{await before.close();await after.close();}
