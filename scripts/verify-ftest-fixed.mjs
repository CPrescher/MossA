// Independent verification of fixed-policy native/WASM records and old results.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {acceptableFit} from '../src/comparison.ts';
import {compareAnalytical} from './analytical-validation.mjs';
const root='validation-data/performance',read=p=>JSON.parse(readFileSync(p)),sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const files=new Set(['scripts/verify-ftest-fixed.mjs','tests/comparison.test.tsx','tests/fixtures/ftest-boundary-replays.json']);
const tolerance=(...xs)=>64*Number.EPSILON*Math.max(0,...xs.map(Math.abs));
const canonical=(delta,...xs)=>delta<=tolerance(...xs)?0:delta;
const objectiveGate=x=>Math.max(1e-7,1e-8*x);
function statistics(r) {
  const observed=canonical(r.simpler.evaluation.objective-r.larger.evaluation.objective,r.simpler.evaluation.objective,r.larger.evaluation.objective);
  const improvements=r.diagnostics.map(d=>canonical(d.simpler.objective-d.larger.objective,d.simpler.objective,d.larger.objective));
  const tail=improvements.map((v,i)=>v>=observed-tolerance(r.simpler.evaluation.objective,r.larger.evaluation.objective,r.diagnostics[i].simpler.objective,r.diagnostics[i].larger.objective));
  return {observed,improvements,tail,count:tail.filter(Boolean).length,p:(tail.filter(Boolean).length+1)/(tail.length+1)};
}
function checkResult(r,n) {
  assert.equal(r.diagnostics.length,n);assert.equal(r.improvements.length,n);
  assert.equal(r.fitAttempts.length,2*n+2);
  for(const f of [r.simpler,r.larger,...r.diagnostics.flatMap(d=>[d.simpler,d.larger])])assert.ok(acceptableFit(f));
  const s=statistics(r);assert.equal(r.improvement,s.observed);assert.deepEqual(r.improvements,s.improvements);assert.equal(r.exceedances,s.count);assert.equal(r.pValue,s.p);
  return s;
}
function compare(a,b) {
  const observed={};
  for(const model of ['simpler','larger']) {
    observed[model]=compareAnalytical(a[model],b[model]);assert.ok(observed[model].passed&&observed[model].same_minimum);
    assert.equal(a[model].dof,b[model].dof);assert.equal(a[model].free_parameters,b[model].free_parameters);
  }
  let maxDelta=0;
  for(let i=0;i<a.diagnostics.length;i++)for(const model of ['simpler','larger']) {
    const x=a.diagnostics[i][model],y=b.diagnostics[i][model],delta=Math.abs(y.objective-x.objective);
    assert.ok(delta<=objectiveGate(x.objective),`${i}:${model}: objective delta ${delta}`);assert.equal(x.rank,y.rank);assert.equal(x.free_parameters,y.free_parameters);
    maxDelta=Math.max(maxDelta,delta);
  }
  const x=statistics(a),y=statistics(b);assert.deepEqual(x.tail,y.tail);assert.equal(a.pValue,b.pValue);assert.equal(a.exceedances,b.exceedances);assert.deepEqual(a.monteCarloInterval,b.monteCarloInterval);
  return {observed,max_simulation_objective_delta:maxDelta,exact_tail_classification:true,p_values:[a.pValue,b.pValue]};
}
const nativeInputs=[`${root}/ftest-fixed-native.json`,`${root}/ftest-fixed-transmission-native.json`],rows=[],historical=[];
for(const path of nativeInputs) {
  files.add(path);const d=read(path);assert.ok(d.passed);assert.equal(d.repeats,3);
  for(const [p,h] of Object.entries(d.hashes)){assert.equal(sha(p),h,p);files.add(p);}
  const oldPath=`${root}/${d.simulations===199?'ftest-native':'ftest-transmission-native'}.json`,old=read(oldPath);files.add(oldPath);
  for(const row of d.runs) {
    for(const r of [row.reference,row.optimized])checkResult(r,d.simulations);
    const quality=compare(row.reference,row.optimized);assert.ok(row.passed);assert.equal(row.worse_simulation_minima,0);assert.equal(row.better_simulation_minima,0);
    for(const stage of ['reference','optimized'])assert.equal(row[stage+'_ms'],[...row.samples_ms[stage]].sort((a,b)=>a-b)[1]);
    assert.equal(row.speedup,row.reference_ms/row.optimized_ms);
    rows.push({id:row.id,workers:row.workers,simulations:d.simulations,reference_ms:row.reference_ms,optimized_ms:row.optimized_ms,speedup:row.speedup,...quality,
      precision_restarts:{reference:row.reference.fitAttempts.filter(s=>s.attempts.some(a=>a.start.startsWith('precision restart'))).length,optimized:row.optimized.fitAttempts.filter(s=>s.attempts.some(a=>a.start.startsWith('precision restart'))).length}});
    const before=old.runs.find(r=>r.id===row.id&&r.workers===row.workers).reference,now=row.optimized;
    // Historical results use the same observations. Reapply only the new tie
    // rule to their objectives; optimization minima remain independently checked.
    assert.deepEqual(row.reference.simpler.evaluation.y,before.simpler.evaluation.y);
    let better=0,worse=0;
    for(let i=0;i<before.diagnostics.length;i++)for(const model of ['simpler','larger']) {
      const x=before.diagnostics[i][model].objective,delta=now.diagnostics[i][model].objective-x;
      better+=Number(delta < -objectiveGate(x));worse+=Number(delta>objectiveGate(x));
    }
    assert.equal(worse,0,`${row.id}: worse than original frozen minima`);
    const corrected=statistics(before);assert.deepEqual(statistics(now).tail,corrected.tail);assert.equal(now.pValue,corrected.p);
    historical.push({id:row.id,workers:row.workers,original_p:before.pValue,original_p_with_roundoff_ties:corrected.p,fixed_p:now.pValue,better_minima:better,worse_minima:worse});
  }
  for(const id of new Set(d.runs.map(r=>r.id)))for(const stage of ['reference','optimized']) {
    const results=d.runs.filter(r=>r.id===id).map(r=>structuredClone(r[stage]));
    assert.equal(results.length,2);
    for(const r of results){delete r.execution;delete r.options.workers;}
    assert.deepEqual(results[0],results[1]);
  }
}
const wasmPath=`${root}/ftest-fixed-wasm.json`,wasm=read(wasmPath);files.add(wasmPath);assert.ok(wasm.passed);assert.equal(wasm.runs.length,5);
for(const [p,h] of Object.entries(wasm.hashes)){assert.equal(sha(p),h,p);files.add(p);}
const wasmRows=wasm.runs.map(r=>{for(const f of [r.reference,r.optimized])checkResult(f,199);return {id:r.id,...compare(r.reference,r.optimized)};});
const checks={};
for(const [name,path,count]of [['regression','/tmp/mossa-ftest-fix-all-tests.log',459],['native','/tmp/mossa-ftest-fix-native-tests.log',20]]) {
  const s=readFileSync(path,'utf8');assert.match(s,new RegExp(`tests ${count}`));assert.match(s,new RegExp(`pass ${count}`));assert.match(s,/fail 0/);checks[name]={passed:count,failed:0,log_sha256:sha(path)};
}
const web='/tmp/mossa-ftest-fix-web.log';assert.match(readFileSync(web,'utf8'),/built in/);checks.web_build={passed:true,log_sha256:sha(web)};
const receipt={date:new Date().toISOString(),passed:true,native_comparisons:rows.length,wasm_comparisons:wasmRows.length,worker_count_determinism_bit_exact:true,
  objective_gate:'Unchanged max(1e-7, 1e-8 * reference objective)',tie_rule:'64 * Number.EPSILON * max(abs(relevant objectives)); normalized zero improvements and inclusive tied tails; invariant to objective units',rows,wasm:wasmRows,historical_reference:historical,checks,
  hashes:Object.fromEntries([...files].sort().map(p=>[p,sha(p)]))};
writeFileSync(`${root}/ftest-fixed-verification.json`,JSON.stringify(receipt,null,2)+'\n');
console.log(`Verified ${rows.length} native and ${wasmRows.length} WASM comparisons: matching minima/ranks, observed std, tail decisions, p-values and intervals; no worse historical minima. Worker counts bit exact. PASS.`);
