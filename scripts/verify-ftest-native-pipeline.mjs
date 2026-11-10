import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const base='validation-data/performance',read=p=>JSON.parse(readFileSync(p)),sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const input=`${base}/ftest-native-pipeline.json`,report=read(input),files=new Set([input,'scripts/verify-ftest-native-pipeline.mjs','src-tauri/src/native_engine.rs','src-tauri/src/main.rs','rust-core/examples/native_fixture.rs','tests/native-backend.integration.tsx','tests/native-comparison-batch.test.tsx']);
assert.ok(report.passed);assert.equal(report.repeats,3);assert.equal(report.runs.length,36);assert.deepEqual(report.stages,['reference','compact-fused','prepared']);
for(const [p,h]of Object.entries(report.hashes)){
  assert.equal(sha(p),h,p);files.add(p);
  const prefix=`${base}/runtime/ftest-compact/prepared/`;
  if(p.startsWith(prefix)&&(/^(src\/|rust-core\/)/.test(p.slice(prefix.length)))) {
    const current=p.slice(prefix.length);assert.equal(sha(current),h,current);files.add(current);
  }
}
const tolerance=(...values)=>64*Number.EPSILON*Math.max(0,...values.map(Math.abs));
const canonical=(delta,...values)=>delta<=tolerance(...values)?0:delta;
const results=new Map(),summary=[];
function check(r,n) {
  assert.equal(r.diagnostics.length,n);assert.equal(r.improvements.length,n);assert.equal(r.fitAttempts.length,2*n+2);
  const obs=canonical(r.simpler.evaluation.objective-r.larger.evaluation.objective,r.simpler.evaluation.objective,r.larger.evaluation.objective);
  assert.equal(r.improvement,obs);
  const values=r.diagnostics.map(d=>canonical(d.simpler.objective-d.larger.objective,d.simpler.objective,d.larger.objective));
  assert.deepEqual(r.improvements,values);
  const tail=values.map((v,i)=>v>=obs-tolerance(r.simpler.evaluation.objective,r.larger.evaluation.objective,r.diagnostics[i].simpler.objective,r.diagnostics[i].larger.objective));
  assert.equal(r.exceedances,tail.filter(Boolean).length);assert.equal(r.pValue,(r.exceedances+1)/(n+1));
}
for(const row of report.runs) {
  assert.ok(row.passed&&row.full_result_bit_exact);assert.deepEqual(row.reference,row.optimized);
  check(row.reference,row.simulations);check(row.optimized,row.simulations);
  for(const [stage,r]of [[row.from,row.reference],[row.to,row.optimized]]) {
    const key=`${row.id}/${row.workers}/${stage}`;
    if(results.has(key))assert.deepEqual(results.get(key),r);else results.set(key,r);
  }
  for(const which of ['reference','optimized'])assert.equal(row[which+'_ms'],[...row.samples_ms[which]].sort((a,b)=>a-b)[1]);
  assert.equal(row.speedup,row.reference_ms/row.optimized_ms);
  assert.equal(row.transport.reference.operations,row.transport.optimized.operations,'No optimizer/validation operations may be omitted');
  summary.push({id:row.id,workers:row.workers,simulations:row.simulations,from:row.from,to:row.to,reference_ms:row.reference_ms,optimized_ms:row.optimized_ms,speedup:row.speedup,full_result_bit_exact:true,p_values:row.p_values,transport:row.transport});
}
for(const id of new Set(report.runs.map(r=>r.id)))for(const stage of report.stages) {
  const a=structuredClone(results.get(`${id}/1/${stage}`)),b=structuredClone(results.get(`${id}/4/${stage}`));
  delete a.options.workers;delete b.options.workers;delete a.execution;delete b.execution;assert.deepEqual(a,b);
}
// Preserve the original fixed-policy baseline, not merely agreement among
// the new adapters. Both raw benchmark records remain unchanged.
for(const path of [`${base}/ftest-fixed-native.json`,`${base}/ftest-fixed-transmission-native.json`]) {
  files.add(path);
  for(const row of read(path).runs)assert.deepEqual(results.get(`${row.id}/${row.workers}/reference`),row.optimized);
}
const wasmPath=`${base}/ftest-pipeline-wasm.json`,wasm=read(wasmPath);files.add(wasmPath);assert.ok(wasm.passed);assert.equal(wasm.runs.length,5);
for(const [p,h]of Object.entries(wasm.hashes)){assert.equal(sha(p),h,p);files.add(p);}
for(const row of wasm.runs){assert.ok(row.passed);check(row.reference,199);check(row.optimized,199);assert.equal(row.reference.pValue,row.optimized.pValue);}
const checks={};
for(const [name,path,pattern]of [
  ['rust','/tmp/mossa-pipeline-rust-final.log',/97 passed; 0 failed/],
  ['javascript','/tmp/mossa-pipeline-js-final.log',/pass 464/],
  ['native','/tmp/mossa-pipeline-native-final.log',/pass 22/],
  ['web','/tmp/mossa-pipeline-web-final.log',/built in/],
  ['desktop','/tmp/mossa-pipeline-desktop-final.log',/Finished `dev`/],
]) {assert.match(readFileSync(path,'utf8'),pattern);checks[name]={passed:true,log_sha256:sha(path)};}
assert.equal(sha('rust-core/target/release/examples/native_fixture'),sha(`${base}/runtime/ftest-compact/prepared/native_fixture`));
const receipt={date:new Date().toISOString(),passed:true,paired_stage_comparisons:summary.length,unique_native_cases:12,wasm_cases:5,
  complete_comparison_results_bit_exact:true,worker_count_determinism_bit_exact:true,original_fixed_baseline_bit_exact:true,unchanged_operation_counts:true,rows:summary,checks,
  hashes:Object.fromEntries([...files].sort().map(p=>[p,sha(p)]))};
writeFileSync(`${base}/ftest-native-pipeline-verification.json`,JSON.stringify(receipt,null,2)+'\n');
console.log('Verified 36 paired native stage comparisons, 1/4-worker determinism, original fixed baseline, operation counts, 5 WASM replays and regression/build logs. Complete native results bit exact; PASS.');
