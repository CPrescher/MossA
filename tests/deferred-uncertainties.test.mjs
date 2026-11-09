import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import init, { fit_json, fit_source_json, fit_recovery_json, evaluate_json, evaluate_source_json, finalize_fit_json, FitSession, DerivativeModel, fit_parallel_json, finalize_fit_with_columns_json } from '../src/wasm/mossa_core.js';
import { fitMultiStart, fitMultiStartAsync } from '../src/multistart.mjs';
await init({ module_or_path: readFileSync('src/wasm/mossa_core_bg.wasm') });
const cases=['transmission-performance.json','transmission-measured-performance.json'].flatMap(n=>JSON.parse(readFileSync(`tests/fixtures/${n}`)).cases);
const evaluate=p=>JSON.parse(evaluate_json(JSON.stringify(p)));
const local=p=>JSON.parse(fit_json(JSON.stringify(p)));
const finalize=p=>JSON.parse(finalize_fit_json(JSON.stringify(p)));
for(const c of cases)test(`deferred std preserves original solver scaling after JSON roundtrip: ${c.id}`,()=>{
  const fit=c.calibration?fit_source_json:fit_json,expected=JSON.parse(fit(JSON.stringify(c.project)));
  const trial=JSON.parse(fit(JSON.stringify({...c.project,search_defer_uncertainties:true})));
  assert.ok(trial.finalization);assert.equal(trial.errors,undefined);assert.equal(trial.rank,undefined);
  assert.equal(trial.project.search_defer_uncertainties,undefined);
  assert.equal(trial.finalization.project.search_defer_uncertainties,undefined);
  assert.deepEqual(finalize(structuredClone(trial.finalization)),expected);
});
test('fitted Gaussian sources and dependent distribution-weight std survive deferred finalization',()=>{
  const source=structuredClone(cases.find(c=>c.id==='source-calibration-lorentzian').project);
  source.source_gaussians=[{center:0,fwhm:.21,weight:1},{center:.34,fwhm:.37,weight:.28}];
  source.spectrum.y=JSON.parse(evaluate_source_json(JSON.stringify(source))).y.map((v,i)=>v+.1*Math.sin(17.3*i));
  source.source_gaussians[1].fwhm*=1.05;
  const distribution=structuredClone(cases.find(c=>c.id==='xvbf-transmission').project),d=distribution.sites[0].xvbf;
  d.cs.push(structuredClone(d.cs[0]));d.cs[1].center.value=-.4;d.cs[1].width.value=.08;
  d.cs[0].weight={value:.65,fit:true,min:0,max:1,link:null};d.cs[1].weight={value:.35,fit:true,min:0,max:1,link:null};
  distribution.spectrum.y=evaluate(distribution).y.map((v,i)=>v+.1*Math.sin(17.3*i));d.cs[0].weight.value=.6;d.cs[1].weight.value=.4;
  for(const [p,fit]of [[source,fit_source_json],[distribution,fit_json]]){
    const expected=JSON.parse(fit(JSON.stringify(p))),trial=JSON.parse(fit(JSON.stringify({...p,search_defer_uncertainties:true})));
    assert.deepEqual(finalize(trial.finalization),expected);
  }
});
test('checkpointed and shared derivative searches defer std and finalize the original model',()=>{
  const c=cases.find(c=>c.id==='three-sites-squared-source');
  const project={...c.project,search_defer_uncertainties:true},json=JSON.stringify(project);
  const expected=local(c.project),session=new FitSession(json,false),model=new DerivativeModel(json,false);
  try{
    let trial;
    for(let calls=0;calls<5000;calls++){
      const state=JSON.parse(session.advance());
      if(state.kind==='done'){trial=state.result;break;}
      if(state.kind==='derivatives')session.supply(model.columns(state.x,0,state.columns));
    }
    assert.ok(trial?.finalization);assert.equal(trial.errors,undefined);
    assert.deepEqual(finalize(trial.finalization),expected);
    const shared=JSON.parse(fit_parallel_json(json,false,x=>model.columns(x,0,x.length),()=>{}));
    assert.deepEqual(shared,trial);
    const pending=trial.finalization,prepared=new DerivativeModel(JSON.stringify(pending.project),false);
    try{assert.deepEqual(JSON.parse(finalize_fit_with_columns_json(JSON.stringify(pending),prepared.columns(pending.state.x,0,pending.state.x.length))),expected);}
    finally{prepared.free();}
  }finally{session.free();model.free();}
});
test('ordered full searches finalize once, retaining every search result/std field',async()=>{
  const project=structuredClone(cases.find(c=>c.id==='three-sites-lorentzian-source').project);
  project.search_starts=4;
  for(const strategy of ['full']){
    project.search_strategy=strategy;const original=structuredClone(project),expected=fitMultiStart(project,local,evaluate);
    let trialCount=0,finalCount=0;
    const actual=fitMultiStart(project,p=>{const r=local(p);assert.ok(r.finalization);trialCount++;return r;},evaluate,undefined,p=>{finalCount++;return finalize(p);});
    assert.equal(trialCount,4);assert.equal(finalCount,1);assert.deepEqual(actual,expected);assert.deepEqual(project,original);
    assert.equal(actual.finalization,undefined);
    const asyncResult=await fitMultiStartAsync(project,async p=>local(p),evaluate,undefined,async p=>finalize(p));
    assert.deepEqual(asyncResult,expected);
  }
});
test('source calibration, bounded LM, all-fixed and iteration-limited finalizations preserve complete output',()=>{
  const c=cases.find(c=>c.id==='singlet-squared-source');
  for(const fit of [fit_json,fit_recovery_json])for(const max_iterations of [1,100]){
    const p={...structuredClone(c.project),max_iterations};
    const full=JSON.parse(fit(JSON.stringify(p))),trial=JSON.parse(fit(JSON.stringify({...p,search_defer_uncertainties:true})));
    assert.deepEqual(finalize(trial.finalization),full);
  }
  const p=structuredClone(c.project);for(const s of p.sites)for(const v of Object.values(s.params))v.fit=false;p.background.forEach(v=>v.fit=false);
  assert.deepEqual(finalize(local({...p,search_defer_uncertainties:true}).finalization),local(p));
});
test('invalid or failed finalizations cannot produce a completed fit or stale std',()=>{
  const project={...cases[0].project,search_starts:4};
  assert.throws(()=>fitMultiStart(project,local,evaluate,undefined,()=>{throw new Error('Finalization failed');}),/Finalization failed/);
  assert.throws(()=>fitMultiStart(project,local,evaluate,undefined,p=>({...finalize(p),iterations:999})),/changed the selected/);
  const trial=local({...project,search_defer_uncertainties:true});
  for(const change of [p=>p.state.x.pop(),p=>p.state.x.fill(1e100),p=>p.state.iterations=2001]){
    const pending=structuredClone(trial.finalization);change(pending);assert.throws(()=>finalize(pending),/Invalid fit finalization/);
  }
  let finalized=0;
  const single=fitMultiStart({...cases[0].project,search_defer_uncertainties:true},local,evaluate,undefined,p=>{finalized++;return finalize(p);});
  assert.deepEqual(single,local(cases[0].project));assert.equal(finalized,0);
});
