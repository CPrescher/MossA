// Independently audit paired receipts, original-coordinate diagnostics and artifacts.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import {compareAnalytical} from './analytical-validation.mjs';
import {acceptableFit} from '../src/comparison.ts';
const base='validation-data/performance',runtime=`${base}/runtime/variable-projection`;
const read=p=>JSON.parse(readFileSync(p,'utf8')),sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const files=new Set(),checks={},nativeRows=[];
function audit(a,b){
 assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());
 for(const k of ['rank','free_parameters','dof'])assert.equal(a[k],b[k]);
 assert.deepEqual(Object.keys(a.errors).sort(),Object.keys(b.errors).sort());
 assert.deepEqual(Object.keys(a.evaluation.parameters).sort(),Object.keys(b.evaluation.parameters).sort());
 for(const [k,s]of Object.entries(a.errors)){
  const t=b.errors[k];assert.equal(t===null,s===null,k);
  if(s!==null){assert.ok(Number.isFinite(t)&&t>=0);assert.ok(Math.abs(t-s)<=1e-10+1e-4*s,k);}
 }
 assert.equal(a.intensity_fractions.length,b.intensity_fractions.length);
 for(let i=0;i<a.intensity_fractions.length;i++){
  const s=a.intensity_fractions[i],t=b.intensity_fractions[i];assert.deepEqual(Object.keys(s).sort(),Object.keys(t).sort());assert.equal(s.error===null,t.error===null);
  if(s.error!==null){assert.ok(Number.isFinite(t.error)&&t.error>=0);assert.ok(Math.abs(t.error-s.error)<=1e-10+1e-4*s.error);}
 }
 const q=compareAnalytical(a,b);assert.ok(q.passed&&q.same_minimum,JSON.stringify(q));if(acceptableFit(a))assert.ok(acceptableFit(b));
}
for(const [name,count]of [['native',31],['search',8],['search12',2]]){
 const p=`${base}/variable-projection-${name}.json`,d=read(p);files.add(p);assert.ok(d.passed);assert.equal(d.runs.length,count);
 for(const [p,h]of Object.entries(d.hashes)){assert.equal(sha(p),h,p);files.add(p);}
 for(const r of d.runs){assert.ok(r.passed&&r.same_minimum&&r.joint_reference_exact);assert.ok(r.same_point_uncertainties.passed&&r.numerical_point_uncertainties.passed);assert.equal(r.same_point_uncertainties.max_std_relative,0);assert.equal(r.same_point_uncertainties.max_fraction_std_relative,0);audit(r.reference,r.analytical);
  assert.ok(r.execution.optimized.projected_parameters.length>0);assert.ok(r.execution.optimized.projected_parameters.every(n=>Number.isInteger(n)&&n>=0&&n<=r.reference.free_parameters));
  nativeRows.push(r);
 }
 checks[`benchmark_${name}`]={passed:true,comparisons:count,joint_reference_exact:true,schema_and_std_rechecked:true,source_binary_hashes_match:true,same_coordinate_std_exact:true};
}
const p=`${base}/variable-projection-browser.json`,b=read(p);files.add(p);assert.ok(b.passed);assert.equal(b.runs.length,18);
for(const [stage,c]of Object.entries(b.clients))assert.equal(sha(`${runtime}/${stage}/mossa_core_bg.wasm`),c.wasm_sha256);
assert.equal(sha('src/wasm/mossa_core_bg.wasm'),b.clients.projected.wasm_sha256);
for(const r of b.runs){assert.ok(r.passed&&r.same_minimum&&r.joint_reference_exact);audit(r.reference,r.analytical);for(const e of Object.values(r.execution)){assert.equal(e.derivative_workers,1);assert.equal(e.fallback,undefined);}}
checks.benchmark_browser={passed:true,comparisons:18,joint_reference_exact:true,schema_and_std_rechecked:true,wasm_hashes_match:true};
const provenance=read(`${base}/variable-projection-baseline-provenance.json`);
for(const [p,h]of Object.entries(provenance)){
 const short=['native_fixture','mossa_core.js','mossa_core_bg.wasm','multistart.mjs'].includes(basename(p));
 const archived=`${runtime}/baseline/${short?basename(p):p}`;assert.equal(sha(archived),h,archived);files.add(archived);
}
const old=await import(`../${runtime}/baseline/mossa_core.js`),current=await import('../src/wasm/mossa_core.js');
await old.default({module_or_path:readFileSync(`${runtime}/baseline/mossa_core_bg.wasm`)});await current.default({module_or_path:readFileSync('src/wasm/mossa_core_bg.wasm')});
for(const r of nativeRows.slice(0,31)){
 const before=JSON.parse(old.evaluate_json(JSON.stringify(r.initial_project))),after=JSON.parse(current.evaluate_json(JSON.stringify(r.projected_project)));
 assert.deepEqual(after,before,`${r.id}: selecting projection must not fit/change evaluation curves`);
}
checks.forward_model={passed:true,cases:31,projection_selection_leaves_evaluation_exact:true};
for(const [key,name,count,rust]of [['rust','rust',72,true],['final_projection_checks','final-targeted',6,true],['js_wasm','mjs',163,false],['typescript_react','tsx',274,false],['native_integration','native',15,false]]){
 const p=`/tmp/mossa-varpro-${name}.log`,s=readFileSync(p,'utf8');assert.ok(rust?s.includes(`${count} passed; 0 failed`):s.includes(`pass ${count}`)&&s.includes('fail 0'),key);
 checks[key]={passed:true,tests:count,log_sha256:sha(p)};
}
let log='/tmp/mossa-varpro-build-web.log',s=readFileSync(log,'utf8');assert.ok(s.includes('Checked 1374 local links')&&s.includes('Desktop payload verified: 284 files'));
checks.desktop_manual_build={passed:true,typescript_compile:true,files:284,manual_links:1374,log_sha256:sha(log)};
log='/tmp/mossa-varpro-desktop-check.log';assert.ok(readFileSync(log,'utf8').includes('Finished `dev`'));checks.desktop_cargo_check={passed:true,log_sha256:sha(log)};
for(const p of ['README.md','PORTING.md','src/App.tsx','src/types.ts','src/session.ts','rust-core/Cargo.toml','rust-core/src/native.rs','rust-core/src/tests.rs','rust-core/src/analytical/distribution.rs','rust-core/src/analytical/transmission.rs','src/wasm/mossa_core.js','src/wasm/mossa_core_bg.wasm','tests/variable-projection.test.mjs','tests/variable-projection-options.test.tsx','tests/native-backend.integration.tsx','scripts/benchmark-variable-projection-browser.mjs','scripts/verify-variable-projection.mjs','manual/src/content/docs/guides/building-models.md',`${base}/VARIABLE-PROJECTION.md`,`${base}/variable-projection-baseline-provenance.json`])files.add(p);
const all=[...nativeRows,...b.runs];
const result={date:new Date().toISOString(),checks,maximum_relative_std:{parameter:Math.max(...all.map(r=>r.max_std_relative)),fraction:Math.max(...all.map(r=>r.max_fraction_std_relative)),same_coordinate:Math.max(...nativeRows.map(r=>r.same_point_uncertainties.max_std_relative)),same_coordinate_numerical:Math.max(...nativeRows.map(r=>r.numerical_point_uncertainties.max_std_relative))},sha256:Object.fromEntries([...files].sort().map(p=>[p,sha(p)]))};
writeFileSync(`${base}/variable-projection-verification.json`,JSON.stringify(result,null,2)+'\n');
console.log('Verified 41 native / 18 browser comparisons, exact joint controls, exact same-coordinate std, full error/fraction schemas, final hashes, and 31 unchanged forward evaluations.');
