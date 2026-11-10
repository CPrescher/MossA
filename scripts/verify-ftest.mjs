// Verify recorded bootstrap results without treating failed equivalence as a pass.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {acceptableFit,monteCarloSummary} from '../src/comparison.ts';
import {compareAnalytical} from './analytical-validation.mjs';
const root='validation-data/performance',load=p=>JSON.parse(readFileSync(p));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const inputs=[`${root}/ftest-native.json`,`${root}/ftest-transmission-native.json`,`${root}/ftest-joint-native.json`];
const historical=load(`${root}/analytical-default-native.json`),current=load(`${root}/deterministic-projection-verification.json`);
const rows=[];
function checkResult(r,n) {
  assert.equal(r.improvements.length,n);assert.equal(r.diagnostics.length,n);
  assert.equal(r.fitAttempts.filter(a=>a.stage.startsWith('Observed')).length,2);
  assert.equal(r.fitAttempts.filter(a=>a.stage.startsWith('Simulation')).length,2*n);
  for(const d of [r.simpler,r.larger,...r.diagnostics.flatMap(d=>[d.simpler,d.larger])])assert.ok(acceptableFit(d));
  const count=r.improvements.filter(x=>x>=r.improvement).length;
  assert.equal(r.exceedances,count);
  const summary=monteCarloSummary(count,n);
  assert.equal(r.pValue,summary.pValue);assert.deepEqual(r.monteCarloInterval,summary.monteCarloInterval);
  for(let i=0;i<n;i++)assert.equal(r.improvements[i],Math.max(0,r.diagnostics[i].simpler.objective-r.diagnostics[i].larger.objective));
}
for(const path of inputs) {
  const report=load(path);
  for(const [p,h] of Object.entries(report.hashes))assert.equal(sha(p),h,`${path}: ${p}`);
  const original='validation-data/performance/runtime/analytical/baseline/native_fixture',latest='rust-core/target/release/examples/native_fixture';
  assert.equal(report.hashes[original],historical.hashes[original]);
  assert.equal(report.hashes[latest],current.hashes[latest]);
  for(const row of report.runs) {
    const a=row.reference,b=row.optimized,n=report.simulations;
    for(const r of [a,b])checkResult(r,n);
    const deltas=a.diagnostics.flatMap((d,i)=>['simpler','larger'].map(k=>({reference:d[k].objective,delta:b.diagnostics[i][k].objective-d[k].objective})));
    const better=deltas.filter(d=>d.delta < -Math.max(1e-7,1e-8*d.reference)).length;
    const worse=deltas.filter(d=>d.delta > Math.max(1e-7,1e-8*d.reference)).length;
    assert.equal(row.better_simulation_minima,better);assert.equal(row.worse_simulation_minima,worse);
    assert.equal(row.reference_ms,[...row.samples_ms.reference].sort((a,b)=>a-b)[1]);
    assert.equal(row.optimized_ms,[...row.samples_ms.optimized].sort((a,b)=>a-b)[1]);
    assert.equal(row.speedup,row.reference_ms/row.optimized_ms);
    const sameP=a.pValue===b.pValue,tail=a.improvements.every((v,i)=>(v>=a.improvement)===(b.improvements[i]>=b.improvement));
    assert.equal(row.exact_tail_classification,tail);
    for(const k of ['simpler','larger'])assert.deepEqual(row.observed[k],compareAnalytical(a[k],b[k]));
    rows.push({id:row.id,workers:row.workers,simulations:n,optimized_mode:report.optimized_mode,
      reference_ms:row.reference_ms,optimized_ms:row.optimized_ms,speedup:row.speedup,
      observed_minima_and_std_passed:row.observed.simpler.passed&&row.observed.simpler.same_minimum&&row.observed.larger.passed&&row.observed.larger.same_minimum,
      same_simulation_minima:better+worse===0,better_simulation_minima:better,worse_simulation_minima:worse,
      max_simulation_objective_delta:row.max_simulation_objective_delta,
      exact_tail_classification:tail,p_values:[a.pValue,b.pValue],exceedances:[a.exceedances,b.exceedances],p_value_exact:sameP,
      equivalence_passed:row.passed});
  }
  // Independently verify worker-count invariance, removing execution metadata only.
  for(const id of new Set(report.runs.map(r=>r.id)))for(const stage of ['reference','optimized']) {
    const matching=report.runs.filter(r=>r.id===id).map(r=>structuredClone(r[stage]));
    for(const r of matching){delete r.execution;delete r.options.workers;}
    for(const r of matching.slice(1))assert.deepEqual(r,matching[0]);
  }
}
const sameDataPath=`${root}/ftest-same-data.json`,sameData=load(sameDataPath);
for(const [p,h]of Object.entries(sameData.hashes))assert.equal(sha(p),h,p);
for(const id of new Set(sameData.runs.map(r=>r.id))) {
  const matching=sameData.runs.filter(r=>r.id===id);
  assert.deepEqual(matching.map(r=>r.mode),['default','joint','numerical']);
  assert.equal(new Set(matching.map(r=>r.simulated_data_sha256)).size,1);
}
const testLog='/tmp/mossa-ftest-regression.log',tests=readFileSync(testLog,'utf8');
assert.match(tests,/tests 21/);assert.match(tests,/pass 21/);assert.match(tests,/fail 0/);
const receipt={date:new Date().toISOString(),benchmark_integrity_passed:true,
  equivalence_passed:rows.every(r=>r.equivalence_passed),worker_count_determinism_bit_exact:true,
  comparison_regression_tests:{passed:21,failed:0,log_sha256:sha(testLog)},
  objective_tolerance:'max(1e-7, 1e-8 * reference objective); unchanged analytical-validation gates for observed parameters/std',
  rows,same_data_controls:sameData.runs.map(({id,mode,p_values,exceedances,worse_minima,better_minima,max_worse_delta,simulated_data_sha256})=>({id,mode,p_values,exceedances,worse_minima,better_minima,max_worse_delta,simulated_data_sha256})),
  hashes:Object.fromEntries([...inputs,sameDataPath,`${root}/analytical-default-native.json`,`${root}/deterministic-projection-verification.json`,'scripts/verify-ftest.mjs'].map(p=>[p,sha(p)]))};
writeFileSync(`${root}/ftest-verification.json`,JSON.stringify(receipt,null,2)+'\n');
console.log(`Verified benchmark integrity and worker determinism for ${rows.length} comparisons. Scientific equivalence: ${receipt.equivalence_passed?'PASS':'FAIL (retained in receipt)'}.`);
