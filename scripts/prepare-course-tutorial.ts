// Run with Node 26: node --import tsx scripts/prepare-course-tutorial.ts <exercise-folder>
// Only the almandine tutorial is exported; the separate classroom exercises stay private.
// The supplied measurement files are copied byte for byte. Fits are new browser-core
// teaching examples, not archived MATLAB solutions or certified reference values.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import init, { fit_json, evaluate_json } from '../src/wasm/mossa_core.js';
import { parseSpectrum, calibrateCounts } from '../src/io.mjs';
import { referenceSeeds, finishCalibration } from '../src/calibration';
import { foldingPairs, foldCenterScan } from '../src/folding';
import { newNuclearConstants } from '../src/nuclear-constants.mjs';
import { parameter, newSite, type FitResult, type Project } from '../src/types';
import { summarizeFit, type Calibration, type Snapshot } from '../src/session';
import { workspaceFromSnapshot, activeSpectrum, modelSnapshot } from '../src/workspace';
import { createWorkspaceFile, openWorkspaceFile } from '../src/workspaceFile';

const source = process.argv[2];
if (!source) throw new Error('Pass the course exercise folder as the first argument.');
const output = resolve('manual/public/tutorial-data/freiburg');
await mkdir(output, { recursive: true });
await init({ module_or_path: await readFile(new URL('../src/wasm/mossa_core_bg.wasm', import.meta.url)) });
const fit = (p: Project): FitResult => JSON.parse(fit_json(JSON.stringify(p)));
const evaluate = async (p: Project) => JSON.parse(evaluate_json(JSON.stringify(p)));
const constants = newNuclearConstants();
const files = [
  ['MossA tutorial/conv/Alm Fe-Foil.dat', 'almandine-iron-foil.dat'],
  ['MossA tutorial/conv/Alm sample.dat', 'almandine.dat'],
];
const manifest: Record<string, unknown> = {
  purpose: 'Measured teaching data supplied with the Freiburg Mössbauer practical; browser tutorial adaptation authorized by the course instructor.',
  sources: ['MossA tutorial conv.pdf, steps 1–11'],
  transformation: 'Filenames simplified for downloads; file bytes unchanged. No trimming, normalization, or background subtraction of raw measurements.',
  files: [],
};
for (const [original, name] of files) {
  const bytes = await readFile(join(source, original));
  await copyFile(join(source, original), join(output, name));
  (manifest.files as unknown[]).push({ original, download: name, sha256: createHash('sha256').update(bytes).digest('hex'), channels: parseSpectrum(bytes.toString()).raw!.length });
}
const counts = async (name: string) => parseSpectrum(await readFile(join(output, name), 'utf8')).raw!;
async function calibration(file: string): Promise<Calibration> {
  const raw = await counts(file);
  const settings = { max: 5, field: 33, sinusoidal: false, folding: true, center: 256.5, autoCenter: false, nuclear_constants: constants };
  const candidates = referenceSeeds(raw, settings).map(fit).filter(r => r.converged).sort((a,b) => a.evaluation.sse-b.evaluation.sse);
  if (!candidates.length) throw new Error(`No converged reference fit for ${file}`);
  const result = finishCalibration(raw, settings, file, candidates[0]);
  console.log(file, JSON.stringify({max:result.max,shift:result.shift, rms:result.reference.rms, bestScanCenter:foldCenterScan(raw).best, pairRmsAt256_5:foldingPairs(raw,256.5).relativeRms}));
  return { max: result.max, shift: result.shift, sinusoidal: false, folding: true, center: 256.5, autoFold: false, nuclear_constants: constants, reference: result.reference };
}
const almCal=await calibration('almandine-iron-foil.dat');
function doublet(index:number, cs:number, qs:number, width:number, intensity:number) {
  const site=newSite(index,'Doublet');
  site.name=index===0 ? 'Fe$^{2+}$ (assignment)' : 'Fe$^{3+}$ (assignment)';
  site.params.cs=parameter(cs,true,-.5,2);
  site.params.qs=parameter(qs,true,.05,5);
  site.params.fwhm=parameter(width,true,.03,1.5);
  site.params.intensity=parameter(intensity,true,0);
  return site;
}
for (const [file,cal,qs] of [['almandine.dat',almCal,3.5]] as const) {
  const raw=await counts(file), spectrum=calibrateCounts(raw,cal.max,cal.shift,false,256.5);
  const high=Math.max(...spectrum.y),depth=high-Math.min(...spectrum.y);
  const start:Project={nuclear_constants:constants,spectrum,sites:[doublet(0,1.15,qs,.3,depth*.9)],background:[parameter(high)],mode:'thin',source_fwhm:.097,source_squared:false,weighting:'unweighted',max_iterations:1000};
  const models:{name:string; result:FitResult}[]=[];
  const add=(name:string,p:Project)=>{const result=fit(p); if(!result.converged) throw new Error(`${file} ${name}: ${result.termination}`); models.push({name,result});return result.project;};
  let current=add('1 doublet · constant background',start);
  current=structuredClone(current);current.sites.push(doublet(1,.35,.65,.35,depth*.18));
  current=add('2 doublets · constant background',current);
  if(file==='almandine.dat') {
    current=structuredClone(current);current.background.push(parameter(0));
    current=add('2 doublets · linear background',current);
    current=structuredClone(current);current.sites[0].params.a12.fit=true;
    add('Optional · free Fe²⁺ line ratio',current);
  }
  const snapshot=(r:FitResult):Snapshot=>({project:r.project,filename:file,raw,cal,selected:0,fit:summarizeFit(r),fitElapsed:null});
  const workspace=workspaceFromSnapshot(snapshot(models[0].result));
  workspace.name='Almandine · worked tutorial';
  const entry=activeSpectrum(workspace);
  entry.models=models.map((m,i)=>{
    const {spectrum:_s,...project}=m.result.project;
    return {id:`teaching-${file.replace('.dat','')}-model-${i}`,name:m.name,project,selected:0,fit:summarizeFit(m.result),fitElapsed:null};
  });
  entry.activeModelId=entry.models[file==='almandine.dat'?2:1].id;
  entry.name=file.replace('.dat','');
  const provenance={purpose:'New browser-core worked example; not an official MATLAB solution',foldCenter:256.5,referenceFieldT:33,constants:constants.id};
  const document=await createWorkspaceFile(workspace,provenance);
  // Verify actual save/open binding for every model, not just JSON structure.
  const reopened=await openWorkspaceFile(document,cal,file,evaluate);
  if(reopened.notice) throw new Error(reopened.notice);
  for(const model of activeSpectrum(reopened.workspace).models) if(!modelSnapshot(activeSpectrum(reopened.workspace),model).fit) throw new Error('Fit did not survive reload');
  await writeFile(join(output,file.replace('.dat','.mossa')),JSON.stringify(document,null,2)+'\n');
  console.log(file,JSON.stringify(models.map(m=>({model:m.name,sse:m.result.evaluation.sse,warnings:m.result.warnings,sites:m.result.project.sites.map((s,i)=>({cs:s.params.cs.value,qs:s.params.qs.value,width:s.params.fwhm.value,fraction:m.result.intensity_fractions?.[i]?.value}))})),null,2));
}
manifest.analysis={referenceFieldT:33,manualFoldCenter:256.5,drive:'linear',weighting:'unweighted',magneticConstants:constants.id,almandineCalibration:{max:almCal.max,shift:almCal.shift}};
await writeFile(join(output,'provenance.json'),JSON.stringify(manifest,null,2)+'\n');
