import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import init,{evaluate_json,evaluate_source_json,fit_json,fit_json_with_progress,fit_recovery_json,FitSession,fit_parallel_json,finalize_fit_json} from '../src/wasm/mossa_core.js';
import {variableProjectionCases} from '../scripts/variable-projection-cases.mjs';
import {compareAnalytical} from '../scripts/analytical-validation.mjs';
import {fitMultiStart} from '../src/multistart.mjs';
await init({module_or_path:readFileSync('src/wasm/mossa_core_bg.wasm')});
const evaluate=p=>JSON.parse(evaluate_json(JSON.stringify(p))),source=p=>JSON.parse(evaluate_source_json(JSON.stringify(p))),fit=p=>JSON.parse(fit_json(JSON.stringify(p))),finalize=p=>JSON.parse(finalize_fit_json(JSON.stringify(p)));
const cases=variableProjectionCases(evaluate,source);
for(const c of cases)test(`thin variable projection retains minimum/std: ${c.id}`,()=>{
 const p={...c.project,thin_solver:'variable_projection'},expected=fit({...c.project,thin_solver:'joint'}),actual=fit(p);
 const quality=compareAnalytical(expected,actual);assert.ok(quality.passed&&quality.same_minimum,JSON.stringify(quality));
 assert.equal(actual.free_parameters,expected.free_parameters);assert.equal(actual.dof,expected.dof);
 assert.deepEqual(Object.keys(actual.errors).sort(),Object.keys(expected.errors).sort());
 const pending=fit({...p,search_defer_uncertainties:true}).finalization;
 assert.equal(pending.state.x.length,actual.free_parameters,'finalization coordinates include eliminated coefficients');
 assert.deepEqual(finalize(pending),actual);
 const joint=finalize({...pending,project:{...pending.project,thin_solver:'joint'}});
 assert.deepEqual(joint.errors,actual.errors);assert.equal(joint.rank,actual.rank);assert.deepEqual(joint.intensity_fractions,actual.intensity_fractions);
});
test('projected checkpoint, synchronous callbacks, and progress use complete coordinates and identical results',()=>{
 for(const id of ['Doublet-PseudoVoigt','bounded-intensity','linear-only','rank-deficient-areas','MS-Fe2O3-Fe3O4_70-30_coarse']){
  const p={...cases.find(c=>c.id===id).project,thin_solver:'variable_projection'},expected=fit(p),session=new FitSession(JSON.stringify(p),false);
  assert.ok(session.projected_parameters>0||id==='rank-deficient-areas');
  try{let actual;for(let i=0;i<2000;i++){const state=JSON.parse(session.advance());assert.notEqual(state.kind,'derivatives');if(state.kind==='done'){actual=state.result;break;}const progress=JSON.parse(session.progress());assert.equal(progress.evaluation.y.length,p.spectrum.y.length);assert.deepEqual(progress.evaluation,evaluate(progress.project));}assert.deepEqual(actual,expected);}finally{session.free();}
  let callbacks=0;assert.deepEqual(JSON.parse(fit_json_with_progress(JSON.stringify(p),json=>{callbacks++;const progress=JSON.parse(json);assert.deepEqual(progress.evaluation,evaluate(progress.project));})),expected);assert.ok(callbacks>0);
  assert.deepEqual(JSON.parse(fit_parallel_json(JSON.stringify(p),false,()=>{throw Error('unexpected numerical columns');},()=>{})),expected);
 }
});
test('projected full/selective searches finalize once without changing eager results or total DOF',()=>{
 const base=cases.find(c=>c.id==='Doublet-PseudoVoigt').project;
 for(const search_strategy of ['full','selective']){
  const p={...base,thin_solver:'variable_projection',search_strategy,search_starts:4};
  let count=0;const expected=fitMultiStart(p,fit,evaluate),actual=fitMultiStart(p,fit,evaluate,undefined,p=>{count++;return finalize(p);});
  assert.deepEqual(actual,expected);assert.equal(count,1);
 }
});
test('explicit numerical and recovery solvers retain the joint reference and invalid selections are rejected',()=>{
 const p=cases.find(c=>c.id==='Doublet-Lorentzian').project;
 for(const method of [fit_json,fit_recovery_json]){
  const project={...p,...(method===fit_json?{derivative_method:'numerical'}:{})};
  const expected=JSON.parse(method(JSON.stringify(project))),actual=JSON.parse(method(JSON.stringify({...project,thin_solver:'variable_projection'})));
  delete actual.project.thin_solver;assert.deepEqual(actual,expected);
 }
 assert.throws(()=>fit({...p,thin_solver:'unknown'}),/unknown variant/);
 const short={...p,thin_solver:'variable_projection',max_iterations:1},result=fit(short);assert.ok(result.iterations<=1);assert.ok(result.evaluation.objective<=evaluate(short).objective);
});

test('omitted thin solver uses exactly the explicit variable-projection fit, including full uncertainties',()=>{
 for(const c of cases){
  const p={...c.project};delete p.thin_solver;
  const expected=fit({...p,thin_solver:'variable_projection'}),actual=fit(p);
  delete expected.project.thin_solver;assert.deepEqual(actual,expected,c.id);
 }
 const p={...cases.find(c=>c.id==='Doublet-PseudoVoigt').project};delete p.thin_solver;
 for(const thin_solver of [undefined,'joint']){
  const session=new FitSession(JSON.stringify({...p,thin_solver}),false);
  try{assert.equal(session.projected_parameters>0,thin_solver!=='joint');}finally{session.free();}
 }
});
