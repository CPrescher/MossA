// Actual production Engine/Worker fits in Chromium and WebKit.
import {build} from 'vite';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {analyticalCases,compareAnalytical} from './analytical-validation.mjs';
const args=process.argv.slice(2),option=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const {chromium,webkit}=await import(pathToFileURL(option('--playwright-module','/Users/clemens/.codex/worktrees/dioptas-react-desktop/Dioptas/desktop/node_modules/playwright-core/index.mjs')));
const repeats=Number(option('--repeats','3'));
const root=resolve('.'),client='validation-data/performance/runtime/analytical/browser-client';await mkdir(client,{recursive:true});
const entry=resolve(client,'entry.ts');await writeFile(entry,`export { Engine } from ${JSON.stringify(resolve('src/engine.ts'))};\n`);
await build({configFile:false,base:'./',logLevel:'error',publicDir:false,worker:{format:'es'},build:{outDir:client,emptyOutDir:false,rollupOptions:{input:entry,preserveEntrySignatures:'strict',output:{entryFileNames:'engine.js'}}}});
const core=await import('../validation-data/performance/runtime/analytical/baseline/mossa_core.js');await core.default({module_or_path:await readFile('validation-data/performance/runtime/analytical/baseline/mossa_core_bg.wasm')});
const {fitMultiStart}=await import('../src/multistart.mjs');
const cases=analyticalCases(p=>JSON.parse(core.evaluate_json(JSON.stringify(p)))).filter(c=>['thin-control','linked-mixed-sites'].includes(c.id)).flatMap(c=>[1,4].map(search_starts=>{
 const project={...c.project,search_starts};return {id:`${c.id}-${search_starts}`,project,reference:fitMultiStart(project,p=>JSON.parse(core.fit_json(JSON.stringify(p))),p=>JSON.parse(core.evaluate_json(JSON.stringify(p))))};
}));
let shared=false;
const server=createServer(async(req,res)=>{
 if(shared)for(const [k,v]of Object.entries({'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin'}))res.setHeader(k,v);
 res.setHeader('Cache-Control','no-store');
 if(req.url==='/bench'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Analytical derivative benchmark</title>');return;}
 try{const p=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(root+sep))throw Error();res.setHeader('Content-Type',extname(p)==='.wasm'?'application/wasm':'text/javascript');res.end(await readFile(p));}catch{res.statusCode=404;res.end();}
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const report={date:new Date().toISOString(),repeats,wasm_sha256:createHash('sha256').update(await readFile('src/wasm/mossa_core_bg.wasm')).digest('hex'),method:'One excluded warmup per method, alternating paired Engine.request wall times. Analytical requests with four workers must use one worker without fallback. Frozen numeric WASM/search is the scientific reference.',runs:[]};
const out=option('--output','validation-data/performance/analytical-browser.json'),save=()=>writeFile(out,JSON.stringify(report,null,2)+'\n');
try {
 for(const [browserName,launcher]of Object.entries({webkit,chromium})) {
  const browser=await launcher.launch({headless:true});
  try{for(const isolated of [false,true]) {
   shared=isolated;const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/bench`);
   const rows=await page.evaluate(async({cases,repeats,client})=>{
    const {Engine}=await import(client);let engine;await new Promise((r,j)=>{engine=new Engine(r,j);});
    const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)],rows=[];
    try{for(const c of cases)for(const workers of [1,4]) {
     const run=analytical=>engine.request('fit',analytical?{...c.project,derivative_method:'analytical'}:c.project,undefined,{derivativeWorkers:workers});
     const numeric=await run(false),analytic=await run(true),samples={numerical:[],analytical:[]};
     for(let i=0;i<repeats;i++)for(const a of i%2?[true,false]:[false,true]){const start=performance.now(),r=await run(a);samples[a?'analytical':'numerical'].push(performance.now()-start);if(JSON.stringify(r.result)!==JSON.stringify(a?analytic.result:numeric.result))throw Error('nondeterministic result');}
     rows.push({id:c.id,requested_workers:workers,numerical_ms:median(samples.numerical),analytical_ms:median(samples.analytical),speedup:median(samples.numerical)/median(samples.analytical),samples_ms:samples,numerical:numeric.result,analytical:analytic.result,execution:analytic.execution});
    }}finally{engine.stop();}return {rows,isolated:self.crossOriginIsolated};
   },{cases,repeats,client:`/${client}/engine.js`});
   assert.equal(rows.isolated,isolated);
   for(const row of rows.rows) {
    assert.deepEqual(row.numerical,cases.find(c=>c.id===row.id).reference,'numeric browser regression');
    assert.equal(row.execution.derivative_workers,1);assert.equal(row.execution.fallback,undefined);
    Object.assign(row,compareAnalytical(row.numerical,row.analytical));
    report.runs.push({browser:browserName,version:browser.version(),isolated,...row});
    console.log(browserName,isolated?'shared':'portable',row.id,`workers${row.requested_workers}: ${row.numerical_ms.toFixed(1)} -> ${row.analytical_ms.toFixed(1)} ms; ${row.passed?'PASS':row.failures.join(',')}`);
   }await save();await page.close();
  }}finally{await browser.close();}
 }
 report.passed=report.runs.every(r=>r.passed);await save();if(!report.passed)process.exitCode=1;
}finally{await new Promise(r=>server.close(r));}
