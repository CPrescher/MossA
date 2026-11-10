// Paired Auto-native benchmark against the frozen pre-change native binary.
// node --import tsx scripts/benchmark-remaining-work.mjs --repeats 3
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {cpus} from 'node:os';
import {NativeFixture} from '../tests/native-transport.ts';
import {fitMultiStartAsync} from '../src/multistart.mjs';
const args=process.argv.slice(2),option=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const repeats=Number(option('--repeats','3'));assert.ok(Number.isInteger(repeats)&&repeats>0);
const stages=option('--stages',args.includes('--multistart')?'eager,deferred':'profile,norms,final').split(',');
const root='validation-data/performance/runtime/remaining-work';
const config={profile:{binary:root+'/profile/native_fixture'},norms:{binary:root+'/norms/native_fixture'},final:{binary:'rust-core/target/release/examples/native_fixture',defer:true},eager:{binary:'rust-core/target/release/examples/native_fixture'},deferred:{binary:'rust-core/target/release/examples/native_fixture',defer:true}};
assert.ok(stages.every(k=>config[k]));
const hash=v=>createHash('sha256').update(Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
const load=p=>JSON.parse(readFileSync(p));
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const output=resolve(option('--output','validation-data/performance/remaining-work-final.json'));
execFileSync('cargo',['build','--locked','--release','--manifest-path','rust-core/Cargo.toml','--example','native_fixture'],{stdio:'inherit'});
const baseline=new NativeFixture(resolve(root+'/baseline/native_fixture'));
const clients=Object.fromEntries(stages.map(k=>[k,new NativeFixture(resolve(config[k].binary))]));
const report={date:new Date().toISOString(),repeats,stages,method:'Auto native before these three changes versus each optimized stage. One excluded warmup per stage/case; paired baseline/stage searches alternate order. All complete results must exactly equal the frozen pre-change binary, including all std, diagnostics and search decisions. UI/progress publishing excluded; native JSON transport and finalization included.',environment:{node:process.version,cpu:cpus()[0]?.model,logical_cpus:cpus().length,rustc:execFileSync('rustc',['--version'],{encoding:'utf8'}).trim()},binaries:{baseline:hash(readFileSync(root+'/baseline/native_fixture')),...Object.fromEntries(stages.map(k=>[k,hash(readFileSync(config[k].binary))]))},source_sha256:Object.fromEntries(['rust-core/src/lib.rs','rust-core/src/native.rs','rust-core/src/parallel.rs','rust-core/vendor/basin/src/core/math/dense_svd.rs','src/multistart.mjs','src/native-engine.ts','src/worker.ts'].map(p=>[p,hash(readFileSync(p))])),runs:[]};
assert.equal(report.binaries.baseline,load('validation-data/performance/remaining-work-baseline-provenance.json').binary_sha256);
mkdirSync(dirname(output),{recursive:true});const save=()=>writeFileSync(output,JSON.stringify(report,null,2)+'\n');
async function compute(f,operation,project,n,state){return f.transport.invoke('native_compute',{session:'remaining',operation,project,...(n?{derivativeWorkers:n}:{}),...(state?{state}:{})});}
async function run(f,c,defer=false){
 let localFits=0,lightFits=0,finalizations=0,used=1;
 const request=async(op,p,state)=>{const r=await compute(f,op,p,undefined,state);assert.equal(r.execution.fallback,undefined);used=Math.max(used,r.execution.derivative_workers);if(op==='fit'){localFits++;if(r.result.finalization)lightFits++;}if(op==='finalize-fit')finalizations++;return r.result;};
 const started=performance.now();
 const result=c.search?await fitMultiStartAsync(c.project,p=>request('fit',p),p=>request('evaluate',p),undefined,defer?pending=>request('finalize-fit',pending.project,pending.state):undefined):await request(c.operation,c.project);
 if(lightFits)assert.equal(finalizations,1);assert.equal(result.finalization,undefined);
 return {result,ms:performance.now()-started,execution:{used_workers:used,local_fits:localFits,deferred_fits:lightFits,finalizations}};
}
try{
 for(const f of [baseline,...Object.values(clients)])await f.transport.invoke('native_compute_start',{session:'remaining'});
  const cases=['transmission-performance.json','transmission-measured-performance.json'].flatMap(name=>load(`tests/fixtures/${name}`).cases).map(c=>({id:c.id,project:c.project,operation:c.calibration?'fit-source':'fit'}));
  const copy = id => structuredClone(cases.find(c=>c.id===id));
  const gaussian=copy('source-calibration-lorentzian');gaussian.id='fitted-gaussian-source';
  gaussian.project.source_gaussians=[{center:0,fwhm:.21,weight:1},{center:.34,fwhm:.37,weight:.28}];
  gaussian.project.spectrum.y=(await compute(baseline,'evaluate-source',gaussian.project,1)).result.y.map((v,i)=>v+.1*Math.sin(17.3*i));
  gaussian.project.source_gaussians[1].fwhm*=1.05;cases.push(gaussian);
  const distribution=copy('xvbf-transmission');distribution.id='dependent-xvbf-weight-std';
  const d=distribution.project.sites[0].xvbf;d.cs.push(structuredClone(d.cs[0]));d.cs[1].center.value=-.4;d.cs[1].width.value=.08;
  d.cs[0].weight={value:.65,fit:true,min:0,max:1,link:null};d.cs[1].weight={value:.35,fit:true,min:0,max:1,link:null};
  distribution.project.spectrum.y=(await compute(baseline,'evaluate',distribution.project,1)).result.y.map((v,i)=>v+.1*Math.sin(17.3*i));
  d.cs[0].weight.value=.6;d.cs[1].weight.value=.4;cases.push(distribution);
  const limited=copy('three-sites-squared-source');limited.id='iteration-limit';limited.project.max_iterations=1;cases.push(limited);
  const fixed=copy('three-sites-squared-source');fixed.id='all-fixed';for(const s of fixed.project.sites)for(const p of Object.values(s.params))p.fit=false;fixed.project.background.forEach(p=>p.fit=false);cases.push(fixed);
  const rank=copy('thin-control');rank.id='rank-deficient-intensities';rank.project.sites=[structuredClone(rank.project.sites[0]),structuredClone(rank.project.sites[0])];for(const s of rank.project.sites)for(const [key,p]of Object.entries(s.params))p.fit=key==='intensity';cases.push(rank);
  const recovery=copy('three-sites-squared-source');recovery.id='bounded-lm-recovery';recovery.operation='fit-recovery';cases.push(recovery);
  const archived=load('validation-data/benchmark/wasm-results.json').runs;
  for(const id of ['MS_Fe2O3-Fe3O4_30-70','MS-Fe2O3-Fe3O4_70-30','MS_Fe2O3-Fe3O4_50-50','MS_MexicanMagnetite'])cases.push({id:`${id}_coarse`,project:archived.find(c=>c.id===id&&c.variant==='coarse-start').initial_project,operation:'fit'});
  if(args.includes('--multistart')){
    const selected=[];const counts=option('--starts','12').split(',').map(Number);
    assert.ok(counts.every(n=>Number.isInteger(n)&&n>=2&&n<=32));
    const models=option('--models','MS_MexicanMagnetite_transmission,three-sites-squared-source,singlet-lorentzian-source').split(',');
    for(const id of models)for(const count of counts)for(const strategy of ['full','selective']){
      const c=copy(id);assert.ok(c);c.id=`${id}_${strategy}_${count}`;c.project.search_starts=count;c.project.search_strategy=strategy;c.search=true;selected.push(c);
    }
    cases.splice(0,cases.length,...selected);
  }
  const selected=cases.filter(c=>!args.includes('--case')||c.id.includes(option('--case','')));assert.ok(selected.length);report.input_sha256=hash(selected);
  for(const c of selected){
    const expected=await run(baseline,c);
    for(const stage of stages){
      const f=clients[stage],settings=config[stage],warm=await run(f,c,settings.defer);assert.deepEqual(warm.result,expected.result,`${c.id}/${stage}: warmup result/std changed`);
      const samples={baseline:[],stage:[]};let actual;
      for(let repeat=0;repeat<repeats;repeat++)for(const mode of repeat%2?['stage','baseline']:['baseline','stage']){
        const r=mode==='baseline'?await run(baseline,c):await run(f,c,settings.defer);
        assert.deepEqual(r.result,expected.result,`${c.id}/${stage}/${repeat}: complete result/std changed`);samples[mode].push(r.ms);if(mode==='stage')actual=r;
      }
      const row={id:c.id,stage,repeats,baseline_ms:median(samples.baseline),optimized_ms:median(samples.stage),speedup:median(samples.baseline)/median(samples.stage),samples_ms:samples,execution:actual.execution,exact:true,reference:expected.result};
      report.runs.push(row);save();console.log(`${c.id} ${stage}: ${row.baseline_ms.toFixed(2)} -> ${row.optimized_ms.toFixed(2)} ms (${row.speedup.toFixed(2)}x); std EXACT; ${row.execution.deferred_fits} deferred / ${row.execution.finalizations} finalized`);
    }
  }
  report.passed=report.runs.length===selected.length*stages.length;save();
}finally{for(const f of [baseline,...Object.values(clients)])await f.close();}
