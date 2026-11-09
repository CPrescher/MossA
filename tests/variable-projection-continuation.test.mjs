import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import init,{evaluate_json,fit_json,fit_json_with_progress,FitSession,finalize_fit_json} from '../src/wasm/mossa_core.js';
import {compareAnalytical} from '../scripts/analytical-validation.mjs';
await init({module_or_path:readFileSync('src/wasm/mossa_core_bg.wasm')});
const {project,reference}=JSON.parse(readFileSync('tests/fixtures/variable-projection-slow-trial.json'));
const fit=p=>JSON.parse(fit_json(JSON.stringify(p))),evaluate=p=>JSON.parse(evaluate_json(JSON.stringify(p)));
test('slow projected trial retains its minimum/std and completes every coordinate after a joint continuation',()=>{
 const actual=fit(project),q=compareAnalytical(reference,actual);assert.ok(q.passed&&q.same_minimum,JSON.stringify(q));assert.ok(actual.iterations<200);assert.equal(actual.free_parameters,reference.free_parameters);assert.equal(actual.dof,reference.dof);
 const trial=fit({...project,search_defer_uncertainties:true});assert.equal(trial.finalization.state.x.length,actual.free_parameters);
 assert.deepEqual(JSON.parse(finalize_fit_json(JSON.stringify(trial.finalization))),actual);
});
test('checkpoint and callback continuations match uninterrupted fitting and preserve progress counters',()=>{
 const expected=fit(project),session=new FitSession(JSON.stringify(project),false);let previous=-1,actual;
 try{for(let i=0;i<1000;i++){const state=JSON.parse(session.advance());assert.notEqual(state.kind,'derivatives');if(state.kind==='done'){actual=state.result;break;}const p=JSON.parse(session.progress());assert.ok(p.iteration>=previous);previous=p.iteration;assert.deepEqual(p.evaluation,evaluate(p.project));}assert.equal(session.joint_continuations,1);assert.deepEqual(actual,expected);}finally{session.free();}
 previous=-1;let elapsed=-1;assert.deepEqual(JSON.parse(fit_json_with_progress(JSON.stringify(project),json=>{const p=JSON.parse(json);assert.ok(p.iteration>=previous);assert.ok(p.elapsed_ms>=elapsed);previous=p.iteration;elapsed=p.elapsed_ms;assert.deepEqual(p.evaluation,evaluate(p.project));})),expected);
});
test('continuation keeps short iteration limits and the pre-handoff incumbent',()=>{
 for(const max_iterations of [8,48,64,80]){const p={...project,max_iterations},actual=fit(p);assert.ok(actual.iterations<=max_iterations);assert.ok(actual.evaluation.objective<=evaluate(p).objective);}
});
