// node --import tsx scripts/benchmark-ftest.mjs [--repeats 3] [--simulations 199]
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {cpus} from 'node:os';
import {NativeFixture} from '../tests/native-transport.ts';
import {NativeSession} from '../src/native-session.ts';
import {startComparison} from '../src/native-comparison.ts';
import {compareAnalytical} from './analytical-validation.mjs';
import {ftestBenchmarkCases} from './ftest-benchmark-cases.mjs';

const args=process.argv.slice(2),opt=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const repeats=Number(opt('--repeats','3')),simulations=Number(opt('--simulations','199'));
assert.ok(Number.isInteger(repeats)&&repeats>0);
const baseline=opt('--baseline','validation-data/performance/runtime/analytical/baseline');
const optimizedMode=opt('--optimized-mode','default');
assert.ok(['default','joint','numerical'].includes(optimizedMode));
const binaries={reference:`${baseline}/native_fixture`,optimized:'rust-core/target/release/examples/native_fixture'};
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const core=await import(`../${baseline}/mossa_core.js`);
await core.default({module_or_path:readFileSync(`${baseline}/mossa_core_bg.wasm`)});
let cases=ftestBenchmarkCases(p=>JSON.parse(core.evaluate_json(JSON.stringify(p))),simulations);
if(args.includes('--case'))cases=cases.filter(c=>c.id.includes(opt('--case','')));
if(args.includes('--exclude'))cases=cases.filter(c=>!c.id.includes(opt('--exclude','')));
assert.ok(cases.length);
const workerCounts=opt('--workers','1,4').split(',').map(Number);
const paths=['scripts/benchmark-ftest.mjs','scripts/ftest-benchmark-cases.mjs','scripts/analytical-validation.mjs',
  'src/comparison.ts','src/native-comparison.ts','src/native-session.ts','src/comparison-workers.ts','src/multistart.mjs',
  'tests/native-transport.ts',`${baseline}/mossa_core_bg.wasm`,...Object.values(binaries)];
const report={date:new Date().toISOString(),cpu:cpus()[0].model,node:process.version,repeats,simulations,
  baseline:'Frozen numerical-default native core before analytical derivatives (analytical/baseline). Current production comparison orchestration and full search policy for both cores.',
  method:'Complete production native startComparison, including observed fits, seeded simulation generation, all recoveries and uncertainty finalization; JSON-lines native transport in place of Tauri IPC. One excluded warmup per stage; alternating paired timing. Same input projects, seeds, worker counts and acceptance/recovery policy. No failed simulations discarded. Objective tolerance max(1e-7,1e-8*reference); exact exceedance decisions, p-values, Monte Carlo intervals, dimensions and simulation ranks; established observed parameter/std gates. Repeats must be exactly deterministic within each core.',
  optimized_mode:optimizedMode,hashes:Object.fromEntries(paths.map(p=>[p,sha(p)])),cases,runs:[]};
const out=opt('--output','validation-data/performance/ftest-native.json');
const save=()=>writeFileSync(out,JSON.stringify(report,null,2)+'\n');
const fixtures=Object.fromEntries(Object.entries(binaries).map(([k,p])=>[k,new NativeFixture(resolve(p))]));
function quality(a,b) {
  const failures=[],objectives=[];
  for(const k of ['simpler','larger']) {
    const q=compareAnalytical(a[k],b[k]);
    if(!q.same_minimum||!q.passed)failures.push(`${k}: ${q.failures.join(',')||'different minimum'}`);
    assert.equal(a[k].dof,b[k].dof);assert.equal(a[k].free_parameters,b[k].free_parameters);
  }
  for(let i=0;i<a.diagnostics.length;i++)for(const k of ['simpler','larger']) {
    const x=a.diagnostics[i][k],y=b.diagnostics[i][k],delta=y.objective-x.objective;
    objectives.push({simulation:i,model:k,reference:x.objective,optimized:y.objective,delta});
    if(Math.abs(delta)>Math.max(1e-7,1e-8*x.objective))failures.push(`simulation ${i} ${k}: minimum`);
    if(x.rank!==y.rank||x.free_parameters!==y.free_parameters)failures.push(`simulation ${i} ${k}: rank/dimension`);
  }
  for(const k of ['pValue','exceedances','monteCarloInterval'])if(JSON.stringify(a[k])!==JSON.stringify(b[k]))failures.push(k);
  const tail=a.improvements.map((d,i)=>({index:i,reference:d>=a.improvement,optimized:b.improvements[i]>=b.improvement}));
  if(tail.some(v=>v.reference!==v.optimized))failures.push('tail classification');
  return {passed:!failures.length,failures,observed:{simpler:compareAnalytical(a.simpler,b.simpler),larger:compareAnalytical(a.larger,b.larger)},
    simulation_minima:objectives,
    better_simulation_minima:objectives.filter(v=>v.delta < -Math.max(1e-7,1e-8*v.reference)).length,
    worse_simulation_minima:objectives.filter(v=>v.delta > Math.max(1e-7,1e-8*v.reference)).length,
    max_simulation_objective_delta:Math.max(...objectives.map(v=>Math.abs(v.delta))),
    max_simulation_improvement_delta:Math.max(...a.improvements.map((v,i)=>Math.abs(v-b.improvements[i]))),
    exact_tail_classification:tail.every(v=>v.reference===v.optimized),p_values:[a.pValue,b.pValue],exceedances:[a.exceedances,b.exceedances]};
}
async function run(stage,c,workers) {
  const fixture=fixtures[stage],t=performance.now();
  const models=[c.simpler,c.larger].map(p=>stage==='reference'||optimizedMode==='default'?p:
    {...p,thin_solver:'joint',...(optimizedMode==='numerical'?{derivative_method:'numerical'}:{})});
  const job=startComparison(...models,{...c.options,workers},()=>{},()=>new NativeSession(fixture.transport));
  const result=await job.promise;
  assert.equal(result.improvements.length,simulations);
  assert.equal(result.diagnostics.length,simulations);
  return {result,ms:performance.now()-t};
}
try {
  for(const c of cases)for(const workers of workerCounts) {
    const warm={},samples={reference:[],optimized:[]};
    for(const stage of Object.keys(fixtures)) {
      console.log(`${c.id} workers=${workers}: warmup ${stage}`);
      warm[stage]=await run(stage,c,workers);
    }
    const q=quality(warm.reference.result,warm.optimized.result);
    for(let i=0;i<repeats;i++)for(const stage of i%2?['optimized','reference']:['reference','optimized']) {
      const r=await run(stage,c,workers);assert.deepEqual(r.result,warm[stage].result,`${c.id}:${stage}: nondeterminism`);
      samples[stage].push(r.ms);
    }
    const row={id:c.id,workers,...q,reference_ms:median(samples.reference),optimized_ms:median(samples.optimized),
      speedup:median(samples.reference)/median(samples.optimized),samples_ms:samples,
      reference:warm.reference.result,optimized:warm.optimized.result};
    report.runs.push(row);save();
    console.log(`${c.id} workers=${workers}: ${row.reference_ms.toFixed(1)} -> ${row.optimized_ms.toFixed(1)} ms (${row.speedup.toFixed(2)}x), p=${q.p_values.join('/')} ${q.passed?'PASS':`${q.failures.length} checks differ; worse minima=${q.worse_simulation_minima}`}`);
  }
  // Worker completion order must not change any scientific output.
  for(const c of cases)for(const stage of ['reference','optimized']) {
    const rows=report.runs.filter(r=>r.id===c.id);
    for(const row of rows.slice(1)) {
      const a=structuredClone(rows[0][stage]),b=structuredClone(row[stage]);
      delete a.execution;delete b.execution;delete a.options.workers;delete b.options.workers;
      assert.deepEqual(a,b,`${c.id}:${stage}: worker-count determinism`);
    }
  }
  report.passed=report.runs.every(r=>r.passed);save();if(!report.passed)process.exitCode=1;
} finally {for(const f of Object.values(fixtures))await f.close();}
