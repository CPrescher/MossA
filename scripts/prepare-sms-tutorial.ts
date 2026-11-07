// Node 26: node --import tsx scripts/prepare-sms-tutorial.ts <SMS-folder>
// Original measurements stay byte-identical. All fits below are NEW browser
// calculations; they are not exported MATLAB results or a pressure assignment.
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import init, { fit_json, fit_source_json, evaluate_json } from '../src/wasm/mossa_core.js';
import { parseSpectrum, calibrateCounts } from '../src/io.mjs';
import { estimateFoldCenter } from '../src/folding';
import { referenceSeeds, finishCalibration } from '../src/calibration';
import { sourceReferenceSeeds, finishSourceCalibration, type SourceCalibration } from '../src/source-calibration';
import { newNuclearConstants } from '../src/nuclear-constants.mjs';
import { newSite, parameter, type Project, type FitResult } from '../src/types';
import { summarizeFit, type Calibration, type Snapshot } from '../src/session';
import { activeSpectrum, workspaceFromSnapshot, appendSpectra, type ModelEntry } from '../src/workspace';
import { createWorkspaceFile, openWorkspaceFile } from '../src/workspaceFile';
import { createProjectFile } from '../src/projectFile';
import { makeCalibrationPreset } from '../src/calibration-presets';

const folder=process.argv[2];
if(!folder) throw new Error('Pass the original course SMS folder.');
const output=resolve('manual/public/tutorial-data/sms');
await mkdir(output,{recursive:true});
await init({module_or_path:await readFile(new URL('../src/wasm/mossa_core_bg.wasm',import.meta.url))});
const constants=newNuclearConstants();
const fit=(p:Project):FitResult=>JSON.parse(fit_json(JSON.stringify(p)));
const evaluate=async(p:Project)=>JSON.parse(evaluate_json(JSON.stringify(p)));
const names=['Iron foil calibration.txt','singleLineBefore.dat','singleLineAfter.dat','Fe7C3_01GPa.mca'];
const inputs=new Map<string,ReturnType<typeof parseSpectrum>>();
const records=[];
for(const name of names) {
  const bytes=await readFile(join(folder,name));
  await copyFile(join(folder,name),join(output,name));
  const parsed=parseSpectrum(bytes.toString('utf8'));
  if(parsed.importInfo) parsed.importInfo.filename=name;
  inputs.set(name,parsed);
  records.push({name,sha256:createHash('sha256').update(bytes).digest('hex'),points:parsed.raw?.length??parsed.spectrum!.x.length,importInfo:parsed.importInfo});
}
const iron=inputs.get(names[0])!.raw!;
const ironCenter=await estimateFoldCenter(iron,async p=>fit(p));
const settings={max:8,field:33,sinusoidal:true,folding:true,center:ironCenter.center,autoCenter:true,nuclear_constants:constants};
const candidates=referenceSeeds(iron,settings).map(fit).filter(f=>f.converged).sort((a,b)=>a.evaluation.sse-b.evaluation.sse);
if(!candidates.length) throw new Error('Iron reference did not converge.');
const velocity=finishCalibration(iron,settings,names[0],candidates[0]);
const baseCal:Calibration={max:velocity.max,shift:velocity.shift,sinusoidal:true,folding:true,center:ironCenter.center,autoFold:true,nuclear_constants:constants,reference:velocity.reference};
const sourceResults:SourceCalibration[]=[];
const referenceSnapshots:Snapshot[]=[];
for(const name of names.slice(1,3)) {
  const input=inputs.get(name)!;
  const fits=sourceReferenceSeeds(input.spectrum!,{absorberFwhm:.215,initialSourceFwhm:.4,squared:true}).map(p=>JSON.parse(fit_source_json(JSON.stringify(p))) as FitResult);
  const resolved=fits.flatMap(f=>{try{return[finishSourceCalibration(name,f)];}catch{return[];}}).sort((a,b)=>a.fit.evaluation.sse-b.fit.evaluation.sse);
  if(!resolved.length) throw new Error(`Source reference ${name} was not resolved.`);
  const result=resolved[0];result.reference.importInfo=input.importInfo;
  sourceResults.push(result);
  // Source calibration normalizes after interpolation; ordinary transmission
  // does not. Refit the display's I0 with the calibrated width held fixed and
  // retain the dedicated calibration result separately in sourceReference.
  const display=fit(result.fit.project);
  if(!display.converged) throw new Error(`Ordinary display fit failed for ${name}`);
  referenceSnapshots.push({project:display.project,raw:null,cal:{...baseCal,sourceReference:result.reference},filename:name,selected:0,fit:summarizeFit(display),fitElapsed:null,importInfo:input.importInfo});
}
const meanSource=sourceResults.reduce((sum,s)=>sum+s.reference.sourceFwhm,0)/2;
const sample=inputs.get(names[3])!, raw=sample.raw!;
const folding=await estimateFoldCenter(raw,async p=>fit(p));
const cal:Calibration={...baseCal,center:folding.center,sourceReference:sourceResults[1].reference};
function sextet(index:number,field:number,intensity=1.3) {
  const s=newSite(index,'Sextet');s.name=`Fe site ${index+1}`;
  s.params.cs=parameter(.25,true,-2,3);s.params.bhf=parameter(field,true,5,40);
  s.params.fwhm=parameter(.3,true,.03,2);s.params.intensity=parameter(intensity,true,0);
  s.params.qs=parameter(0,false,-3,3);
  return s;
}
const start:Project={nuclear_constants:constants,spectrum:calibrateCounts(raw,cal.max,cal.shift,true,cal.center),sites:[],background:[parameter(4800)],mode:'transmission',source_fwhm:meanSource,source_squared:true,weighting:'unweighted',max_iterations:1000};
const startSnapshot:Snapshot={project:start,raw,cal,filename:names[3],selected:0,importInfo:sample.importInfo,fit:null,fitElapsed:null};
await writeFile(join(output,'sms-start.mossa'),JSON.stringify(await createProjectFile(startSnapshot,{purpose:'SMS tutorial start; original velocity direction; no sample fit'}),null,2)+'\n');
let current:Project={...structuredClone(start),spectrum:calibrateCounts(raw,cal.max,cal.shift,true,cal.center,true),sites:[sextet(0,16.5),sextet(1,21.5)]};
const stages:{name:string;result:FitResult}[]=[];
function run(name:string) {
  const result=fit(current);
  if(!result.converged) throw new Error(`${name}: ${result.termination}`);
  stages.push({name,result});current=structuredClone(result.project);
  console.log(name,JSON.stringify({objective:result.evaluation.objective,iterations:result.iterations,warnings:result.warnings}));
}
run('1 · Two sextets, QS fixed');
current.sites.forEach(s=>s.params.qs.fit=true);run('2 · Two sextets, QS free');
current.sites.push(sextet(2,19,.45));current.sites[2].params.qs.fit=true;run('3 · Three sextets, QS free');
current.sites[1].params.intensity.link={target:'site:0:intensity',factor:1};
current.sites[2].params.intensity.link={target:'site:0:intensity',factor:1/3};
current.background.push(parameter(0),parameter(0));run('4 · 3:3:1, quadratic background');
current.sites.forEach(s=>s.params.a12.fit=true);run('5 · 3:3:1, free A12');
const final=stages.at(-1)!.result;
let workspace=workspaceFromSnapshot({...startSnapshot,project:final.project,velocityReversed:true,fit:summarizeFit(final)});
workspace.name='SMS Fe7C3 · supplied 01GPa file (header 02GPa)';
const entry=activeSpectrum(workspace);
entry.models=stages.map(({name,result},i):ModelEntry=>{
  const {spectrum:_spectrum,...project}=result.project;
  return{id:`sms-stage-${i+1}`,name,project,selected:0,fit:summarizeFit(result),fitElapsed:null,sourceReference:sourceResults[1].reference};
});
entry.activeModelId=entry.models.at(-1)!.id;
const sampleId=entry.id;
workspace=appendSpectra(workspace,referenceSnapshots);
workspace.activeSpectrumId=sampleId;
const preset=makeCalibrationPreset('SMS · sinusoidal · iron reference',baseCal);
workspace.calibrationPresets=[preset];workspace.importCalibrationPresetId=preset.id;
const provenance={purpose:'New browser-core worked fits; not MATLAB reference outputs',source:'MossA tutorial SMS.pdf',sourceMeanRule:'Arithmetic mean of before and after Lorentzian-squared widths; held fixed in sample fits',pressure:{tutorialAndFilename:'1 GPa',internalHeaderFilename:'02GPa',status:'Unresolved source-label discrepancy; no independent pressure assignment'}};
const document=await createWorkspaceFile(workspace,provenance);
const reopened=await openWorkspaceFile(document,baseCal,'sms-worked.mossa',evaluate);
if(reopened.notice) throw new Error(reopened.notice);
for(const s of reopened.workspace.spectra) for(const m of s.models) if(!m.fit) throw new Error(`Saved fit was lost: ${s.name} / ${m.name}`);
await writeFile(join(output,'sms-worked.mossa'),JSON.stringify(document,null,2)+'\n');
await writeFile(join(output,'source-calibrations.json'),JSON.stringify({purpose:'Dedicated source-calibration fits, not ordinary fixed-source sample fits',before:sourceResults[0],after:sourceResults[1],meanSourceFwhm:meanSource},null,2)+'\n');
await writeFile(join(output,'provenance.json'),JSON.stringify({...provenance,files:records,settings:{referenceFieldT:33,initialMaxVelocity:8,velocityMax:cal.max,standardCenterShift:cal.shift,ironFoldCenter:ironCenter.center,sampleFoldCenter:cal.center,sinusoidal:true,velocityReversed:true,knownAbsorberFwhm:.215,sourceModel:'Lorentzian-squared',sourceBefore:sourceResults[0].reference.sourceFwhm,sourceAfter:sourceResults[1].reference.sourceFwhm,sourceMean:meanSource,nuclearConstants:constants.id,weighting:'unweighted',maxIterations:1000}},null,2)+'\n');
console.log('Calibration',JSON.stringify({max:cal.max,shift:cal.shift,ironCenter:ironCenter.center,sampleCenter:cal.center,sourceMean:meanSource}));
console.log('All seven model fits and reversal/import provenance survived save/open.');
