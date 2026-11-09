// Production Engine/Worker comparison using archived WASM for each stage.
import {build} from 'vite';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {compareAnalytical} from './analytical-validation.mjs';
import {compareEquivalentSites} from './compare-equivalent-sites.mjs';
import {variableProjectionCases} from './variable-projection-cases.mjs';
const args=process.argv.slice(2),option=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const {chromium,webkit}=await import(pathToFileURL(option('--playwright-module','/Users/clemens/.codex/worktrees/dioptas-react-desktop/Dioptas/desktop/node_modules/playwright-core/index.mjs')));
const repeats=Number(option('--repeats','3')),stages=option('--stages','baseline,improved').split(',');
assert.ok(stages.length>=2);
const runtime=option('--runtime','validation-data/performance/runtime/variable-projection-multistart'),root=resolve('.');
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
const cases=variableProjectionCases(evaluate,source).filter(c=>['Sextet-PseudoVoigt','linked-mixed-sites','bounded-intensity','xvbf-thin-mixture','coincident-starts','MS-Fe2O3-Fe3O4_70-30_coarse','MS_MexicanMagnetite_coarse'].includes(c.id)).flatMap(c=>(['MS-Fe2O3-Fe3O4_70-30_coarse','MS_MexicanMagnetite_coarse'].includes(c.id)?[1,4]:[1]).map(search_starts=>({...c,id:`${c.id}-${search_starts}`,project:{...c.project,search_starts}})));
let shared=false;
const server=createServer(async(req,res)=>{
 if(shared)for(const [k,v] of Object.entries({'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin'}))res.setHeader(k,v);
 res.setHeader('Cache-Control','no-store');
 if(req.url==='/bench'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Thin variable projection benchmark</title>');return;}
 try{const p=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(root+sep))throw Error();res.setHeader('Content-Type',extname(p)==='.wasm'?'application/wasm':'text/javascript');res.end(await readFile(p));}catch{res.statusCode=404;res.end();}
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const report={date:new Date().toISOString(),stages,repeats,clients,method:'Previous variable projection, joint fitting, and improved variable projection with exact-coordinate joint continuation. Current joint output must remain exact. Both browsers use ordinary portable hosting; analytical methods require no shared-memory transport. Verified WASM for both stages. One excluded warmup, alternating paired full-fit Engine.request wall times. Identical starting projects and production search/finalization. No numerical helper workers or infrastructure fallback.',runs:[]};
const out=option('--output','validation-data/performance/variable-projection-multistart-browser.json'),save=()=>writeFile(out,JSON.stringify(report,null,2)+'\n');
try{
 for(const [browserName,launcher] of Object.entries({webkit,chromium})){
  const browser=await launcher.launch({headless:true});
  try{for(const isolated of [false]){
   shared=isolated;const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/bench`);
   const data=await page.evaluate(async({cases,repeats,clients,stages})=>{
    const engines={};for(const k of stages){const {Engine}=await import(clients[k].entry);await new Promise((r,j)=>{engines[k]=new Engine(r,j);});}
    const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)],rows=[];
    try{for(const c of cases){
     const run=mode=>engines[mode==='joint'?'baseline':mode].request('fit',mode==='joint'?c.project:{...c.project,thin_solver:'variable_projection'});
     const warm={},samples={};for(const mode of ['baseline','joint','improved']){warm[mode]=await run(mode);samples[mode]=[];}
     const joint=await engines.improved.request('fit',{...c.project,thin_solver:'joint'});delete joint.result.project.thin_solver;if(JSON.stringify(joint.result)!==JSON.stringify(warm.joint.result))throw Error('joint browser reference regression');
     for(let i=0;i<repeats;i++)for(const mode of i%2?['improved','joint','baseline']:['baseline','joint','improved']){const t=performance.now(),r=await run(mode);samples[mode].push(performance.now()-t);if(JSON.stringify(r.result)!==JSON.stringify(warm[mode].result))throw Error('nondeterministic result');}
     rows.push({id:c.id,reference_ms:median(samples.baseline),joint_ms:median(samples.joint),optimized_ms:median(samples.improved),speedup:median(samples.baseline)/median(samples.improved),speedup_joint:median(samples.joint)/median(samples.improved),samples_ms:{reference:samples.baseline,joint:samples.joint,optimized:samples.improved},reference:warm.baseline.result,joint_reference:warm.joint.result,analytical:warm.improved.result,joint_reference_exact:true,execution:{reference:warm.baseline.execution,joint:warm.joint.execution,optimized:warm.improved.execution}});
    }}finally{for(const e of Object.values(engines))e.stop();}return {rows,isolated:self.crossOriginIsolated};
   },{cases,repeats,clients,stages});
   assert.equal(data.isolated,isolated);
   for(const row of data.rows){
    for(const e of Object.values(row.execution)){assert.equal(e.derivative_workers,1);assert.equal(e.fallback,undefined);}
    Object.assign(row,compareAnalytical(row.reference,row.analytical));
    row.joint_quality=compareEquivalentSites(row.joint_reference,row.analytical);
    if(!row.same_minimum||!row.joint_quality.passed||!row.joint_quality.same_minimum){row.passed=false;row.failures.push('different-minimum');}
    if(row.reference.converged&&!row.analytical.converged&&!(['NumericalNoProgress','SolverFailed'].includes(row.analytical.termination)&&row.analytical.stationarity!==null&&row.analytical.stationarity<=1e-6)){row.passed=false;row.failures.push('lost-convergence');}
    report.runs.push({browser:browserName,version:browser.version(),isolated,...row});console.log(browserName,isolated?'shared':'portable',row.id,`before→after ${row.reference_ms.toFixed(1)} -> ${row.optimized_ms.toFixed(1)} ms; ${row.passed?'PASS':row.failures.join(',')}`);
   }
   await save();await page.close();
  }}finally{await browser.close();}
 }
 report.passed=report.runs.every(r=>r.passed);await save();if(!report.passed)process.exitCode=1;
}finally{await new Promise(r=>server.close(r));}
