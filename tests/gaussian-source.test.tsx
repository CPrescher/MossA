import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import init, { evaluate_json, evaluate_source_json, fit_source_json, fit_json } from '../src/wasm/mossa_core.js';
import { sourceReferenceProject, sourceReferenceSeeds, finishSourceCalibration, applySourceCalibration } from '../src/source-calibration';
import { centeredGaussians, gaussianDensity } from '../src/source-profile';
import { decodeSession, defaultLayout, writeSession, type Snapshot } from '../src/session';
import { createProjectFile, openProjectFile } from '../src/projectFile';
import { historyReducer } from '../src/history';
import { newSite, parameter, type SourceGaussian, type Project, type FitResult } from '../src/types';
await init({ module_or_path: readFileSync(new URL('../src/wasm/mossa_core_bg.wasm', import.meta.url)) });
const evaluate = (p: Project, calibration = false) => JSON.parse((calibration ? evaluate_source_json : evaluate_json)(JSON.stringify(p)));
const settings = { absorberFwhm: .097, initialSourceFwhm: .4, squared: false, gaussianCount: 2 };
const truth: SourceGaussian[] = [{ center: 0, fwhm: .21, weight: 1 }, { center: .34, fwhm: .37, weight: .28 }];
const x = Array.from({ length: 257 }, (_, i) => -2.56 + i * .02);
// Independent direct quadrature, with a finer grid than the production FFT.
// Computes I(v) = B0 [1 + integral S(v-u)(exp(-tau(u))-1) du] + B1 v + B2 v².
// The Gaussian response is explicitly asymmetric; no Rust/JS profile helpers.
function direct(p: Project, step = .005, calibration = false) {
  const gs = p.source_gaussians!;
  const total = gs.reduce((a,g) => a + g.weight, 0);
  const centroid = gs.reduce((a,g) => a + g.weight * g.center, 0) / total;
  const source = (v: number) => gs.reduce((a,g) => a + g.weight / total * 2 * Math.sqrt(Math.log(2)) / (Math.sqrt(Math.PI) * g.fwhm) * Math.exp(-4 * Math.log(2) * ((v - g.center + centroid) / g.fwhm) ** 2), 0);
  const lor = (v: number, c: number, w: number, area: number) => area / Math.PI * (w/2) / ((v-c)**2 + (w/2)**2);
  const deficit: number[] = [];
  for (let j=0;j<=Math.round(60/step);j++) {
    const u = -30 + j * step;
    let tau = 0;
    for (const s of p.sites) {
      const {cs,fwhm,intensity,qs,a12} = s.params;
      tau += s.kind === 'Doublet' ? lor(u,cs.value-qs.value/2,fwhm.value,intensity.value*a12.value) + lor(u,cs.value+qs.value/2,fwhm.value,intensity.value*(1-a12.value)) : lor(u,cs.value,fwhm.value,intensity.value);
    }
    deficit.push(Math.expm1(-tau));
  }
  const transmission = p.spectrum.x.map(v => 1 + deficit.reduce((sum,d,j) => sum + source(v - (-30 + j*step)) * d * step, 0));
  const norm = calibration ? Math.max(...transmission) : 1;
  return transmission.map((t,i) => p.background[0].value*t/norm + (p.background[1]?.value ?? 0)*p.spectrum.x[i] + (p.background[2]?.value ?? 0)*p.spectrum.x[i]**2);
}
function reference(gs = truth) {
  const p = sourceReferenceProject({x, y:x.map(v => 10000 - 1000*Math.exp(-v*v))}, {...settings, gaussianCount:gs.length});
  p.source_gaussians = structuredClone(gs);
  p.sites[0].params.cs.value = .13;
  p.sites[0].params.intensity.value = .18;
  p.background.forEach((b,i) => b.value = [10000,-3,1.2][i]);
  p.spectrum.y = direct(p,.005,true);
  return p;
}
const standard = reference();
let recovered: ReturnType<typeof finishSourceCalibration>;
function recover() {
  if (!recovered) {
    const fits = sourceReferenceSeeds(standard.spectrum, settings).map(p => JSON.parse(fit_source_json(JSON.stringify(p))) as FitResult);
    const usable = fits.flatMap(f => { try { return [finishSourceCalibration('independent asymmetric standard', f)]; } catch { return []; } });
    assert.ok(usable.length, JSON.stringify(fits.map(f=>({converged:f.converged,rank:f.rank,n:f.free_parameters,sse:f.evaluation.sse,gs:f.project.source_gaussians,errors:f.errors}))));
    recovered = usable.sort((a,b)=>a.fit.evaluation.sse-b.fit.evaluation.sse)[0];
  }
  return recovered;
}
test('asymmetric Gaussian source matches independent fine quadrature with correct handedness and unit continuum', () => {
  const expected = direct(standard,.005,true), actual = evaluate(standard,true).y;
  assert.ok(Math.max(...actual.map((v:number,i:number)=>Math.abs(v-expected[i]))) < 1e-6);
  const mirrored = structuredClone(standard); mirrored.source_gaussians!.forEach(g=>g.center=-g.center);
  assert.ok(evaluate(mirrored,true).sse > 1e5, 'asymmetry must not be silently reflected');
  const continuum = {...standard, sites:[], spectrum:{x:[-30,-29,-20,0,20,29,29.5,30],y:Array(8).fill(10000)},background:[parameter(10000)]};
  evaluate(continuum).y.forEach((v:number)=>assert.ok(Math.abs(v-10000)<1e-8));
  const gs = centeredGaussians(truth);
  assert.ok(Math.abs(gs.reduce((a,g)=>a+g.weight*g.center,0)) < 1e-15);
  let area=0;for(let v=-5;v<=5;v+=.001)area+=gaussianDensity(v,gs)*.001;
  assert.ok(Math.abs(area-1)<1e-10);
});
test('reference fitting recovers the full asymmetric source from independent observations', () => {
  const r = recover(), f = r.fit;
  assert.equal(f.rank, f.free_parameters); assert.equal(f.free_parameters,9);
  assert.ok(f.evaluation.sse < 1e-5, `SSE ${f.evaluation.sse}`);
  const a = centeredGaussians(r.reference.gaussians!), b = centeredGaussians(truth);
  for(let v=-1;v<=1;v+=.01) assert.ok(Math.abs(gaussianDensity(v,a)-gaussianDensity(v,b))<1e-5);
  assert.ok(Math.abs(r.reference.center-.13)<1e-5);
  assert.ok(Math.abs(r.reference.intensity-.18)<1e-5);
  assert.equal(f.errors['source:0:center'],null);assert.equal(f.errors['source:0:weight'],null);
});
test('the calibrated shape transfers unchanged to a separate saturated doublet in full transmission and survives save/undo/reload', async () => {
  const r = recover();
  const site = newSite(0,'Doublet'); site.params.cs.value=-.25; site.params.qs.value=1.6; site.params.fwhm.value=.13; site.params.intensity.value=.65;
  const p: Project={...standard,sites:[site],background:[parameter(10000)],source_gaussians:structuredClone(truth)};
  p.spectrum={x,y:direct(p)};
  const cal={max:4,shift:0,folding:false,sinusoidal:false,center:256.5};
  const before: Snapshot={project:{...p,source_gaussians:undefined},raw:null,cal,filename:'separate sample',selected:0};
  const next=applySourceCalibration(before,r);
  assert.deepEqual(next.project.sites,before.project.sites);
  assert.ok(Math.max(...evaluate(next.project).y.map((v:number,i:number)=>Math.abs(v-p.spectrum.y[i])))<.01);
  assert.ok(evaluate(before.project).sse > 1e5, 'replacing complete shape with a symmetric width loses the agreement');
  next.project.sites=structuredClone(next.project.sites);next.project.sites[0].params.cs.value=-.2;next.project.sites[0].params.intensity.value=.55;
  const f=JSON.parse(fit_json(JSON.stringify(next.project))) as FitResult;
  assert.ok(f.evaluation.sse<1e-3);assert.deepEqual(f.project.source_gaussians,next.project.source_gaussians);
  assert.ok(!Object.keys(f.errors).some(k=>k.startsWith('source:')),'source stays fixed in sample fits');
  const saved=decodeSession(JSON.stringify({version:1,snapshot:next,layout:defaultLayout,fit:null,elapsed:null}));
  assert.deepEqual(saved.snapshot.project.source_gaussians,r.reference.gaussians);
  const file=await createProjectFile(next,{});
  assert.equal(file.version,2,'older apps must reject a mixture rather than silently use a simple source');
  let autosave='';
  writeSession({version:1,snapshot:next,layout:defaultLayout,fit:null,elapsed:null},{getItem:()=>autosave,setItem:(_key,value)=>{autosave=value;}});
  assert.equal(JSON.parse(autosave).version,2);
  const opened=await openProjectFile(JSON.parse(JSON.stringify(file)),cal,'saved',async p=>evaluate(p));
  assert.deepEqual(opened.snapshot.project.source_gaussians,r.reference.gaussians);assert.deepEqual(opened.snapshot.cal.sourceReference,r.reference);
  let history=historyReducer({past:[] as Snapshot[],present:before,future:[] as Snapshot[]},{type:'set',value:next,record:true});
  history=historyReducer(history,{type:'undo'});assert.deepEqual(history.present,before);
  history=historyReducer(history,{type:'redo'});assert.deepEqual(history.present,next);
  assert.equal(applySourceCalibration(next,r).project,next.project);
});
test('malformed, under-resolved and unidentifiable source models are rejected', () => {
  for (const gs of [[],[...truth,...truth],truth.map(g=>({...g,weight:0})),truth.map(g=>({...g,fwhm:.001})),truth.map(g=>({...g,center:NaN}))]) {
    const p={...standard,source_gaussians:gs};
    assert.throws(()=>evaluate(p),/Gaussian source|invalid type/);
    assert.throws(()=>decodeSession(JSON.stringify({version:1,snapshot:{project:p},layout:defaultLayout})),/Gaussian source/);
  }
  const r=recover();
  assert.throws(()=>finishSourceCalibration('bad',{...r.fit,rank:1}),/not resolved/);
  const bound=structuredClone(r.fit);bound.project.source_gaussians![0].fwhm=.03;
  assert.throws(()=>finishSourceCalibration('bad',bound),/not resolved/);
  const duplicate=reference([truth[0],truth[0]]);
  const fit=JSON.parse(fit_source_json(JSON.stringify(duplicate))) as FitResult;
  assert.throws(()=>finishSourceCalibration('degenerate',fit),/not resolved/);
});
test('three distinct Gaussian components recover a reference shape without changing the optimizer API', () => {
  const gs=[{center:0,fwhm:.17,weight:1},{center:.32,fwhm:.29,weight:.3},{center:-.43,fwhm:.4,weight:.22}];
  const p=reference(gs);
  // Perturb a known physical starting estimate to test a locally identifiable 3-component model.
  p.source_gaussians=gs.map((g,i)=>({...g,fwhm:g.fwhm*1.1,center:g.center*.9,weight:i?g.weight*1.1:g.weight}));
  const fit=JSON.parse(fit_source_json(JSON.stringify(p))) as FitResult;
  const result=finishSourceCalibration('three-component standard',fit);
  assert.equal(fit.free_parameters,12);assert.equal(fit.rank,12);assert.ok(fit.evaluation.sse<1e-5);
  for(let v=-1;v<=1;v+=.01)assert.ok(Math.abs(gaussianDensity(v,centeredGaussians(result.reference.gaussians!))-gaussianDensity(v,centeredGaussians(gs)))<1e-5);
});
