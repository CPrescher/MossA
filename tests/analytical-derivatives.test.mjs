import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import init,{fit_json,fit_source_json,fit_recovery_json,evaluate_json,FitSession,fit_parallel_json,finalize_fit_json} from '../src/wasm/mossa_core.js';
import {fitMultiStart} from '../src/multistart.mjs';
await init({module_or_path:readFileSync('src/wasm/mossa_core_bg.wasm')});
const p=structuredClone(JSON.parse(readFileSync('tests/fixtures/transmission-performance.json')).cases.find(c=>c.id==='thin-control').project);
p.derivative_method='analytical';
const fit=p=>JSON.parse(fit_json(JSON.stringify(p))),evaluate=p=>JSON.parse(evaluate_json(JSON.stringify(p))),finalize=p=>JSON.parse(finalize_fit_json(JSON.stringify(p)));
test('analytical derivatives agree across direct, checkpointed and callback fitting without numerical column requests',()=>{
 const expected=fit(p),session=new FitSession(JSON.stringify(p),false);
 try {
  let actual;
  for(let i=0;i<1000;i++) {const state=JSON.parse(session.advance());assert.notEqual(state.kind,'derivatives');if(state.kind==='done'){actual=state.result;break;}}
  assert.deepEqual(actual,expected);
  assert.deepEqual(JSON.parse(fit_parallel_json(JSON.stringify(p),false,()=>{throw new Error('unexpected numerical derivative request');},()=>{})),expected);
 }finally{session.free();}
});
test('analytical eager and deferred std are identical for full and selective multistart',()=>{
 for(const search_strategy of ['full','selective']) {
  const project={...p,search_starts:4,search_strategy};
  const expected=fitMultiStart(project,fit,evaluate);
  const actual=fitMultiStart(project,fit,evaluate,undefined,finalize);
  assert.deepEqual(actual,expected);assert.equal(actual.project.derivative_method,'analytical');
 }
});
test('analytical iteration-limited, fixed and bounded-LM fits retain their method through finalization',()=>{
 for(const method of [fit_json,fit_recovery_json])for(const max_iterations of [1,100]) {
  const project={...p,max_iterations},expected=JSON.parse(method(JSON.stringify(project)));
  const trial=JSON.parse(method(JSON.stringify({...project,search_defer_uncertainties:true})));
  assert.deepEqual(finalize(trial.finalization),expected);
 }
 const fixed=structuredClone(p);for(const s of fixed.sites)for(const v of Object.values(s.params))v.fit=false;fixed.background.forEach(v=>v.fit=false);
 assert.deepEqual(finalize(fit({...fixed,search_defer_uncertainties:true}).finalization),fit(fixed));
});
test('explicit analytical requests match default distribution and source-calibration results',()=>{
 const cases=JSON.parse(readFileSync('tests/fixtures/transmission-performance.json')).cases.filter(c=>c.project.sites.some(s=>s.xvbf)||c.calibration);
 for(const c of cases) {
  const method=c.calibration?fit_source_json:fit_json,expected=JSON.parse(method(JSON.stringify(c.project)));
  const actual=JSON.parse(method(JSON.stringify({...c.project,derivative_method:'analytical'})));
  delete actual.project.derivative_method;assert.deepEqual(actual,expected,c.id);
 }
});
test('invalid derivative methods fail instead of silently selecting an algorithm',()=>{
 assert.throws(()=>fit({...p,derivative_method:'unknown'}),/unknown variant/);
});

test('default thin fits separate coincident components consistently across scalar, checkpoint and deferred paths',()=>{
 const project=structuredClone(p);delete project.derivative_method;
 project.sites=[structuredClone(project.sites[0]),structuredClone(project.sites[0])];
 project.sites[1].params.intensity.value*=.6;
 const truth=structuredClone(project);truth.sites[0].params.cs.value-=.12;truth.sites[1].params.cs.value+=.16;
 project.spectrum.y=evaluate(truth).y.map((v,i)=>v+.05*Math.sin(1.7*i));
 const original=structuredClone(project),expected=fit(project);
 assert.ok(expected.warnings.some(w=>w.includes('Separated coincident starting components')));
 assert.deepEqual(project,original);assert.equal(expected.project.derivative_method,undefined);
 const explicit=fit({...project,derivative_method:'analytical'});delete explicit.project.derivative_method;assert.deepEqual(explicit,expected);
 assert.deepEqual(finalize(fit({...project,search_defer_uncertainties:true}).finalization),expected);
 const session=new FitSession(JSON.stringify(project),false);
 try {
  let actual,first;
  for(let i=0;i<2000;i++) {const state=JSON.parse(session.advance());assert.notEqual(state.kind,'derivatives');if(state.kind==='progress'&&!first)first=JSON.parse(session.progress());if(state.kind==='done'){actual=state.result;break;}}
  assert.notEqual(first.project.sites[0].params.cs.value,first.project.sites[1].params.cs.value);
  assert.deepEqual(actual,expected);
 }finally{session.free();}
 assert.deepEqual(JSON.parse(fit_parallel_json(JSON.stringify(project),false,()=>{throw Error('unexpected finite differences');},()=>{})),expected);
});

test('coincidence handling preserves exact fits and the supplied objective at short limits in every execution path',()=>{
 const project=structuredClone(p);delete project.derivative_method;project.sites=[structuredClone(project.sites[0]),structuredClone(project.sites[0])];
 project.spectrum.y=evaluate(project).y;
 const exact=fit(project);assert.ok(exact.evaluation.objective<1e-20);assert.ok(!exact.warnings.some(w=>w.includes('Separated coincident')));
 project.spectrum.y=project.spectrum.y.map((v,i)=>v+.001*Math.sin(1.7*i));project.max_iterations=1;
 const expected=fit(project);assert.ok(expected.evaluation.objective<=evaluate(project).objective);
 assert.deepEqual(finalize(fit({...project,search_defer_uncertainties:true}).finalization),expected);
 const session=new FitSession(JSON.stringify(project),false);
 try{let actual;for(let i=0;i<20;i++){const state=JSON.parse(session.advance());assert.notEqual(state.kind,'derivatives');if(state.kind==='done'){actual=state.result;break;}}assert.deepEqual(actual,expected);}finally{session.free();}
});
