import {test}from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync}from 'node:fs';
import init,{fit_json,fit_source_json,evaluate_json,evaluate_source_json,FitSession,fit_parallel_json,finalize_fit_json}from '../src/wasm/mossa_core.js';
import {compareAnalytical}from '../scripts/analytical-validation.mjs';
import {sourceXvbfCases}from '../scripts/source-xvbf-analytical-cases.mjs';
import {fitMultiStart}from '../src/multistart.mjs';
await init({module_or_path:readFileSync('src/wasm/mossa_core_bg.wasm')});
const evaluate=p=>JSON.parse(evaluate_json(JSON.stringify(p))),evaluateSource=p=>JSON.parse(evaluate_source_json(JSON.stringify(p)));
const local=(p,cal=false)=>JSON.parse((cal?fit_source_json:fit_json)(JSON.stringify(p))),finalize=p=>JSON.parse(finalize_fit_json(JSON.stringify(p)));
const cases=sourceXvbfCases(evaluate,evaluateSource);
for(const c of cases)test(`source/xVBF analytical minima, std and deferred finalization: ${c.id}`,()=>{
 const actual=local(c.project,c.calibration),numerical=local({...c.project,derivative_method:'numerical'},c.calibration);
 const q=compareAnalytical(numerical,actual);assert.deepEqual(q.failures,[],JSON.stringify(q));
 const pending=local({...c.project,search_defer_uncertainties:true},c.calibration).finalization;
 assert.deepEqual(finalize(pending),actual);
 const atPoint=finalize({...pending,project:{...pending.project,derivative_method:'numerical'}});
 assert.deepEqual(compareAnalytical(atPoint,actual).failures,[]);
});
test('source/xVBF checkpoint and synchronous callback paths require no numerical helper requests',()=>{
 for(const id of ['source-calibration-gaussian-2','source-calibration-squared','xvbf-transmission-mixture','xvbf-thin-mixture','xvbf-perfect-correlation']){
  const c=cases.find(c=>c.id===id),json=JSON.stringify(c.project),expected=local(c.project,c.calibration),session=new FitSession(json,c.calibration);
  try{let actual;for(let i=0;i<2000;i++){const s=JSON.parse(session.advance());assert.notEqual(s.kind,'derivatives');if(s.kind==='done'){actual=s.result;break;}}assert.deepEqual(actual,expected);}finally{session.free();}
  assert.deepEqual(JSON.parse(fit_parallel_json(json,c.calibration,()=>{throw Error('unexpected numerical helper request');},()=>{})),expected);
 }
});
test('xVBF full/selective searches preserve eager and deferred winning covariance',()=>{
 const c=cases.find(c=>c.id==='xvbf-transmission-mixture');
 for(const search_strategy of ['full','selective']){const p={...c.project,search_starts:4,search_strategy},expected=fitMultiStart(p,p=>local(p),evaluate);assert.deepEqual(fitMultiStart(p,p=>local(p),evaluate,undefined,finalize),expected);}
});
