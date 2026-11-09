import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import init,{evaluate_json,fit_json,fit_json_with_progress,fit_recovery_json,FitSession,fit_parallel_json,finalize_fit_json} from '../src/wasm/mossa_core.js';
import {fitMultiStart} from '../src/multistart.mjs';
import {compareAnalytical} from '../scripts/analytical-validation.mjs';
await init({module_or_path:readFileSync('src/wasm/mossa_core_bg.wasm')});
const cases=['transmission-performance.json','transmission-measured-performance.json'].flatMap(f=>JSON.parse(readFileSync('tests/fixtures/'+f)).cases).filter(c=>c.project.mode==='transmission'&&!c.calibration&&c.project.sites.every(s=>!s.xvbf));
const local=p=>JSON.parse(fit_json(JSON.stringify(p))),evaluate=p=>JSON.parse(evaluate_json(JSON.stringify(p))),finalize=p=>JSON.parse(finalize_fit_json(JSON.stringify(p)));
for(const c of cases)test(`default analytical transmission retains minimum and std: ${c.id}`,()=>{
 const actual=local(c.project),quality=compareAnalytical(c.result,actual);assert.deepEqual(quality.failures,[],JSON.stringify(quality));
 const numeric=local({...c.project,derivative_method:'numerical'});delete numeric.project.derivative_method;assert.deepEqual(numeric,c.result);
 // A real FFT uses a different floating-point factorization. Keep the
 // explicit numerical/complex reference exact; qualify default curves at a
 // fixed roundoff-scale tolerance, independently of the unchanged fit/std gates.
 assert.deepEqual(evaluate({...c.project,derivative_method:'numerical'}),c.initial_evaluation);
 const forward=evaluate(c.project),reference=c.initial_evaluation;
 for(const field of ['parameters','background','components'])assert.deepEqual(forward[field],reference[field]);
 const countScale=Math.max(1,...reference.y.map(Math.abs));
 for(const field of ['y','residual'])forward[field].forEach((v,i)=>assert.ok(Math.abs(v-reference[field][i])<=64*Number.EPSILON*countScale,`${field}[${i}]: FFT roundoff`));
 for(const field of ['sse','objective'])assert.ok(Math.abs(forward[field]-reference[field])<=128*Number.EPSILON*Math.max(1,Math.abs(reference[field])),`${field}: FFT roundoff`);
 const pending=local({...c.project,search_defer_uncertainties:true}).finalization;
 assert.deepEqual(finalize(pending),actual);
 const numericalAtPoint=finalize({...pending,project:{...pending.project,derivative_method:'numerical'}});
 assert.deepEqual(compareAnalytical(numericalAtPoint,actual).failures,[]);
});
test('default transmission checkpoint, callback, and progress paths use the same analytical results',()=>{
 for(const id of ['three-sites-squared-source','asymmetric-gaussian-source','linked-parameters']){
  const c=cases.find(c=>c.id===id),expected=local(c.project),json=JSON.stringify(c.project),session=new FitSession(json,false);
  try{let actual;for(let i=0;i<2000;i++){const state=JSON.parse(session.advance());assert.notEqual(state.kind,'derivatives');if(state.kind==='done'){actual=state.result;break;}}assert.deepEqual(actual,expected);}finally{session.free();}
  assert.deepEqual(JSON.parse(fit_parallel_json(json,false,()=>{throw Error('unexpected helper request');},()=>{})),expected);
  let progress=0;assert.deepEqual(JSON.parse(fit_json_with_progress(json,state=>{progress++;evaluate(JSON.parse(state).project);})),expected);assert.ok(progress>0);
 }
});
test('analytical transmission full searches retain eager and deferred std exactly',()=>{
 const p={...cases.find(c=>c.id==='three-sites-squared-source').project,search_starts:4};
 for(const search_strategy of ['full']){
  const project={...p,search_strategy},expected=fitMultiStart(project,local,evaluate);
  assert.deepEqual(fitMultiStart(project,local,evaluate,undefined,finalize),expected);
 }
});
test('transmission iteration limits, recovery, fixed models and rank-deficient areas retain finalization',()=>{
 const base=structuredClone(cases[0].project);
 const fixed=structuredClone(base);fixed.sites.forEach(s=>Object.values(s.params).forEach(p=>p.fit=false));fixed.background.forEach(p=>p.fit=false);
 const rank=structuredClone(base);rank.sites=[structuredClone(rank.sites[0]),structuredClone(rank.sites[0])];rank.sites.forEach(s=>Object.entries(s.params).forEach(([key,p])=>p.fit=key==='intensity'));
 for(const project of [{...base,max_iterations:1},fixed,rank])for(const fit of [fit_json,fit_recovery_json]){
  const expected=JSON.parse(fit(JSON.stringify(project))),trial=JSON.parse(fit(JSON.stringify({...project,search_defer_uncertainties:true})));
  assert.deepEqual(finalize(trial.finalization),expected);
 }
 assert.ok(local(rank).errors['site:0:intensity']===null);
});
