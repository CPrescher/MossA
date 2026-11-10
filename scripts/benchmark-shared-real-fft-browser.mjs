// Production Engine/Worker comparison using archived WASM for each stage.
import {build} from 'vite';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {compareAnalytical} from './analytical-validation.mjs';
import {sourceXvbfCases} from './source-xvbf-analytical-cases.mjs';
import {transmissionAnalyticalCases} from './transmission-analytical-cases.mjs';
const args=process.argv.slice(2),option=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const {chromium,webkit}=await import(pathToFileURL(option('--playwright-module','/Users/clemens/.codex/worktrees/dioptas-react-desktop/Dioptas/desktop/node_modules/playwright-core/index.mjs')));
const repeats=Number(option('--repeats','3')),stages=option('--stages','baseline,shared,realfft').split(',');
assert.ok(stages.length>=2);
const runtime='validation-data/performance/runtime/shared-real-fft',root=resolve('.');
const hash=data=>createHash('sha256').update(data).digest('hex');
async function client(name){
 const dir=`${runtime}/browser-${name}`;await mkdir(dir,{recursive:true});
 const entry=resolve(runtime,`entry-${name}.ts`);await writeFile(entry,`export { Engine } from ${JSON.stringify(resolve('src/engine.ts'))};\n`);
 await build({configFile:false,base:'./',logLevel:'error',publicDir:false,resolve:{alias:[{find:'./wasm/mossa_core',replacement:resolve(runtime,name,'mossa_core.js')}]},worker:{format:'es'},build:{outDir:dir,emptyOutDir:true,rollupOptions:{input:entry,preserveEntrySignatures:'strict',output:{entryFileNames:'engine.js'}}}});
 const wasmFiles=(await readdir(resolve(dir,'assets'))).filter(p=>p.endsWith('.wasm'));
 const expected=hash(await readFile(resolve(runtime,name,'mossa_core_bg.wasm')));
 assert.equal(wasmFiles.length,1);assert.equal(hash(await readFile(resolve(dir,'assets',wasmFiles[0]))),expected);
 return {entry:`/${dir}/engine.js`,wasm_sha256:expected};
}
const clients={};for(const name of stages)clients[name]=await client(name);
const core=await import(`../${runtime}/baseline/mossa_core.js`);await core.default({module_or_path:await readFile(`${runtime}/baseline/mossa_core_bg.wasm`)});
const evaluate=p=>JSON.parse(core.evaluate_json(JSON.stringify(p))),source=p=>JSON.parse(core.evaluate_source_json(JSON.stringify(p)));
const cases=[...sourceXvbfCases(evaluate,source).filter(c=>['source-calibration-lorentzian','source-calibration-gaussian-3','xvbf-thin-mixture','xvbf-transmission-mixture','xvbf-perfect-correlation'].includes(c.id)),...transmissionAnalyticalCases(evaluate).filter(c=>['three-sites-squared-source','MS_MexicanMagnetite_transmission'].includes(c.id))].flatMap(c=>(['xvbf-transmission-mixture','MS_MexicanMagnetite_transmission'].includes(c.id)?[1,4]:[1]).map(search_starts=>({...c,id:`${c.id}-${search_starts}`,project:{...c.project,search_starts}})));
let shared=false;
const server=createServer(async(req,res)=>{
 if(shared)for(const [k,v] of Object.entries({'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin'}))res.setHeader(k,v);
 res.setHeader('Cache-Control','no-store');
 if(req.url==='/bench'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Shared evaluation / real FFT benchmark</title>');return;}
 try{const p=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(root+sep))throw Error();res.setHeader('Content-Type',extname(p)==='.wasm'?'application/wasm':'text/javascript');res.end(await readFile(p));}catch{res.statusCode=404;res.end();}
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const report={date:new Date().toISOString(),stages,repeats,clients,method:'Production Engine/Worker bundles with the verified archived analytical WASM of each stage. One excluded warmup, alternating paired full-fit Engine.request wall times. Identical starting projects and production search/finalization. No numerical helper workers or infrastructure fallback.',runs:[]};
const out=option('--output','validation-data/performance/shared-real-fft-browser.json'),save=()=>writeFile(out,JSON.stringify(report,null,2)+'\n');
try{
 for(const [browserName,launcher] of Object.entries({webkit,chromium})){
  const browser=await launcher.launch({headless:true});
  try{for(const isolated of [false,true]){
   shared=isolated;const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/bench`);
   const data=await page.evaluate(async({cases,repeats,clients,stages})=>{
    const engines={};for(const k of stages){const {Engine}=await import(clients[k].entry);await new Promise((r,j)=>{engines[k]=new Engine(r,j);});}
    const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)],rows=[];
    try{for(const c of cases){
     const run=mode=>engines[mode].request(c.calibration?'fit-source':'fit',c.project);
     const warm={},samples={};for(const mode of stages){warm[mode]=await run(mode);samples[mode]=[];}
     for(let i=0;i<repeats;i++)for(const mode of i%2?[...stages].reverse():stages){const t=performance.now(),r=await run(mode);samples[mode].push(performance.now()-t);if(JSON.stringify(r.result)!==JSON.stringify(warm[mode].result))throw Error('nondeterministic result');}
     const pairs=stages.slice(1).map((name,i)=>[stages[i],name]);
     if(stages.length>2)pairs.push([stages[0],stages.at(-1)]);
     for(const [from,to] of pairs)rows.push({id:c.id,from_stage:from,to_stage:to,reference_ms:median(samples[from]),optimized_ms:median(samples[to]),speedup:median(samples[from])/median(samples[to]),samples_ms:{reference:samples[from],optimized:samples[to]},reference:warm[from].result,analytical:warm[to].result,execution:{reference:warm[from].execution,optimized:warm[to].execution}});
    }}finally{for(const e of Object.values(engines))e.stop();}return {rows,isolated:self.crossOriginIsolated};
   },{cases,repeats,clients,stages});
   assert.equal(data.isolated,isolated);
   for(const row of data.rows){
    for(const e of Object.values(row.execution)){assert.equal(e.derivative_workers,1);assert.equal(e.fallback,undefined);}
    Object.assign(row,compareAnalytical(row.reference,row.analytical));
    if(!row.same_minimum){row.passed=false;row.failures.push('different-minimum');}
    if(row.reference.converged&&!row.analytical.converged&&!(['NumericalNoProgress','SolverFailed'].includes(row.analytical.termination)&&row.analytical.stationarity!==null&&row.analytical.stationarity<=1e-6)){row.passed=false;row.failures.push('lost-convergence');}
    report.runs.push({browser:browserName,version:browser.version(),isolated,...row});console.log(browserName,isolated?'shared':'portable',row.id,`${row.from_stage}->${row.to_stage} ${row.reference_ms.toFixed(1)} -> ${row.optimized_ms.toFixed(1)} ms; ${row.passed?'PASS':row.failures.join(',')}`);
   }
   await save();await page.close();
  }}finally{await browser.close();}
 }
 report.passed=report.runs.every(r=>r.passed);await save();if(!report.passed)process.exitCode=1;
}finally{await new Promise(r=>server.close(r));}
