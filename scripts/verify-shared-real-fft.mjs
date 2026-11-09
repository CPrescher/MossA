// Audit the staged receipts and current artifacts without rerunning timed fits.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {compareAnalytical} from './analytical-validation.mjs';
import {acceptableFit} from '../src/comparison.ts';
const base='validation-data/performance',runtime=`${base}/runtime/shared-real-fft`;
const read=p=>JSON.parse(readFileSync(p,'utf8')),sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const files=new Set(),checks={},allRows=[];
function audit(reference,actual){
 assert.deepEqual(Object.keys(actual).sort(),Object.keys(reference).sort());
 for(const k of ['dof','rank','free_parameters'])assert.equal(actual[k],reference[k]);
 assert.deepEqual(Object.keys(actual.errors).sort(),Object.keys(reference.errors).sort());
 assert.deepEqual(Object.keys(actual.evaluation.parameters).sort(),Object.keys(reference.evaluation.parameters).sort());
 for(const [k,a]of Object.entries(actual.errors)){
  const b=reference.errors[k];assert.equal(a===null,b===null,k);
  if(a!==null){assert.ok(Number.isFinite(a)&&a>=0,k);assert.ok(Math.abs(a-b)<=1e-10+1e-4*b,k);}
 }
 assert.equal(actual.intensity_fractions.length,reference.intensity_fractions.length);
 for(let i=0;i<actual.intensity_fractions.length;i++){
  const a=actual.intensity_fractions[i],b=reference.intensity_fractions[i];assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());
  assert.equal(a.error===null,b.error===null);
  if(a.error!==null){assert.ok(Number.isFinite(a.error)&&a.error>=0);assert.ok(Math.abs(a.error-b.error)<=1e-10+1e-4*b.error);}
 }
 const q=compareAnalytical(reference,actual);assert.ok(q.passed&&q.same_minimum,JSON.stringify(q));
 if(acceptableFit(reference))assert.ok(acceptableFit(actual));
 return q;
}
const receipts={};
for(const stage of ['shared','realfft','combined'])for(const [kind,n]of [['native',36],['search',8],['search12',2]]){
 const p=`${base}/${stage}-evaluation-${kind}.json`;if(stage==='combined'&&kind==='search12')continue;
 const d=read(p);receipts[`${stage}-${kind}`]=d;files.add(p);assert.ok(d.passed);assert.equal(d.runs.length,n);
 for(const [path,expected]of Object.entries(d.hashes)){
  let actual=path;
  if(stage==='shared'){
   if(path==='rust-core/target/release/examples/native_fixture')actual=`${runtime}/shared/native_fixture`;
   else if(existsSync(`${runtime}/shared/${path}`))actual=`${runtime}/shared/${path}`;
  }
  assert.equal(sha(actual),expected,`${stage}: ${path}`);files.add(actual);
 }
 for(const r of d.runs){
  assert.ok(r.passed&&r.same_minimum&&r.same_point_uncertainties.passed&&r.numerical_point_uncertainties.passed,r.id);
  audit(r.reference,r.analytical);if(stage==='shared')assert.deepEqual(r.reference,r.analytical);
  allRows.push(r);
 }
 checks[`benchmark_${stage}_${kind}`]={passed:true,comparisons:n,schema_and_std_rechecked:true,source_and_binary_hashes_match:true,complete_results_exact:stage==='shared'};
}
// Independently compare the original baseline and final 12-start winners.
checks.cumulative_search12={passed:true,comparisons:2,quality:receipts['realfft-search12'].runs.map(r=>{
 const old=receipts['shared-search12'].runs.find(q=>q.id===r.id);assert.deepEqual(r.initial_project,old.initial_project);
 return {id:r.id,...audit(old.reference,r.analytical)};
})};
const browserPath=`${base}/shared-real-fft-browser.json`,browser=read(browserPath);files.add(browserPath);assert.ok(browser.passed);assert.equal(browser.runs.length,108);
for(const [stage,c]of Object.entries(browser.clients))assert.equal(sha(`${runtime}/${stage}/mossa_core_bg.wasm`),c.wasm_sha256);
assert.equal(sha('src/wasm/mossa_core_bg.wasm'),browser.clients.realfft.wasm_sha256);
for(const r of browser.runs){assert.ok(r.passed&&r.same_minimum,r.id);audit(r.reference,r.analytical);if(r.to_stage==='shared')assert.deepEqual(r.reference,r.analytical);}
checks.benchmark_browser={passed:true,comparisons:108,schema_and_std_rechecked:true,wasm_hashes_match:true};
const old=await import(`../${runtime}/baseline/mossa_core.js`),current=await import('../src/wasm/mossa_core.js');
await old.default({module_or_path:readFileSync(`${runtime}/baseline/mossa_core_bg.wasm`)});await current.default({module_or_path:readFileSync('src/wasm/mossa_core_bg.wasm')});
let maxCurve=0,maxRelativeObjective=0;
for(const r of receipts['combined-native'].runs){
 const method=r.calibration?'evaluate_source_json':'evaluate_json',p=r.initial_project;
 const a=JSON.parse(current[method](JSON.stringify(p))),b=JSON.parse(old[method](JSON.stringify(p)));
 const numeric=JSON.parse(current[method](JSON.stringify({...p,derivative_method:'numerical'})));
 assert.deepEqual(numeric,b,`${r.id}: explicit numerical forward regression`);
 for(const k of ['background','components','parameters'])assert.deepEqual(a[k],b[k]);
 const scale=Math.max(1,...b.y.map(Math.abs));
 for(const k of ['y','residual']){
  assert.equal(a[k].length,b[k].length);
  for(let i=0;i<a[k].length;i++)assert.ok(Math.abs(a[k][i]-b[k][i])<=64*Number.EPSILON*scale,`${r.id}:${k}:${i}`);
 }
 for(let i=0;i<a.y.length;i++)maxCurve=Math.max(maxCurve,Math.abs(a.y[i]-b.y[i]));
 // Near an exact synthetic spectrum, SSE is a cancellation-sensitive
 // quantity. Bound its change by propagating the independently checked curve
 // roundoff, rather than demanding relative SSE precision it cannot have.
 const delta=64*Number.EPSILON*scale;
 for(const k of ['sse','objective']){
  const relative=Math.abs(a[k]-b[k])/Math.max(1,Math.abs(b[k]));maxRelativeObjective=Math.max(maxRelativeObjective,relative);
  const propagated=b.residual.reduce((sum,v,i)=>sum+(2*Math.abs(v)*delta+delta*delta)/(k==='objective'&&p.weighting==='counts'?p.spectrum.y[i]:1),0);
  const rounding=4*b.residual.length*Number.EPSILON*Math.max(1,Math.abs(b[k]));
  assert.ok(Math.abs(a[k]-b[k])<=propagated+rounding,`${r.id}:${k}`);
 }
}
checks.forward_roundoff={passed:true,cases:36,max_curve_count_difference:maxCurve,max_scaled_sse_objective_difference:maxRelativeObjective,numerical_override_exact:true};
for(const [key,name,n,rust]of [['rust','rust',65,true],['rust_cancellation','cancellation',1,true],['js_wasm','mjs',129,false],['native_integration','native',14,false]]){
 const p=`/tmp/mossa-shared-real-${name}.log`,s=readFileSync(p,'utf8');
 assert.ok(rust?s.includes(`${n} passed; 0 failed`):s.includes(`pass ${n}`)&&s.includes('fail 0'));
 checks[key]={passed:true,tests:n,log_sha256:sha(p)};
}
let p='/tmp/mossa-shared-real-build.log',s=readFileSync(p,'utf8');assert.ok(s.includes('Checked 1374 local links')&&s.includes('Desktop payload verified: 284 files'));
checks.desktop_manual_build={passed:true,links:1374,files:284,typescript_compile:true,log_sha256:sha(p)};
p='/tmp/mossa-shared-real-desktop-check.log';assert.ok(readFileSync(p,'utf8').includes('Finished `dev`'));checks.desktop_cargo_check={passed:true,log_sha256:sha(p)};
assert.ok(readFileSync('THIRD_PARTY_NOTICES.txt','utf8').includes('realfft 3.5.1'));
files.add('scripts/verify-shared-real-fft.mjs');
for(const p of ['README.md','PORTING.md','THIRD_PARTY_NOTICES.txt','rust-core/Cargo.toml','rust-core/Cargo.lock','rust-core/src/lib.rs','rust-core/src/analytical.rs','rust-core/src/analytical/distribution.rs','rust-core/src/analytical/source.rs','rust-core/src/analytical/transmission.rs','rust-core/src/tests.rs','rust-core/src/native.rs','src-tauri/Cargo.lock','src/wasm/mossa_core.js','src/wasm/mossa_core_bg.wasm','scripts/benchmark-shared-real-fft-browser.mjs','tests/transmission-analytical.test.mjs',`${base}/SHARED-REAL-FFT.md`,`${base}/shared-real-fft-baseline-provenance.json`,`${base}/shared-evaluation-stage-provenance.json`])files.add(p);
const report={date:new Date().toISOString(),checks,maximum_relative_std:{native:Math.max(...allRows.map(r=>r.max_std_relative)),browser:Math.max(...browser.runs.map(r=>r.max_std_relative)),identical_coordinate_reference:Math.max(...allRows.map(r=>r.same_point_uncertainties.max_std_relative)),identical_coordinate_numerical:Math.max(...allRows.map(r=>r.numerical_point_uncertainties.max_std_relative))},sha256:Object.fromEntries([...files].sort().map(p=>[p,sha(p)]))};
writeFileSync(`${base}/shared-real-fft-verification.json`,JSON.stringify(report,null,2)+'\n');
console.log(`Verified ${allRows.length} native and ${browser.runs.length} browser timed comparisons, cumulative 12-start quality, all result/std schemas, final hashes, and 36 forward roundoff checks.`);
