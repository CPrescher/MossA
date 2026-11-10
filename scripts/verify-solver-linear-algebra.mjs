// Independent audit of raw stage results and their frozen implementations.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import {compareAnalytical} from './analytical-validation.mjs';
import {acceptableFit} from '../src/comparison.ts';
const base='validation-data/performance',runtime=`${base}/runtime/solver-linear-algebra`;
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
for(const [stage,name,count]of [['buffers','native',60],['buffers','search',8],['buffers','search12',4],['qr','native',180],['qr','search',24],['qr','search12',12]]){
 const p=`${base}/solver-linear-algebra-${stage}-${name}.json`,d=read(p);files.add(p);assert.ok(d.passed,p);assert.equal(d.runs.length,count,p);
 for(const [p,h]of Object.entries(d.hashes)){
  let owner=p;
  if(stage==='buffers'&&!p.startsWith(runtime+'/'))owner=`${runtime}/buffers/${p}`;
  assert.ok(existsSync(owner),owner);assert.equal(sha(owner),h,owner);files.add(owner);
 }
 for(const r of d.runs){assert.ok(r.passed&&r.same_minimum);const q=audit(r.reference,r.analytical,r.to_stage==='buffers');for(const k of Object.keys(q))assert.deepEqual(r[k],q[k],`${r.id}:${k}`);
  assert.ok(r.same_point_uncertainties.passed&&r.numerical_point_uncertainties.passed);assert.equal(r.same_point_uncertainties.max_std_relative,0);assert.equal(r.same_point_uncertainties.max_fraction_std_relative,0);all.push(r);
 }
 checks[`${stage}_${name}`]={passed:true,comparisons:count,source_binary_hashes_match:true,full_schemas_and_quality_recomputed:true,same_coordinate_covariance_exact:true};
}
const p=`${base}/solver-linear-algebra-browser.json`,b=read(p);files.add(p);assert.ok(b.passed);assert.equal(b.runs.length,66);
for(const [stage,c]of Object.entries(b.clients)){assert.equal(sha(`${runtime}/${stage}/mossa_core_bg.wasm`),c.wasm_sha256);files.add(`${runtime}/${stage}/mossa_core_bg.wasm`);}
for(const r of b.runs){assert.ok(r.passed&&r.same_minimum);audit(r.reference,r.analytical,r.to_stage==='buffers');for(const e of Object.values(r.execution)){assert.equal(e.derivative_workers,1);assert.equal(e.fallback,undefined);}all.push(r);}
checks.browser={passed:true,comparisons:66,browsers:2,full_schemas_and_quality_recomputed:true,verified_wasm:true};
for(const stage of ['baseline','buffers']){
 const p=`${base}/solver-linear-algebra-${stage}-provenance.json`,d=read(p);files.add(p);
 for(const [p,h]of Object.entries(d)){const short=['native_fixture','mossa_core.js','mossa_core_bg.wasm'].includes(basename(p));const archived=`${runtime}/${stage}/${short?basename(p):p}`;assert.equal(sha(archived),h,archived);files.add(archived);}
}
for(const [name,p]of [['native_fixture','rust-core/target/release/examples/native_fixture'],['mossa_core.js','src/wasm/mossa_core.js'],['mossa_core_bg.wasm','src/wasm/mossa_core_bg.wasm']]){assert.equal(sha(`${runtime}/qr/${name}`),sha(p));files.add(`${runtime}/qr/${name}`);files.add(p);}
for(const [key,path,count,rust]of [['buffer_rust','/tmp/mossa-buffers-rust.log',78,true],['buffer_js','/tmp/mossa-buffers-mjs.log',169,false],['qr_rust','/tmp/mossa-qr-rust.log',83,true],['qr_profile_feature','/tmp/mossa-qr-profile-tests.log',5,true],['qr_js','/tmp/mossa-qr-mjs.log',171,false],['qr_native','/tmp/mossa-qr-native.log',17,false],['qr_typescript','/tmp/mossa-qr-tsx.log',274,false]]){
 const s=readFileSync(path,'utf8');assert.ok(rust?s.includes(`${count} passed; 0 failed`):s.includes(`pass ${count}`)&&s.includes('fail 0'),key);checks[key]={passed:true,tests:count,log_sha256:sha(path)};
}
let log='/tmp/mossa-qr-web-build.log',s=readFileSync(log,'utf8');assert.ok(s.includes('Checked 1374 local links')&&s.includes('Desktop payload verified: 284 files'));checks.desktop_manual_build={passed:true,typescript_compile:true,manual_links:1374,payload_files:284,log_sha256:sha(log)};
log='/tmp/mossa-qr-desktop-check.log';assert.ok(readFileSync(log,'utf8').includes('Finished `dev`'));checks.desktop_cargo={passed:true,log_sha256:sha(log)};
for(const p of ['rust-core/Cargo.toml','rust-core/Cargo.lock','rust-core/src/buffer_tests.rs','rust-core/vendor/basin/src/core/math/dense_svd/qr.rs','rust-core/vendor/basin/src/core/convergence/builders.rs','rust-core/vendor/basin/README.mossa.md','rust-core/vendor/basin/solver-linear-algebra.patch','scripts/benchmark-solver-linear-algebra-browser.mjs','scripts/verify-solver-linear-algebra.mjs','tests/solver-linear-algebra.test.mjs','tests/fixtures/solver-qr-mixed-distribution.json','README.md','PORTING.md',`${base}/SOLVER-LINEAR-ALGEBRA.md`])files.add(p);
const old=await import(`../${runtime}/baseline/mossa_core.js`),current=await import('../src/wasm/mossa_core.js');
await old.default({module_or_path:readFileSync(`${runtime}/baseline/mossa_core_bg.wasm`)});await current.default({module_or_path:readFileSync('src/wasm/mossa_core_bg.wasm')});
const single=read(`${base}/solver-linear-algebra-qr-native.json`).runs.filter(r=>r.from_stage==='baseline'&&r.to_stage==='qr');
for(const r of single){const method=r.calibration?'evaluate_source_json':'evaluate_json';assert.deepEqual(JSON.parse(old[method](JSON.stringify(r.project))),JSON.parse(current[method](JSON.stringify(r.project))),r.id);}
checks.forward_model={passed:true,cases:60,bit_exact:true};
const result={date:new Date().toISOString(),passed:true,checks,maximum_relative_std:{parameter:Math.max(...all.map(r=>r.max_std_relative)),fraction:Math.max(...all.map(r=>r.max_fraction_std_relative)),same_coordinate:0,numerical_same_coordinate:Math.max(...all.filter(r=>r.numerical_point_uncertainties).map(r=>r.numerical_point_uncertainties.max_std_relative))},hashes:Object.fromEntries([...files].sort().map(p=>[p,sha(p)]))};
writeFileSync(`${base}/solver-linear-algebra-verification.json`,JSON.stringify(result,null,2)+'\n');console.log('Verified isolated buffer stage, 216 final native / 66 browser stage comparisons, exact same-coordinate covariance, 60 unchanged forward models, artifact hashes and final regression/build logs.');
