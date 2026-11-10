// Recheck raw paired results, full-coordinate covariance and frozen artifacts.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import {compareAnalytical} from './analytical-validation.mjs';
import {compareEquivalentSites} from './compare-equivalent-sites.mjs';
import {acceptableFit} from '../src/comparison.ts';
const base='validation-data/performance',runtime=`${base}/runtime/variable-projection-multistart`;
const read=p=>JSON.parse(readFileSync(p,'utf8')),sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const files=new Set(),checks={},native=[];
function audit(a,b){
 assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());
 for(const k of ['rank','free_parameters','dof'])assert.equal(a[k],b[k]);
 assert.deepEqual(Object.keys(a.errors).sort(),Object.keys(b.errors).sort());
 assert.deepEqual(Object.keys(a.evaluation.parameters).sort(),Object.keys(b.evaluation.parameters).sort());
 for(const [k,s]of Object.entries(a.errors)){const t=b.errors[k];assert.equal(t===null,s===null,k);if(s!==null){assert.ok(Number.isFinite(t)&&t>=0);assert.ok(Math.abs(t-s)<=1e-10+1e-4*s,k);}}
 assert.equal(a.intensity_fractions.length,b.intensity_fractions.length);
 for(let i=0;i<a.intensity_fractions.length;i++){const s=a.intensity_fractions[i],t=b.intensity_fractions[i];assert.deepEqual(Object.keys(s).sort(),Object.keys(t).sort());assert.equal(s.error===null,t.error===null);if(s.error!==null){assert.ok(Number.isFinite(t.error)&&t.error>=0);assert.ok(Math.abs(t.error-s.error)<=1e-10+1e-4*s.error);}}
 const q=compareAnalytical(a,b);assert.ok(q.passed&&q.same_minimum,JSON.stringify(q));if(acceptableFit(a))assert.ok(acceptableFit(b));
}
for(const [name,count]of [['native',31],['search',8],['search12-magnetite',2],['search12-mixture',2],['repeat-mixture',2]]){
 const p=`${base}/variable-projection-multistart-${name}.json`,d=read(p);files.add(p);assert.ok(d.passed,p);assert.equal(d.runs.length,count);
 for(const [p,h]of Object.entries(d.hashes)){assert.equal(sha(p),h,p);files.add(p);}
 for(const r of d.runs){assert.ok(r.passed&&r.same_minimum&&r.joint_reference_exact);audit(r.reference,r.analytical);for(const k of ['evaluation','errors','intensity_fractions'])assert.deepEqual(r.reference[k],r.analytical[k],`${r.id}:${k}`);assert.deepEqual(compareEquivalentSites(r.joint_reference,r.analytical),r.joint_quality);assert.ok(r.joint_quality.passed&&r.joint_quality.same_minimum);assert.ok(r.same_point_uncertainties.passed&&r.numerical_point_uncertainties.passed);assert.equal(r.same_point_uncertainties.max_std_relative,0);assert.equal(r.same_point_uncertainties.max_fraction_std_relative,0);assert.equal(r.execution.optimized.projection_profile,undefined);native.push(r);}
 checks[name]={passed:true,cases:count,strict_before_after_labels:true,joint_control_exact:true,same_coordinate_std_exact:true,hashes_match:true};
}
const tp=`${base}/variable-projection-multistart-trials-final.json`,trials=read(tp);files.add(tp);
assert.equal(trials.trial_audits.length,4);
for(const r of trials.trial_audits){audit(r.before,r.after);assert.deepEqual(compareAnalytical(r.before,r.after),Object.fromEntries(Object.entries(r).filter(([k])=>!['start','before','after'].includes(k))));}
assert.equal(trials.trials[1].execution.projection_profile,undefined);assert.ok(trials.trials[1].result.iterations<200);assert.deepEqual(trials.trials[1].execution.projection_handoffs,[75]);
checks.individual_magnetite_starts={passed:true,cases:4,minima_std_rechecked:true,slow_start_iterations:trials.trials[1].result.iterations,max_parameter_std_relative:Math.max(...trials.trial_audits.map(r=>r.max_std_relative)),max_fraction_std_relative:Math.max(...trials.trial_audits.map(r=>r.max_fraction_std_relative))};
const bp=`${base}/variable-projection-multistart-browser.json`,b=read(bp);files.add(bp);assert.ok(b.passed);assert.equal(b.runs.length,18);
for(const [stage,c]of Object.entries(b.clients))assert.equal(sha(`${runtime}/${stage}/mossa_core_bg.wasm`),c.wasm_sha256);
assert.equal(sha('src/wasm/mossa_core_bg.wasm'),b.clients.improved.wasm_sha256);
for(const r of b.runs){assert.ok(r.passed&&r.same_minimum&&r.joint_reference_exact);audit(r.reference,r.analytical);for(const k of ['evaluation','errors','intensity_fractions'])assert.deepEqual(r.reference[k],r.analytical[k],`${r.id}:${k}`);assert.deepEqual(compareEquivalentSites(r.joint_reference,r.analytical),r.joint_quality);assert.ok(r.joint_quality.passed&&r.joint_quality.same_minimum);for(const e of Object.values(r.execution)){assert.equal(e.derivative_workers,1);assert.equal(e.fallback,undefined);}}
checks.browser={passed:true,cases:18,strict_before_after_labels:true,joint_control_exact:true,wasm_hashes_match:true};
const targets=[...native,...b.runs].filter(r=>r.id.includes('Magnetite')&&(r.id.endsWith('-full')||r.id.endsWith('-4')));
for(const r of targets){for(const k of ['evaluation','errors','intensity_fractions','rank','dof','free_parameters'])assert.deepEqual(r.analytical[k],r.reference[k],`${r.id}:${k}`);}
checks.magnetite_winner={passed:true,cases:targets.length,minima_curves_std_fractions_bit_exact:true};
const provenancePath=`${base}/variable-projection-multistart-baseline-provenance.json`,provenance=read(provenancePath);files.add(provenancePath);
for(const [p,h]of Object.entries(provenance)){const short=['native_fixture','mossa_core.js','mossa_core_bg.wasm','multistart.mjs'].includes(basename(p));const archived=`${runtime}/baseline/${short?basename(p):p}`;assert.equal(sha(archived),h,archived);files.add(archived);}
for(const [name,p]of [['native_fixture','rust-core/target/release/examples/native_fixture'],['mossa_core.js','src/wasm/mossa_core.js'],['mossa_core_bg.wasm','src/wasm/mossa_core_bg.wasm']]){assert.equal(sha(`${runtime}/improved/${name}`),sha(p));files.add(`${runtime}/improved/${name}`);}
const old=await import(`../${runtime}/baseline/mossa_core.js`),current=await import('../src/wasm/mossa_core.js');
await old.default({module_or_path:readFileSync(`${runtime}/baseline/mossa_core_bg.wasm`)});await current.default({module_or_path:readFileSync('src/wasm/mossa_core_bg.wasm')});
for(const r of native.slice(0,31))assert.deepEqual(JSON.parse(current.evaluate_json(JSON.stringify(r.projected_project))),JSON.parse(old.evaluate_json(JSON.stringify(r.initial_project))),r.id);
checks.forward_model={passed:true,cases:31,bit_exact:true};
for(const [key,name,count,rust]of [['rust','rust',76,true],['profile_feature','profile-tests',3,true],['js_wasm','mjs',168,false],['native_integration','native',16,false]]){const p=`/tmp/mossa-vp-rescue-${name}.log`,s=readFileSync(p,'utf8');assert.ok(rust?s.includes(`${count} passed; 0 failed`):s.includes(`pass ${count}`)&&s.includes('fail 0'),key);checks[key]={passed:true,tests:count,log_sha256:sha(p)};}
let p='/tmp/mossa-vp-rescue-web-build.log',s=readFileSync(p,'utf8');assert.ok(s.includes('Checked 1374 local links')&&s.includes('Desktop payload verified: 284 files'));checks.desktop_manual={passed:true,typescript_compile:true,files:284,links:1374,log_sha256:sha(p)};
p='/tmp/mossa-vp-rescue-desktop-check.log';assert.ok(readFileSync(p,'utf8').includes('Finished `dev`'));checks.desktop_cargo={passed:true,log_sha256:sha(p)};
for(const p of ['README.md','rust-core/src/native.rs','rust-core/src/variable_projection/profile.rs','scripts/profile-variable-projection-search.mjs','scripts/benchmark-variable-projection-multistart-browser.mjs','scripts/verify-variable-projection-multistart.mjs','tests/equivalent-sites.test.mjs','tests/variable-projection-continuation.test.mjs','tests/native-backend.integration.tsx','tests/fixtures/variable-projection-slow-trial.json',`${base}/VARIABLE-PROJECTION-MULTISTART.md`,`${base}/VARIABLE-PROJECTION.md`,`${base}/variable-projection-multistart-profile.json`,`${base}/variable-projection-multistart-trials-final.json`])files.add(p);
const all=[...native,...b.runs],result={date:new Date().toISOString(),checks,maximum_relative_std:{parameter:Math.max(...all.map(r=>r.max_std_relative)),fraction:Math.max(...all.map(r=>r.max_fraction_std_relative)),same_coordinate:Math.max(...native.map(r=>r.same_point_uncertainties.max_std_relative)),same_coordinate_numerical:Math.max(...native.map(r=>r.numerical_point_uncertainties.max_std_relative))},sha256:Object.fromEntries([...files].sort().map(p=>[p,sha(p)]))};
writeFileSync(`${base}/variable-projection-multistart-verification.json`,JSON.stringify(result,null,2)+'\n');
console.log('Verified 45 native / 18 browser comparisons and 4 individual magnetite starts, exact joint controls, exact same-coordinate std, magnetite winning minima/std, artifact hashes, and 31 unchanged forward evaluations.');
