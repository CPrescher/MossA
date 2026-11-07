import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import init, { fit_json, evaluate_json } from '../src/wasm/mossa_core.js';
import { demo } from '../src/demo';
import { reverseVelocity, applyRawCalibration } from '../src/calibration';
import { calibrateCounts, reverseSpectrum } from '../src/io.mjs';
import { newNuclearConstants } from '../src/nuclear-constants.mjs';
import { summarizeFit, defaultLayout, decodeSession, snapshotVersion, type Snapshot } from '../src/session';
import { workspaceFromSnapshot, activeSnapshot, activeSpectrum, addModel, appendSpectra, updateActiveSnapshot } from '../src/workspace';
import { createWorkspaceFile, openWorkspaceFile } from '../src/workspaceFile';
import { createProjectFile, openProjectFile } from '../src/projectFile';
import { decodeWorkspaceSession } from '../src/workspaceStorage';
import { historyReducer } from '../src/history';
import type { FitResult, Project } from '../src/types';
import { noiseIssue, seededRandom, simulateSpectrum } from '../src/comparison';

await init({module_or_path:readFileSync(new URL('../src/wasm/mossa_core_bg.wasm',import.meta.url))});
const fitted=JSON.parse(fit_json(JSON.stringify(demo()))) as FitResult;
const cal={max:8,shift:.37,sinusoidal:true,folding:true,center:16.5,nuclear_constants:newNuclearConstants()};
const evaluate=async(p:Project)=>JSON.parse(evaluate_json(JSON.stringify(p)));
function columns():Snapshot {return {project:structuredClone(fitted.project),raw:null,cal,filename:'velocity-column example',selected:0,fit:summarizeFit(fitted),fitElapsed:42};}
function channels():Snapshot {
  const raw=Array.from({length:32},(_,i)=>10000+i*i);
  return {...columns(),raw,project:{...demo(),spectrum:calibrateCounts(raw,cal.max,cal.shift,true,cal.center)},fit:null,fitElapsed:null,
    importInfo:{format:'spec-mca',channels:32,filename:'sample.mca',headers:['#F sample-02GPa.mca','#@CHANN 32 0 31 1']}};
}
test('reversal negates complete calibrated coordinates, preserving pairs and increasing x',()=>{
  const original=columns(), next=reverseVelocity(original);
  assert.deepEqual(next.project.spectrum,reverseSpectrum(original.project.spectrum));
  assert.ok(next.project.spectrum.x.every((x,i,a)=>!i||x>a[i-1]));
  assert.equal(next.cal,original.cal);assert.equal(next.raw,original.raw);
  assert.equal(next.fit,null);assert.equal(next.velocityReversed,true);
  assert.deepEqual(reverseVelocity(next).project.spectrum,original.project.spectrum);
  assert.equal(reverseVelocity(next).velocityReversed,undefined);
});
test('raw reversal survives recalibration and folding changes without mutating acquisition counts',()=>{
  const original=channels(), next=reverseVelocity(original);
  assert.equal(next.raw,original.raw);assert.deepEqual(next.raw,original.raw);
  const changed={...cal,max:9,shift:.61,center:16,folding:true};
  const revised=applyRawCalibration(next,changed);
  assert.deepEqual(revised.project.spectrum,reverseSpectrum(calibrateCounts(original.raw!,9,.61,true,16)));
  assert.equal(revised.velocityReversed,true);
  assert.deepEqual(reverseVelocity(revised).project.spectrum,calibrateCounts(original.raw!,9,.61,true,16));
});
test('Poisson simulation keeps a reversed self-paired turnaround at the last observation',()=>{
  const options={simulations:99,seed:1,noise:'poisson' as const,doubledFirstChannel:false,doubledLastChannel:true};
  const random=seededRandom(1234), n=30000;
  let firstVariance=0,lastVariance=0,firstOdd=0;
  for(let i=0;i<n;i++) {
    const y=simulateSpectrum([100,100],options,null,random);
    assert.equal(y[1]%2,0);
    firstOdd+=y[0]%2;firstVariance+=(y[0]-100)**2;lastVariance+=(y[1]-100)**2;
  }
  assert.ok(firstOdd>10000);
  assert.ok(Math.abs(firstVariance/n-100)<5);
  assert.ok(Math.abs(lastVariance/n-200)<8);
  const p=demo();p.spectrum.y=p.spectrum.y.map(()=>100);
  assert.equal(noiseIssue(p,options),null);
  p.spectrum.y[p.spectrum.y.length-1]=101;
  assert.match(noiseIssue(p,options)!,/even last/);
});
test('reversal invalidates all models of one spectrum and Undo restores completed fits',()=>{
  const before=appendSpectra(addModel(workspaceFromSnapshot(columns()),true),[columns()]);
  const next=updateActiveSnapshot(before,reverseVelocity(activeSnapshot(before)));
  assert.ok(activeSpectrum(next).models.every(m=>m.fit===null));
  assert.equal(next.spectra[0],before.spectra[0]);
  const h=historyReducer({past:[],present:before,future:[]},{type:'set',value:next,record:true});
  assert.deepEqual(historyReducer(h,{type:'undo'}).present,before);
  // Start with two fitted models in the spectrum being changed as well.
  const pair=addModel(workspaceFromSnapshot(columns()),true);
  const reversed=updateActiveSnapshot(pair,reverseVelocity(activeSnapshot(pair)));
  assert.ok(activeSpectrum(reversed).models.every(m=>m.fit===null));
});
test('portable projects and autosave retain reversal and import headers; legacy versions reject the flag',async()=>{
  const snapshot=reverseVelocity(channels());
  assert.equal(snapshotVersion(snapshot),3);
  const single=await createProjectFile(snapshot,{});
  assert.equal(single.version,3);assert.deepEqual(single.required_features,['velocity-reversal-v1']);
  const reopened=await openProjectFile(single,cal,'sample.mossa',evaluate);
  assert.deepEqual(reopened.snapshot.project.spectrum,snapshot.project.spectrum);
  assert.deepEqual(reopened.snapshot.importInfo,snapshot.importInfo);
  assert.equal(reopened.snapshot.velocityReversed,true);
  const workspace=workspaceFromSnapshot(snapshot), doc=await createWorkspaceFile(workspace,{});
  assert.equal(doc.version,2);
  const collection=await openWorkspaceFile(doc,cal,'sample.mossa',evaluate);
  assert.equal(activeSnapshot(collection.workspace).velocityReversed,true);
  assert.deepEqual(activeSnapshot(collection.workspace).importInfo,snapshot.importInfo);
  const session=decodeWorkspaceSession({version:2,workspace,layout:defaultLayout});
  assert.equal(activeSnapshot(session.workspace).velocityReversed,true);
  assert.throws(()=>decodeWorkspaceSession({version:1,workspace,layout:defaultLayout}),/version 2/);
  assert.throws(()=>decodeSession(JSON.stringify({version:2,snapshot,layout:defaultLayout})),/version 3/);
  const tampered=structuredClone(single);tampered.preprocessing.velocity_reversed=false;
  await assert.rejects(openProjectFile(tampered,cal,'bad.mossa',evaluate),/do not match/);
  const untagged=structuredClone(single);untagged.version=2;
  await assert.rejects(openProjectFile(untagged,cal,'bad.mossa',evaluate));
});
