// node --import tsx scripts/benchmark-native-derivatives.mjs --workers auto --repeats 5
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpus } from 'node:os';
import { NativeFixture } from '../tests/native-transport.ts';
import { fitMultiStartAsync } from '../src/multistart.mjs';

const args = process.argv.slice(2), option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const repeats = Number(option('--repeats', '5'));
const workers = option('--workers', 'auto').split(',').map(n => n === 'auto' ? n : Number(n));
assert.ok(Number.isInteger(repeats) && repeats > 0);
assert.ok(workers.every(n => n === 'auto' || Number.isInteger(n) && n >= 1 && n <= 8));
const output = resolve(option('--output', 'validation-data/performance/native-derivatives-final.json'));
const baselinePath = resolve(option('--baseline', 'validation-data/performance/runtime/native-derivatives/baseline/native_fixture'));
const currentPath = resolve('rust-core/target/release/examples/native_fixture');
const hash = value => createHash('sha256').update(Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const load = file => JSON.parse(readFileSync(file));
const median = values => { const sorted = [...values].sort((a,b) => a-b); return (sorted[Math.floor((sorted.length-1)/2)] + sorted[Math.floor(sorted.length/2)]) / 2; };
execFileSync('cargo', ['build', '--locked', '--release', '--manifest-path', 'rust-core/Cargo.toml', '--example', 'native_fixture'], { stdio: 'inherit' });
const baseline = new NativeFixture(baselinePath), current = new NativeFixture(currentPath);
const report = { date: new Date().toISOString(), repeats, workers,
  method: 'Complete result must exactly equal archived pre-change native fitter and current serial path. One excluded warmup per configuration/case; paired current-serial/parallel fits alternate order. Timings include native JSON transport and complete diagnostics, exclude UI/progress; pool is persistent. Cold timings are separate.',
  environment: { node: process.version, cpu: cpus()[0]?.model, logical_cpus: cpus().length, platform: process.platform, arch: process.arch, rustc: execFileSync('rustc',['--version'],{encoding:'utf8'}).trim() },
  baseline_sha256: hash(readFileSync(baselinePath)), current_sha256: hash(readFileSync(currentPath)),
  source_sha256: Object.fromEntries(['rust-core/src/lib.rs','rust-core/src/native.rs','rust-core/src/native/derivatives.rs','rust-core/Cargo.toml','rust-core/Cargo.lock','src/native-engine.ts','src/native-session.ts','src/native-comparison.ts','src-tauri/src/native_engine.rs'].map(path => [path,hash(readFileSync(path))])),
  cold: [], runs: [] };
assert.equal(report.baseline_sha256, load('validation-data/performance/native-derivatives-baseline-provenance.json').binary_sha256);
mkdirSync(dirname(output), { recursive:true });
const save = () => writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const compute = (fixture, operation, project, n) => fixture.transport.invoke('native_compute', { session:'derivatives', operation, project, ...(n === 'auto' || n === undefined ? {} : {derivativeWorkers:n}) });
async function single(fixture, c, n) {
  const start=performance.now(); const response=await compute(fixture,c.operation,c.project,n);
  assert.equal(response.execution.fallback,undefined,`${c.id}: infrastructure fallback`);
  return { result:response.result, ms:performance.now()-start, core_ms:response.elapsed, execution:response.execution };
}
async function search(fixture,c,n) {
  let used=1;
  const start=performance.now();
  const result=await fitMultiStartAsync(c.project, async p => {
    const response=await compute(fixture,'fit',p,n); assert.equal(response.execution.fallback,undefined);
    used=Math.max(used,response.execution.derivative_workers);return response.result;
  },async p=>(await compute(fixture,'evaluate',p,1)).result);
  return { result, ms:performance.now()-start, execution:{backend:'native-rust',derivative_workers:used} };
}
try {
  for(const fixture of [baseline,current])await fixture.transport.invoke('native_compute_start',{session:'derivatives'});
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
  if(args.includes('--multistart')) {
    const searches=[];
    const counts=option('--starts','4,12').split(',').map(Number);assert.ok(counts.every(n=>Number.isInteger(n)&&n>=2&&n<=32));
    for(const id of ['MS_MexicanMagnetite_transmission','MS-Fe2O3-Fe3O4_70-30_coarse'])for(const count of counts)for(const strategy of ['full','selective']) {
      const c=copy(id);c.id=`${id}_${strategy}_${count}`;c.project.search_starts=count;c.project.search_strategy=strategy;c.search=true;searches.push(c);
      c.receipt_id=id;
    }
    cases.splice(0,cases.length,...searches);
  }
  const selected=cases.filter(c=>!args.includes('--case')||c.id.includes(option('--case','')));assert.ok(selected.length);
  report.input_sha256=hash(selected);
  const saved=args.includes('--multistart')?load('validation-data/performance/selective-final.json'):null;
  if(saved) {
    assert.equal(saved.source_sha256['rust-core/src/lib.rs'],load('validation-data/performance/native-derivatives-baseline-provenance.json').source_sha256['rust-core/src/lib.rs']);
    assert.equal(saved.source_sha256['src/multistart.mjs'],hash(readFileSync('src/multistart.mjs')));
    report.reference_receipt_sha256=hash(readFileSync('validation-data/performance/selective-final.json'));
    report.method+=' Multistart complete references are taken from the frozen prior receipt, whose core and search hashes must match the archived baseline.';
  }
  for(const c of selected) {
    const run=c.search?search:single;
    const cached=saved?.runs.find(r=>r.backend==='native'&&r.id===c.receipt_id&&r.starts===c.project.search_starts);
    const reference=cached?{result:cached.results[c.project.search_strategy]}:await run(baseline,c,1);
    // Compare the new serial build with the frozen native binary as well as
    // comparing thread counts. Changes in compiler layout cannot hide drift.
    const serial=await run(current,c,1);assert.deepEqual(serial.result,reference.result,`${c.id}: changed serial fitter`);
    for(const n of workers) {
      const cold=await run(current,c,n);assert.deepEqual(cold.result,reference.result,`${c.id}/${n}: cold fit`);
      report.cold.push({id:c.id,requested_workers:n,elapsed_ms:cold.ms,execution:cold.execution,pool_startup_included:report.cold.length===0});
      const samples={serial:[],parallel:[]},coreSamples={serial:[],parallel:[]};let execution;
      for(let repeat=0;repeat<repeats;repeat++)for(const mode of repeat%2?['parallel','serial']:['serial','parallel']) {
        const actual=await run(current,c,mode==='serial'?1:n);
        assert.deepEqual(actual.result,reference.result,`${c.id}/${n}/${mode}/${repeat}: complete fit or std changed`);
        samples[mode].push(actual.ms);if(actual.core_ms!==undefined)coreSamples[mode].push(actual.core_ms);
        if(mode==='parallel')execution=actual.execution;
      }
      const row={id:c.id,requested_workers:n,execution,repeats,baseline_verification_ms:reference.ms,serial_verification_ms:serial.ms,serial_ms:median(samples.serial),parallel_ms:median(samples.parallel),speedup:median(samples.serial)/median(samples.parallel),samples_ms:samples,core_samples_ms:coreSamples,exact:true,reference:reference.result};
      report.runs.push(row);save();
      console.log(`${c.id} ${n} (${execution.derivative_workers} used): ${row.serial_ms.toFixed(2)} -> ${row.parallel_ms.toFixed(2)} ms; ${row.speedup.toFixed(2)}x; EXACT`);
    }
  }
  report.passed=report.runs.length===selected.length*workers.length;save();
}finally{await baseline.close();await current.close();}
