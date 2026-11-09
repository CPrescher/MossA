// Independent audit of raw stage results and their frozen implementations.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {compareAnalytical} from './analytical-validation.mjs';
import {acceptableFit} from '../src/comparison.ts';
const base='validation-data/performance',runtime=`${base}/runtime/deterministic-projection`;
const read=p=>JSON.parse(readFileSync(p,'utf8')),sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const files=new Set(),checks={},all=[];
function audit(a,b,exact){
 assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());
 for(const k of ['rank','free_parameters','dof'])assert.equal(a[k],b[k]);
 assert.deepEqual(Object.keys(a.errors).sort(),Object.keys(b.errors).sort());
 assert.deepEqual(Object.keys(a.evaluation.parameters).sort(),Object.keys(b.evaluation.parameters).sort());
 for(const [k,s]of Object.entries(a.errors)){const t=b.errors[k];assert.equal(t===null,s===null);if(s!==null){assert.ok(Number.isFinite(t)&&t>=0);assert.ok(Math.abs(t-s)<=1e-10+1e-4*s,k);}}
 assert.equal(a.intensity_fractions.length,b.intensity_fractions.length);
 for(let i=0;i<a.intensity_fractions.length;i++){
  const s=a.intensity_fractions[i],t=b.intensity_fractions[i];assert.deepEqual(Object.keys(s).sort(),Object.keys(t).sort());assert.equal(s.error===null,t.error===null);assert.equal(s.value===null,t.value===null);
  if(s.error!==null){assert.ok(Number.isFinite(t.error)&&t.error>=0);assert.ok(Math.abs(t.error-s.error)<=1e-10+1e-4*s.error);}
  if(s.value!==null)assert.ok(Math.abs(t.value-s.value)<=1e-7*Math.max(1,Math.abs(s.value))+.001*(s.error??0));
 }
 const q=compareAnalytical(a,b);assert.ok(q.passed&&q.same_minimum,JSON.stringify(q));if(acceptableFit(a))assert.ok(acceptableFit(b));if(exact)assert.deepEqual(a,b);
 return q;
}
for(const [stage,name,count]of [['parallel','native',61],['parallel','search',8],['parallel','search12',4],['products','pilot-native',61],['products','pilot-search12',4],['products','native',183],['products','search',24],['products','search12',12]]){
 const p=`${base}/deterministic-projection-${stage}-${name}.json`,d=read(p);files.add(p);assert.ok(d.passed,p);assert.equal(d.runs.length,count,p);
 for(const [p,h]of Object.entries(d.hashes)){
  const owner=stage==='parallel'&&!p.startsWith(runtime+'/')?`${runtime}/parallel/${p}`:p;
  assert.ok(existsSync(owner),owner);assert.equal(sha(owner),h,owner);files.add(owner);
 }
 for(const r of d.runs){
  assert.ok(r.passed&&r.same_minimum);
  if(r.id.includes('velocity-calibration-roundoff'))assert.ok(r.reference.converged&&r.analytical.converged);
  const q=audit(r.reference,r.analytical,r.from_stage==='baseline'&&r.to_stage==='parallel');
  for(const k of Object.keys(q))assert.deepEqual(r[k],q[k],`${r.id}:${k}`);
  assert.ok(r.same_point_uncertainties.passed&&r.numerical_point_uncertainties.passed);
  assert.equal(r.same_point_uncertainties.max_std_relative,0);assert.equal(r.same_point_uncertainties.max_fraction_std_relative,0);
  for(const e of Object.values(r.execution)){assert.equal(e.fallback,undefined);assert.ok((e.search_workers??1)<=2);}
  if(r.id.includes('coarse-')&&r.project.search_starts>=4)assert.equal(r.execution.optimized.search_workers,2);
  all.push(r);
 }
 checks[`${stage}_${name}`]={passed:true,comparisons:count,source_binary_hashes_match:true,full_schemas_and_quality_recomputed:true,same_coordinate_covariance_exact:true};
}
for(const [name,count]of [['parallel-browser',24],['browser',84]]){
 const p=`${base}/deterministic-projection-${name}.json`,b=read(p);files.add(p);assert.ok(b.passed);assert.equal(b.runs.length,count);
 for(const [stage,c]of Object.entries(b.clients)){
  const artifact=`${runtime}/${stage}/src/wasm/mossa_core_bg.wasm`;assert.equal(sha(artifact),c.wasm_sha256);files.add(artifact);
  assert.ok(readFileSync(`${runtime}/entry-${stage}.ts`,'utf8').includes(`${stage}/src/engine.ts`));
 }
 for(const r of b.runs){
  assert.ok(r.passed&&r.same_minimum);
  if(r.id.includes('velocity-calibration-roundoff'))assert.ok(r.reference.converged&&r.analytical.converged);
  audit(r.reference,r.analytical,r.from_stage==='baseline'&&r.to_stage==='parallel');
  for(const e of Object.values(r.execution)){assert.equal(e.derivative_workers,1);assert.equal(e.fallback,undefined);assert.ok((e.search_workers??1)<=2);}
  if(/coarse-(4|12)$/.test(r.id))assert.equal(r.execution.optimized.search_workers,2);
  all.push(r);
 }
 checks[name]={passed:true,comparisons:count,browsers:2,full_schemas_and_quality_recomputed:true,verified_wasm:true,actual_search_helpers_checked:true};
}
for(const stage of ['baseline','parallel','products']){
 const p=`${base}/deterministic-projection-${stage}-provenance.json`,d=read(p);files.add(p);
 for(const [relative,h]of Object.entries(d)){const archived=`${runtime}/${stage}/${relative}`;assert.equal(sha(archived),h,archived);files.add(archived);}
}
assert.equal(sha(`${runtime}/baseline/native_fixture`),sha(`${runtime}/parallel/native_fixture`));
assert.equal(sha(`${runtime}/baseline/src/wasm/mossa_core_bg.wasm`),sha(`${runtime}/parallel/src/wasm/mossa_core_bg.wasm`));
checks.parallel_arithmetic={passed:true,native_and_wasm_binaries_unchanged:true,complete_results_exact:true};
for(const [name,p]of [['native_fixture','rust-core/target/release/examples/native_fixture'],['src/wasm/mossa_core.js','src/wasm/mossa_core.js'],['src/wasm/mossa_core_bg.wasm','src/wasm/mossa_core_bg.wasm']]){assert.equal(sha(`${runtime}/products/${name}`),sha(p));files.add(`${runtime}/products/${name}`);files.add(p);}
for(const [key,path,count,rust]of [['rust','/tmp/mossa-products-rust-final.log',94,true],['profile_feature','/tmp/mossa-products-profile.log',5,true],['js','/tmp/mossa-products-js.log',177,false],['native','/tmp/mossa-products-native.log',20,false],['typescript','/tmp/mossa-products-tsx.log',277,false],['initial_native','/tmp/mossa-ordered-native.log',20,false]]){
 const s=readFileSync(path,'utf8');assert.ok(rust?s.includes(`${count} passed; 0 failed`):s.includes(`pass ${count}`)&&s.includes('fail 0'),key);checks[key]={passed:true,tests:count,log_sha256:sha(path)};
}
let log='/tmp/mossa-products-web.log',s=readFileSync(log,'utf8');assert.ok(s.includes('tsc -b && vite build')&&s.includes('✓ built in'));checks.web_build={passed:true,typescript_compile:true,vite:true,log_sha256:sha(log)};
log='/tmp/mossa-products-desktop.log';assert.ok(readFileSync(log,'utf8').includes('Finished `dev`'));checks.desktop_cargo={passed:true,log_sha256:sha(log)};
log='/tmp/mossa-products-desktop-web.log';s=readFileSync(log,'utf8');assert.ok(s.includes('Desktop payload verified: 284 files')&&s.includes('Checked 1374 local links'));checks.desktop_manual_build={passed:true,payload_files:284,local_links:1374,log_sha256:sha(log)};

for(const p of ['rust-core/Cargo.toml','rust-core/Cargo.lock','rust-core/src/variable_projection.rs','src/multistart.mjs','src/multistart.d.mts','src/native-engine.ts','src/native-session.ts','src/engine.ts','src/worker.ts','src/search-worker.ts','src/search-lane.ts','tests/deterministic-search.test.mjs','tests/search-lane.test.tsx','tests/native-backend.integration.tsx','scripts/benchmark-deterministic-projection.mjs','scripts/benchmark-deterministic-projection-browser.mjs','scripts/verify-deterministic-projection.mjs','README.md','PORTING.md',`${base}/DETERMINISTIC-PROJECTION.md`])files.add(p);
const old=await import(`../${runtime}/baseline/src/wasm/mossa_core.js`),current=await import('../src/wasm/mossa_core.js');
await old.default({module_or_path:readFileSync(`${runtime}/baseline/src/wasm/mossa_core_bg.wasm`)});await current.default({module_or_path:readFileSync('src/wasm/mossa_core_bg.wasm')});
const single=read(`${base}/deterministic-projection-products-native.json`).runs.filter(r=>r.from_stage==='baseline'&&r.to_stage==='products');
for(const r of single){const method=r.calibration?'evaluate_source_json':'evaluate_json';assert.deepEqual(JSON.parse(old[method](JSON.stringify(r.project))),JSON.parse(current[method](JSON.stringify(r.project))),r.id);}
checks.forward_model={passed:true,cases:61,bit_exact:true};
const result={date:new Date().toISOString(),passed:true,checks,maximum_relative_std:{parameter:Math.max(...all.map(r=>r.max_std_relative)),fraction:Math.max(...all.map(r=>r.max_fraction_std_relative)),same_coordinate:0,numerical_same_coordinate:Math.max(...all.filter(r=>r.numerical_point_uncertainties).map(r=>r.numerical_point_uncertainties.max_std_relative))},hashes:Object.fromEntries([...files].sort().map(p=>[p,sha(p)]))};
writeFileSync(`${base}/deterministic-projection-verification.json`,JSON.stringify(result,null,2)+'\n');console.log('Verified 465 scientific comparisons (97 isolated parallel, 65 product pilot, 219 final native, 84 final browser); exact parallel-stage complete results, exact same-coordinate covariance, 61 unchanged forward models, helper execution, artifact hashes and regression/build logs.');
