import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createProjectFile, openProjectFile } from '../src/projectFile';
import { summarizeFit, type Snapshot } from '../src/session';
import type { FitResult, Project, Evaluation } from '../src/types';
import init, { evaluate_json } from '../src/wasm/mossa_core.js';
const root=new URL('../validation-data/benchmark/',import.meta.url);
await init({module_or_path:readFileSync(new URL('../src/wasm/mossa_core_bg.wasm',import.meta.url))});
const selected=JSON.parse(readFileSync(new URL('selected-fits.json',root),'utf8'));
const cases=JSON.parse(readFileSync(new URL('cases.json',root),'utf8'));
const dest=new URL('projects/',root);mkdirSync(dest,{recursive:true});
let count=0;
for(const [id,variants] of Object.entries(selected)){
 for(const [label,run] of Object.entries(variants as Record<string,any>)){
  if(!run)continue;
  const result=run.result as FitResult;
  const cal={max:12,shift:0,sinusoidal:false,folding:false,center:256.5,autoFold:false};
  const snapshot:Snapshot={project:result.project,raw:null,cal,filename:`${id} — ${label}`,selected:0,fit:summarizeFit(result),fitElapsed:run.elapsed_ms};
  const source=cases.find((c:any)=>c.id===id).source;
  const doc=await createProjectFile(snapshot,{audit:'MossA measured-data fitting audit 2026-11-06',source,fit_variant:run.variant,interpretation:label==='empirical'?'Exploratory empirical parameterization; physical adequacy not established.':'See REPORT.md for model assumptions, conventions, and validation limits.'});
  const target=new URL(`${id}_${label}.mossa.json`,dest);
  writeFileSync(target,JSON.stringify(doc,null,2)+'\n');
  const reopened=await openProjectFile(JSON.parse(readFileSync(target,'utf8')),cal,'reopen-test',async(p:Project)=>JSON.parse(evaluate_json(JSON.stringify(p))) as Evaluation);
  if(!reopened.snapshot.fit)throw new Error(`Fit did not round-trip: ${id} ${label}`);
  count++;
 }
}
console.log(`Exported and reopened ${count} fitted MossA projects, preserving fit summaries.`);
