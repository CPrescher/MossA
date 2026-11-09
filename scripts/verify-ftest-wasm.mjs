// Scientific replay through the same synchronous fitting path as browser workers.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runComparison,improvementExceeds,acceptableFit} from '../src/comparison.ts';
import {fitMultiStart} from '../src/multistart.mjs';
import {compareAnalytical} from './analytical-validation.mjs';
import {ftestBenchmarkCases} from './ftest-benchmark-cases.mjs';
const baseline='validation-data/performance/runtime/analytical/baseline';
const paths={reference:baseline,optimized:'src/wasm'},cores={};
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
for(const [k,path]of Object.entries(paths)) {
  const core=await import(`../${path}/mossa_core.js`);
  await core.default({module_or_path:readFileSync(`${path}/mossa_core_bg.wasm`)});cores[k]=core;
}
const cases=ftestBenchmarkCases(p=>JSON.parse(cores.reference.evaluate_json(JSON.stringify(p))),199).filter(c=>c.simpler.mode==='thin');
const files=['scripts/verify-ftest-wasm.mjs','scripts/ftest-benchmark-cases.mjs','scripts/analytical-validation.mjs','src/comparison.ts','src/multistart.mjs','src/types.ts','src/nuclear-constants.mjs',...Object.values(paths).flatMap(p=>[`${p}/mossa_core.js`,`${p}/mossa_core_bg.wasm`])];
const report={date:new Date().toISOString(),method:'Untimed fixed-seed end-to-end WASM scientific replay, using production comparison state machine and synchronous browser-worker fitting/finalization path. Node WASM execution; not a browser performance measurement.',hashes:Object.fromEntries(files.map(p=>[p,sha(p)])),runs:[]};
const output='validation-data/performance/ftest-fixed-wasm.json';
for(const c of cases) {
  const results={};
  for(const [k,core]of Object.entries(cores)) {
    const evaluate=p=>JSON.parse(core.evaluate_json(JSON.stringify(p)));
    const fit=(p,algorithm='trf')=>fitMultiStart(p,q=>JSON.parse((algorithm==='bounded-lm'?core.fit_recovery_json:core.fit_json_with_progress)(JSON.stringify(q),()=>{})),evaluate,undefined,q=>JSON.parse(core.finalize_fit_json(JSON.stringify(q))));
    results[k]=runComparison(c.simpler,c.larger,c.options,fit,evaluate);
  }
  const a=results.reference,b=results.optimized,failures=[];
  for(const model of ['simpler','larger']) {
    const q=compareAnalytical(a[model],b[model]);
    if(!q.passed||!q.same_minimum)failures.push(`${model}: observed minimum/std`);
  }
  let maxDelta=0;
  for(let i=0;i<c.options.simulations;i++)for(const model of ['simpler','larger']) {
    const x=a.diagnostics[i][model],y=b.diagnostics[i][model],delta=Math.abs(x.objective-y.objective);
    maxDelta=Math.max(maxDelta,delta);
    if(delta>Math.max(1e-7,1e-8*x.objective)||x.rank!==y.rank||x.free_parameters!==y.free_parameters)failures.push(`${i}:${model}: minimum/rank`);
    assert.ok(acceptableFit(x)&&acceptableFit(y));
  }
  const tail=r=>r.improvements.map((v,i)=>improvementExceeds(v,r.improvement,r.simpler.evaluation.objective,r.larger.evaluation.objective,r.diagnostics[i].simpler.objective,r.diagnostics[i].larger.objective));
  assert.deepEqual(tail(a),tail(b));assert.equal(a.pValue,b.pValue);assert.equal(a.exceedances,b.exceedances);assert.deepEqual(a.monteCarloInterval,b.monteCarloInterval);
  report.runs.push({id:c.id,passed:!failures.length,failures,max_simulation_objective_delta:maxDelta,p_values:[a.pValue,b.pValue],reference:a,optimized:b});
  writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(`${c.id}: p=${a.pValue}/${b.pValue}, ${failures.length?'FAIL':'PASS'}`);
}
report.passed=report.runs.every(r=>r.passed);writeFileSync(output,JSON.stringify(report,null,2)+'\n');if(!report.passed)process.exitCode=1;
