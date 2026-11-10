// Paired full-fit benchmarks against the frozen analytical fitter and each stage.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {NativeFixture} from '../tests/native-transport.ts';
import {fitMultiStartAsync} from '../src/multistart.mjs';
import {compareAnalytical} from './analytical-validation.mjs';
import {variableProjectionCases} from './variable-projection-cases.mjs';
import {acceptableFit} from '../src/comparison.ts';
const args=process.argv.slice(2),option=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const stage=option('--stage','variable-projection'), repeats=Number(option('--repeats','5')), search=args.includes('--search');
const runtime='validation-data/performance/runtime/variable-projection';
const referencePath=option('--reference',`${runtime}/baseline/native_fixture`);
const currentPath=option('--current','rust-core/target/release/examples/native_fixture');
const baseline=new NativeFixture(resolve(referencePath)),current=new NativeFixture(resolve(currentPath));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const out=option('--output',`validation-data/performance/${stage}-${search?'search':'native'}.json`);
const sources=['rust-core/src/lib.rs','rust-core/src/variable_projection.rs','rust-core/src/analytical.rs','rust-core/src/parallel.rs','rust-core/src/native/derivatives.rs','rust-core/Cargo.lock','scripts/benchmark-variable-projection.mjs','scripts/variable-projection-cases.mjs','scripts/analytical-validation.mjs','src/multistart.mjs',referencePath,currentPath];
const report={date:new Date().toISOString(),stage,repeats,cpu:cpus()[0].model,node:process.version,method:'Frozen joint analytical fitter versus bounded thin variable projection. Full-coordinate covariance is retained. One excluded warmup, alternating paired full-fit wall times including native JSON transport and uncertainty finalization. Original candidate policy, coordinates, bounds, weighting, solver tolerances and uncertainty gates. Each sample is deterministic. Compare minima/std, then finalize at identical original optimizer coordinates with reference analytical and current numerical Jacobians.',hashes:Object.fromEntries(sources.map(p=>[p,hash(p)])),runs:[]};
const save=()=>writeFileSync(out,JSON.stringify(report,null,2)+'\n');
const executions=new WeakMap();
async function compute(f,operation,project,state){const response=await f.transport.invoke('native_compute',{session:'variable-projection',operation,project,...(state?{state}:{})});assert.equal(response.execution.fallback,undefined);const active=executions.get(f);if(active){active.derivative_workers=Math.max(active.derivative_workers,response.execution.derivative_workers);if(response.execution.projected_parameters!==undefined&&!active.projected_parameters.includes(response.execution.projected_parameters))active.projected_parameters.push(response.execution.projected_parameters);if(response.execution.projection_fallback)active.projection_fallbacks.push(response.execution.projection_fallback);}return response.result;}
async function run(f,p,calibration=false){const execution={derivative_workers:1,projected_parameters:[],projection_fallbacks:[]};executions.set(f,execution);let pending;const t=performance.now();const result=search?await fitMultiStartAsync(p,q=>compute(f,'fit',q),q=>compute(f,'evaluate',q),undefined,q=>{pending=q;return compute(f,'finalize-fit',q.project,q.state);}):await compute(f,calibration?'fit-source':'fit',p);return {result,ms:performance.now()-t,pending,execution};}
try {
 for(const f of [baseline,current])await f.transport.invoke('native_compute_start',{session:'variable-projection'});
 const wasm=await import(`../${runtime}/baseline/mossa_core.js`);await wasm.default({module_or_path:readFileSync(`${runtime}/baseline/mossa_core_bg.wasm`)});
 const evaluate=p=>JSON.parse(wasm.evaluate_json(JSON.stringify(p))),source=p=>JSON.parse(wasm.evaluate_source_json(JSON.stringify(p)));
 let cases=variableProjectionCases(evaluate,source);
 if(search)cases=cases.filter(c=>['MS_Fe2O3-Fe3O4_30-70_coarse','MS-Fe2O3-Fe3O4_70-30_coarse','MS_MexicanMagnetite_coarse','xvbf-thin-mixture'].includes(c.id)).flatMap(c=>['full','selective'].map(strategy=>({...c,id:c.id+'-'+strategy,project:{...c.project,search_starts:Number(option('--starts','4')),search_strategy:strategy}})));
 if(args.includes('--case'))cases=cases.filter(c=>c.id.includes(option('--case','')));
 assert.ok(cases.length);
 for(const c of cases){
  const p={...c.project};delete p.derivative_method;delete p.thin_solver;
  const projected={...p,thin_solver:'variable_projection'};
  const expected=await run(baseline,p,c.calibration);
  const joint=await run(current,{...p,thin_solver:'joint'},c.calibration);delete joint.result.project.thin_solver;assert.deepEqual(joint.result,expected.result,`${c.id}: joint reference regression`);
  const warm=await run(current,projected,c.calibration),quality=compareAnalytical(expected.result,warm.result);
  if(!quality.same_minimum){quality.passed=false;quality.failures.push('different-minimum');}
  if(acceptableFit(expected.result)&&!acceptableFit(warm.result)){quality.passed=false;quality.failures.push('lost-convergence');}
  assert.deepEqual(Object.keys(warm.result.errors).sort(),Object.keys(expected.result.errors).sort());
  assert.equal(warm.result.dof,expected.result.dof);assert.equal(warm.result.free_parameters,expected.result.free_parameters);
  const samples={reference:[],optimized:[]};
  for(let i=0;i<repeats;i++)for(const mode of i%2?['optimized','reference']:['reference','optimized']){
   const r=await run(mode==='optimized'?current:baseline,mode==='optimized'?projected:p,c.calibration);
   assert.deepEqual(r.result,mode==='optimized'?warm.result:expected.result,`${c.id}: nondeterminism`);samples[mode].push(r.ms);
  }
  const pending=warm.pending??(await compute(current,c.calibration?'fit-source':'fit',{...projected,search_defer_uncertainties:true})).finalization;
  assert.ok(pending);
  const atPoint=await compute(current,'finalize-fit',pending.project,pending.state);
  if(!search)assert.deepEqual(atPoint,warm.result);
  const oldAtPoint=await compute(baseline,'finalize-fit',pending.project,pending.state);
  const samePoint=compareAnalytical(oldAtPoint,atPoint);
  const numericalAtPoint=await compute(current,'finalize-fit',{...pending.project,derivative_method:'numerical'},pending.state);
  const numericalPoint=compareAnalytical(numericalAtPoint,atPoint);
  const row={id:c.id,calibration:!!c.calibration,initial_project:p,projected_project:projected,joint_reference_exact:true,...quality,same_point_uncertainties:samePoint,numerical_point_uncertainties:numericalPoint,execution:{reference:expected.execution,optimized:warm.execution},reference_ms:median(samples.reference),optimized_ms:median(samples.optimized),speedup:median(samples.reference)/median(samples.optimized),samples_ms:samples,reference:expected.result,analytical:warm.result};
  report.runs.push(row);save();console.log(`${c.id}: ${row.reference_ms.toFixed(2)} -> ${row.optimized_ms.toFixed(2)} ms (${row.speedup.toFixed(2)}x); ${quality.passed&&samePoint.passed&&numericalPoint.passed?'PASS':JSON.stringify([quality.failures,samePoint.failures,numericalPoint.failures])}`);
 }
 report.passed=report.runs.every(r=>r.passed&&r.same_point_uncertainties.passed&&r.numerical_point_uncertainties.passed);save();if(!report.passed)process.exitCode=1;
}finally{await baseline.close();await current.close();}
