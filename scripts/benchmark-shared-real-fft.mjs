// Paired full-fit benchmarks against the frozen analytical fitter and each stage.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {NativeFixture} from '../tests/native-transport.ts';
import {fitMultiStartAsync} from '../src/multistart.mjs';
import {compareAnalytical, analyticalCases} from './analytical-validation.mjs';
import {sourceXvbfCases} from './source-xvbf-analytical-cases.mjs';
import {transmissionAnalyticalCases} from './transmission-analytical-cases.mjs';
import {acceptableFit} from '../src/comparison.ts';
const args=process.argv.slice(2),option=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const stage=option('--stage','shared'), repeats=Number(option('--repeats','5')), search=args.includes('--search');
const runtime='validation-data/performance/runtime/shared-real-fft';
const referencePath=option('--reference',`${runtime}/baseline/native_fixture`);
const currentPath=option('--current','rust-core/target/release/examples/native_fixture');
const baseline=new NativeFixture(resolve(referencePath)),current=new NativeFixture(resolve(currentPath));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const out=option('--output',`validation-data/performance/${stage}-evaluation-${search?'search':'native'}.json`);
const sources=['rust-core/src/lib.rs','rust-core/src/analytical.rs','rust-core/src/analytical/distribution.rs','rust-core/src/analytical/source.rs','rust-core/src/analytical/transmission.rs','rust-core/src/native/derivatives.rs','rust-core/Cargo.lock','scripts/benchmark-shared-real-fft.mjs','scripts/analytical-validation.mjs','scripts/transmission-analytical-cases.mjs','scripts/source-xvbf-analytical-cases.mjs','src/multistart.mjs',referencePath,currentPath];
const report={date:new Date().toISOString(),stage,repeats,cpu:cpus()[0].model,node:process.version,method:'Frozen default analytical baseline versus optimized default analytical fitter. One excluded warmup, alternating paired full-fit wall times including native JSON transport and uncertainty finalization. Original candidate policy, coordinates, bounds, weighting, solver tolerances and uncertainty gates. Each sample is deterministic. Compare minima/std, then finalize at identical original optimizer coordinates with reference analytical and current numerical Jacobians.',hashes:Object.fromEntries(sources.map(p=>[p,hash(p)])),runs:[]};
const save=()=>writeFileSync(out,JSON.stringify(report,null,2)+'\n');
const executions=new WeakMap();
async function compute(f,operation,project,state){const response=await f.transport.invoke('native_compute',{session:'shared-fft',operation,project,...(state?{state}:{})});assert.equal(response.execution.fallback,undefined);const active=executions.get(f);if(active)active.derivative_workers=Math.max(active.derivative_workers,response.execution.derivative_workers);return response.result;}
async function run(f,p,calibration=false){const execution={derivative_workers:1};executions.set(f,execution);let pending;const t=performance.now();const result=search?await fitMultiStartAsync(p,q=>compute(f,'fit',q),q=>compute(f,'evaluate',q),undefined,q=>{pending=q;return compute(f,'finalize-fit',q.project,q.state);}):await compute(f,calibration?'fit-source':'fit',p);return {result,ms:performance.now()-t,pending,execution};}
try {
 for(const f of [baseline,current])await f.transport.invoke('native_compute_start',{session:'shared-fft'});
 const wasm=await import(`../${runtime}/baseline/mossa_core.js`);await wasm.default({module_or_path:readFileSync(`${runtime}/baseline/mossa_core_bg.wasm`)});
 const evaluate=p=>JSON.parse(wasm.evaluate_json(JSON.stringify(p))),source=p=>JSON.parse(wasm.evaluate_source_json(JSON.stringify(p)));
 let cases=[...sourceXvbfCases(evaluate,source),...transmissionAnalyticalCases(evaluate).map(c=>({...c,id:'ordinary-'+c.id})),...analyticalCases(evaluate).filter(c=>c.id.endsWith('_coarse')||['linked-mixed-sites','rank-deficient-areas','Sextet-PseudoVoigt','Singlet-Gaussian'].includes(c.id)).map(c=>({...c,id:'thin-'+c.id}))];
 if(search)cases=cases.filter(c=>['xvbf-transmission-mixture','xvbf-thin-mixture','ordinary-MS_MexicanMagnetite_transmission','ordinary-three-sites-squared-source'].includes(c.id)).flatMap(c=>['full','selective'].map(strategy=>({...c,id:c.id+'-'+strategy,project:{...c.project,search_starts:Number(option('--starts','4')),search_strategy:strategy}})));
 if(args.includes('--case'))cases=cases.filter(c=>c.id.includes(option('--case','')));
 assert.ok(cases.length);
 for(const c of cases){
  const p={...c.project};delete p.derivative_method;
  const expected=await run(baseline,p,c.calibration),warm=await run(current,p,c.calibration),quality=compareAnalytical(expected.result,warm.result);
  if(!quality.same_minimum){quality.passed=false;quality.failures.push('different-minimum');}
  if(acceptableFit(expected.result)&&!acceptableFit(warm.result)){quality.passed=false;quality.failures.push('lost-convergence');}
  assert.deepEqual(Object.keys(warm.result.errors).sort(),Object.keys(expected.result.errors).sort());
  assert.equal(warm.result.dof,expected.result.dof);assert.equal(warm.result.free_parameters,expected.result.free_parameters);
  const samples={reference:[],optimized:[]};
  for(let i=0;i<repeats;i++)for(const mode of i%2?['optimized','reference']:['reference','optimized']){
   const r=await run(mode==='optimized'?current:baseline,p,c.calibration);
   assert.deepEqual(r.result,mode==='optimized'?warm.result:expected.result,`${c.id}: nondeterminism`);samples[mode].push(r.ms);
  }
  const pending=warm.pending??(await compute(current,c.calibration?'fit-source':'fit',{...p,search_defer_uncertainties:true})).finalization;
  assert.ok(pending);
  const atPoint=await compute(current,'finalize-fit',pending.project,pending.state);
  if(!search)assert.deepEqual(atPoint,warm.result);
  const oldAtPoint=await compute(baseline,'finalize-fit',pending.project,pending.state);
  const samePoint=compareAnalytical(oldAtPoint,atPoint);
  const numericalAtPoint=await compute(current,'finalize-fit',{...pending.project,derivative_method:'numerical'},pending.state);
  const numericalPoint=compareAnalytical(numericalAtPoint,atPoint);
  const row={id:c.id,calibration:!!c.calibration,initial_project:p,...quality,same_point_uncertainties:samePoint,numerical_point_uncertainties:numericalPoint,execution:{reference:expected.execution,optimized:warm.execution},reference_ms:median(samples.reference),optimized_ms:median(samples.optimized),speedup:median(samples.reference)/median(samples.optimized),samples_ms:samples,reference:expected.result,analytical:warm.result};
  report.runs.push(row);save();console.log(`${c.id}: ${row.reference_ms.toFixed(2)} -> ${row.optimized_ms.toFixed(2)} ms (${row.speedup.toFixed(2)}x); ${quality.passed&&samePoint.passed&&numericalPoint.passed?'PASS':JSON.stringify([quality.failures,samePoint.failures,numericalPoint.failures])}`);
 }
 report.passed=report.runs.every(r=>r.passed&&r.same_point_uncertainties.passed&&r.numerical_point_uncertainties.passed);save();if(!report.passed)process.exitCode=1;
}finally{await baseline.close();await current.close();}
