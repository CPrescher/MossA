// Staged production-native benchmark; no builds/tests overlap timing.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {NativeFixture} from '../tests/native-transport.ts';
const args=process.argv.slice(2),opt=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const root='validation-data/performance/runtime/ftest-compact',stages=opt('--stages','reference,compact').split(','),repeats=Number(opt('--repeats','3'));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
let cases=[...JSON.parse(readFileSync('validation-data/performance/ftest-fixed-native.json')).cases,...JSON.parse(readFileSync('validation-data/performance/ftest-fixed-transmission-native.json')).cases];
if(args.includes('--case'))cases=cases.filter(c=>c.id.includes(opt('--case','')));
if(args.includes('--exclude'))cases=cases.filter(c=>!c.id.includes(opt('--exclude','')));
if(args.includes('--simulations'))cases=cases.map(c=>({...c,options:{...c.options,simulations:Number(opt('--simulations','199'))}}));
assert.ok(cases.length);assert.ok(repeats>=1);
const workers=opt('--workers','1,4').split(',').map(Number);
const files=['scripts/benchmark-ftest-native-pipeline.mjs','tests/native-transport.ts','validation-data/performance/ftest-fixed-native.json','validation-data/performance/ftest-fixed-transmission-native.json'];
function collect(path){for(const name of readdirSync(path)){const p=path+'/'+name;if(statSync(p).isDirectory())collect(p);else files.push(p);}}
for(const s of stages)collect(`${root}/${s}`);
const report={date:new Date().toISOString(),cpu:cpus()[0].model,node:process.version,stages,repeats,
  method:'Frozen stage-specific production native comparison modules and compiled cores. Observed fits retain full results; simulation searches/recovery/RNG/covariance unchanged. Full outputs must be bit exact. One excluded instrumented warmup for payload/call counts; three alternating uninstrumented paired complete-comparison times. Headless native JSON-lines adapter replaces Tauri IPC. Independent simulation workers 1/4; unchanged inner derivative worker=1. No builds/tests/timing overlap.',
  hashes:Object.fromEntries(files.map(p=>[p,sha(p)])),runs:[]};
const out=opt('--output','validation-data/performance/ftest-compact-native.json'),save=()=>writeFileSync(out,JSON.stringify(report,null,2)+'\n');
const clients={};
for(const stage of stages) {
  const f=new NativeFixture(resolve(root,stage,'native_fixture'));
  const api=await import(`../${root}/${stage}/src/native-comparison.ts`),session=await import(`../${root}/${stage}/src/native-session.ts`);
  clients[stage]={fixture:f,start:api.startComparison,Session:session.NativeSession};
}
async function run(stage,c,count,instrument=false) {
  const {fixture,start,Session}=clients[stage],invoke=fixture.transport.invoke;
  const metrics={calls:0,operations:0,request_bytes:0,response_bytes:0,batches:0};
  if(instrument)fixture.transport.invoke=async(command,args)=>{
    const relevant=command==='native_compute'||command==='native_comparison_batch';
    if(relevant){metrics.calls++;metrics.operations+=command==='native_compute'?1:args.request.operations.reduce((n,op)=>n+1+Number(!!op.prefit),0);metrics.batches+=Number(command==='native_comparison_batch');metrics.request_bytes+=Buffer.byteLength(JSON.stringify(args));}
    const r=await invoke(command,args);if(relevant)metrics.response_bytes+=Buffer.byteLength(JSON.stringify(r));return r;
  };
  try {
    const t=performance.now();
    const r=await start(c.simpler,c.larger,{...c.options,workers:count},()=>{},()=>new Session(fixture.transport),{compact:stage!=='reference',reusePreparation:stage==='prepared'}).promise;
    const ms=performance.now()-t;await fixture.idle();return {result:r,ms,metrics};
  }finally{fixture.transport.invoke=invoke;}
}
try {
  for(const c of cases)for(const count of workers) {
    const warm={},samples={};
    for(const stage of stages){console.log(`${c.id} workers=${count}: warmup ${stage}`);warm[stage]=await run(stage,c,count,true);samples[stage]=[];}
    for(const stage of stages.slice(1))assert.deepEqual(warm[stage].result,warm[stages[0]].result,`${c.id}:${stage}: full result changed`);
    for(let i=0;i<repeats;i++)for(const stage of i%2?[...stages].reverse():stages){const r=await run(stage,c,count);assert.deepEqual(r.result,warm[stage].result,`${c.id}:${stage}: nondeterminism`);samples[stage].push(r.ms);}
    const pairs=stages.slice(1).map((s,i)=>[stages[i],s]);if(stages.length>2)pairs.push([stages[0],stages.at(-1)]);
    for(const [from,to]of pairs){
      const row={id:c.id,workers:count,simulations:c.options.simulations,from,to,passed:true,full_result_bit_exact:true,p_values:[warm[from].result.pValue,warm[to].result.pValue],
        reference_ms:median(samples[from]),optimized_ms:median(samples[to]),speedup:median(samples[from])/median(samples[to]),samples_ms:{reference:samples[from],optimized:samples[to]},
        transport:{reference:warm[from].metrics,optimized:warm[to].metrics},reference:warm[from].result,optimized:warm[to].result};
      report.runs.push(row);save();console.log(`${c.id} workers=${count} ${from}->${to}: ${row.reference_ms.toFixed(2)} -> ${row.optimized_ms.toFixed(2)} ms (${row.speedup.toFixed(2)}x), bytes ${row.transport.reference.request_bytes+row.transport.reference.response_bytes} -> ${row.transport.optimized.request_bytes+row.transport.optimized.response_bytes}; EXACT`);
    }
  }
  report.passed=true;save();
}finally{for(const c of Object.values(clients))await c.fixture.close();}
