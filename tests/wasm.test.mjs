import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import init, { evaluate_json, fit_json, fit_json_with_progress } from '../src/wasm/mossa_core.js';
await init({ module_or_path: readFileSync(new URL('../src/wasm/mossa_core_bg.wasm', import.meta.url)) });
const p = (v, fit = true, min = null, max = null) => ({ value:v, fit, min, max, link:null });
function project(kind, profile, x) { return { spectrum:{ x, y:x.map(()=>1000) }, sites:[{ name:'WASM test',kind,profile,params:{ cs:p(.23),fwhm:p(.42),intensity:p(400),qs:p(1.8),bhf:p(31.2),a12:p(kind==='Doublet'?.37:1.6,false),a13:p(3.2,false),mix:p(.3,false) } }], background:[p(1000)],mode:'thin',source_fwhm:.097,source_squared:false,weighting:'unweighted',max_iterations:200 }; }
test('compiled WASM agrees with all twelve independent MATLAB-expression fixtures', () => {
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/reference-profiles.json',import.meta.url)));
  for(const c of fixture.cases){const r=JSON.parse(evaluate_json(JSON.stringify(project(c.kind,c.profile,fixture.x))));
    r.components[0].forEach((v,i)=>assert.ok(Math.abs(v-c.absorption[i])<1e-10*Math.max(1,Math.abs(v))));}
});
test('actual WASM optimizer recovers bounded doublet parameters', () => {
  const x=Array.from({length:256},(_,i)=>-6+12*i/255),q=project('Doublet','Lorentzian',x);
  q.spectrum.y=JSON.parse(evaluate_json(JSON.stringify(q))).y;
  q.sites[0].params.cs.value=.1;q.sites[0].params.fwhm.value=.5;q.sites[0].params.intensity.value=350;
  q.sites[0].params.cs.min=-1;q.sites[0].params.cs.max=1;
  const r=JSON.parse(fit_json(JSON.stringify(q)));
  assert.equal(r.converged,true);assert.ok(r.evaluation.sse<1e-7);assert.ok(Math.abs(r.project.sites[0].params.cs.value-.23)<1e-5);
  assert.deepEqual(r.intensity_fractions,[{value:100,error:0}]);
});
test('WASM rejects invalid links and preserves transmitted finite curves', () => {
  const q=project('Singlet','Lorentzian',Array.from({length:64},(_,i)=>-5+10*i/63));
  q.mode='transmission';q.sites[0].params.intensity.value=.1;
  const r=JSON.parse(evaluate_json(JSON.stringify(q)));assert.ok(r.y.every(Number.isFinite));assert.ok(Math.min(...r.y)<990);
  q.sites[0].params.cs.link={target:'site:0:cs',factor:1};assert.throws(()=>evaluate_json(JSON.stringify(q)));
});

test('WASM publishes accepted fit states through a throttled progress callback', () => {
  const q=project('Doublet','Lorentzian',Array.from({length:256},(_,i)=>-6+12*i/255));
  q.spectrum.y=JSON.parse(evaluate_json(JSON.stringify(q))).y;
  q.sites[0].params.cs.value=.05;q.sites[0].params.fwhm.value=.65;
  const updates=[];
  const r=JSON.parse(fit_json_with_progress(JSON.stringify(q), json=>{
    updates.push(JSON.parse(json));
    // Simulate a slow first consumer to exercise more than one throttle window.
    if(updates.length===1){const end=performance.now()+110;while(performance.now()<end){}}
  }));
  assert.equal(r.converged,true);assert.ok(updates.length>=2);
  assert.equal(updates[0].iteration,0);
  for(let i=1;i<updates.length;i++){assert.ok(updates[i].elapsed_ms-updates[i-1].elapsed_ms>=99);assert.ok(updates[i].iteration>updates[i-1].iteration);}
  assert.ok(updates.every(u=>u.evaluation.y.length===256));
});
test('WASM can evaluate and fit a background with zero sites',()=>{
  const q=project('Singlet','Lorentzian',Array.from({length:32},(_,i)=>i));q.sites=[];q.spectrum.y=q.spectrum.y.map(()=>1234);
  const r=JSON.parse(fit_json(JSON.stringify(q)));assert.equal(r.converged,true);assert.equal(r.project.sites.length,0);assert.ok(Math.abs(r.project.background[0].value-1234)<1e-8);
});
