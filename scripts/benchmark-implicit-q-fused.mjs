import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {cpus} from 'node:os';
import {NativeFixture} from '../tests/native-transport.ts';
import {fitMultiStartAsync} from '../src/multistart.mjs';
import {compareAnalytical} from './analytical-validation.mjs';
import {acceptableFit} from '../src/comparison.ts';
import {solverLinearAlgebraCases} from './solver-linear-algebra-cases.mjs';
const args=process.argv.slice(2),opt=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const runtime='validation-data/performance/runtime/implicit-q-fused',stages=opt('--stages','baseline,implicit').split(','),repeats=Number(opt('--repeats','3')),search=args.includes('--search');
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const paths=stages.map(s=>`${runtime}/${s}/native_fixture`),fixtures=Object.fromEntries(stages.map((s,i)=>[s,new NativeFixture(resolve(paths[i]))]));
const sources=['rust-core/src/lib.rs','rust-core/src/parallel.rs','rust-core/src/variable_projection.rs','rust-core/src/analytical.rs','rust-core/src/analytical/projection.rs','rust-core/src/analytical/distribution.rs','rust-core/vendor/basin/src/core/math/dense.rs','rust-core/vendor/basin/src/core/math/dense_svd.rs','rust-core/vendor/basin/src/core/math/dense_svd/qr.rs','rust-core/vendor/basin/src/core/convergence/builders.rs','scripts/transmission-analytical-cases.mjs','scripts/source-xvbf-analytical-cases.mjs','rust-core/vendor/basin/src/solver/trust_region_reflective.rs','scripts/benchmark-implicit-q-fused.mjs','scripts/solver-linear-algebra-cases.mjs','scripts/analytical-validation.mjs','src/multistart.mjs'];
const report={date:new Date().toISOString(),cpu:cpus()[0].model,node:process.version,stages,repeats,method:'Excluded per-stage warmup; alternating paired complete production fits, identical defaults/search policies/bounds/scales/tolerances. Implicit-Q and fused-Jacobian stages use unchanged minimum/std gates, rank/DOF/availability and convergence checks. Original full covariance and same-coordinate analytical/numerical controls. Archive binaries and current source hashes retained. No builds/tests/browser timing overlap.',hashes:Object.fromEntries([...sources,...paths].map(p=>[p,sha(p)])),runs:[]};
const out=opt('--output',`validation-data/performance/implicit-q-fused-${stages.at(-1)}-${search?'search':'native'}.json`),save=()=>writeFileSync(out,JSON.stringify(report,null,2)+'\n');
const core=await import(`../${runtime}/baseline/mossa_core.js`);await core.default({module_or_path:readFileSync(`${runtime}/baseline/mossa_core_bg.wasm`)});
const evaluate=p=>JSON.parse(core.evaluate_json(JSON.stringify(p))),source=p=>JSON.parse(core.evaluate_source_json(JSON.stringify(p)));
let cases=solverLinearAlgebraCases(evaluate,source);
if(search)cases=cases.filter(c=>['MS_MexicanMagnetite_coarse','MS-Fe2O3-Fe3O4_70-30_coarse','ordinary-MS_MexicanMagnetite_transmission','xvbf-transmission-mixture'].includes(c.id)).flatMap(c=>['full','selective'].map(strategy=>({...c,id:c.id+'-'+strategy,project:{...c.project,search_starts:Number(opt('--starts','4')),search_strategy:strategy}})));
if(args.includes('--case'))cases=cases.filter(c=>c.id.includes(opt('--case','')));assert.ok(cases.length);
async function compute(f,operation,project,state){const r=await f.transport.invoke('native_compute',{session:'solver-bench',operation,project,...(state?{state}:{})});assert.equal(r.execution.fallback,undefined);return r.result;}
async function run(stage,c){let pending;const f=fixtures[stage],t=performance.now();const result=search?await fitMultiStartAsync(c.project,p=>compute(f,'fit',p),p=>compute(f,'evaluate',p),undefined,p=>{pending=p;return compute(f,'finalize-fit',p.project,p.state);}):await compute(f,c.calibration?'fit-source':'fit',c.project);return {result,pending,ms:performance.now()-t};}
function quality(a,b){const q=compareAnalytical(a,b);if(!q.same_minimum){q.passed=false;q.failures.push('different-minimum');}if(acceptableFit(a)&&!acceptableFit(b)){q.passed=false;q.failures.push('lost-convergence');}assert.equal(a.dof,b.dof);assert.equal(a.free_parameters,b.free_parameters);assert.deepEqual(Object.keys(a.errors).sort(),Object.keys(b.errors).sort());return q;}
try{
 for(const f of Object.values(fixtures))await f.transport.invoke('native_compute_start',{session:'solver-bench'});
 for(const c of cases){
  const warm={},samples={};for(const s of stages){warm[s]=await run(s,c);samples[s]=[];}

  for(let i=0;i<repeats;i++)for(const s of i%2?[...stages].reverse():stages){const r=await run(s,c);assert.deepEqual(r.result,warm[s].result,`${c.id}:${s}: nondeterminism`);samples[s].push(r.ms);}
  const pairs=stages.slice(1).map((s,i)=>[stages[i],s]);if(stages.length>2)pairs.push([stages[0],stages.at(-1)]);
  for(const [from,to]of pairs){
   const f=fixtures[to],w=warm[to];const pending=w.pending??(await compute(f,c.calibration?'fit-source':'fit',{...c.project,search_defer_uncertainties:true})).finalization;
   const at=await compute(f,'finalize-fit',pending.project,pending.state),old=await compute(fixtures[from],'finalize-fit',pending.project,pending.state),numeric=await compute(f,'finalize-fit',{...pending.project,derivative_method:'numerical'},pending.state);
   assert.deepEqual(at.errors,old.errors,`${c.id}: same-coordinate covariance changed`);assert.deepEqual(at.intensity_fractions,old.intensity_fractions);assert.equal(at.rank,old.rank);
   const q=quality(warm[from].result,w.result),same=quality(old,at),numerical=quality(numeric,at);
   const row={id:c.id,project:c.project,calibration:!!c.calibration,from_stage:from,to_stage:to,...q,same_point_uncertainties:same,numerical_point_uncertainties:numerical,reference_ms:median(samples[from]),optimized_ms:median(samples[to]),speedup:median(samples[from])/median(samples[to]),samples_ms:{reference:samples[from],optimized:samples[to]},reference:warm[from].result,analytical:w.result};
   report.runs.push(row);save();console.log(`${c.id} ${from}->${to}: ${row.reference_ms.toFixed(2)} -> ${row.optimized_ms.toFixed(2)} ms; ${q.passed&&same.passed&&numerical.passed?'PASS':JSON.stringify([q.failures,same.failures,numerical.failures])}`);
  }
 }
 report.passed=report.runs.every(r=>r.passed&&r.same_point_uncertainties.passed&&r.numerical_point_uncertainties.passed);save();if(!report.passed)process.exitCode=1;
}finally{for(const f of Object.values(fixtures))await f.close();}
