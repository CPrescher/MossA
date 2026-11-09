// Default selection must reproduce the previously qualified opt-in solver exactly.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {variableProjectionCases} from './variable-projection-cases.mjs';
import {fitMultiStart} from '../src/multistart.mjs';
const base='validation-data/performance',archive=`${base}/runtime/variable-projection-refined/improved`;
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const prior=JSON.parse(readFileSync(`${base}/variable-projection-refined-verification.json`));
for(const name of ['mossa_core.js','mossa_core_bg.wasm'])assert.equal(sha(`${archive}/${name}`),prior.sha256[`${archive}/${name}`]);
const old=await import(`../${archive}/mossa_core.js`),current=await import('../src/wasm/mossa_core.js');
await old.default({module_or_path:readFileSync(`${archive}/mossa_core_bg.wasm`)});await current.default({module_or_path:readFileSync('src/wasm/mossa_core_bg.wasm')});
const invoke=(core,method,p)=>JSON.parse(core[method](JSON.stringify(p))),evaluate=p=>invoke(old,'evaluate_json',p),source=p=>invoke(old,'evaluate_source_json',p);
const cases=variableProjectionCases(evaluate,source),checks=[];
function compare(id,before,after){const expected=structuredClone(before);delete expected.project.thin_solver;const actual=structuredClone(after);delete actual.project.thin_solver;assert.deepEqual(actual,expected,id);checks.push({id,complete_fit_and_uncertainties_exact:true,result_sha256:createHash('sha256').update(JSON.stringify(actual)).digest('hex')});}
for(const c of cases){const p={...c.project};delete p.thin_solver;compare(`${c.id}:default`,invoke(old,'fit_json',{...p,thin_solver:'variable_projection'}),invoke(current,'fit_json',p));compare(`${c.id}:joint`,invoke(old,'fit_json',{...p,thin_solver:'joint'}),invoke(current,'fit_json',{...p,thin_solver:'joint'}));}
const search=(core,p)=>fitMultiStart(p,q=>invoke(core,'fit_json',q),q=>invoke(core,'evaluate_json',q),undefined,q=>invoke(core,'finalize_fit_json',q));
for(const c of cases.filter(c=>['MS_MexicanMagnetite_coarse','MS-Fe2O3-Fe3O4_70-30_coarse'].includes(c.id)))for(const search_starts of [4,12])for(const search_strategy of ['full','selective']){
 const p={...c.project,search_starts,search_strategy};delete p.thin_solver;
 compare(`${c.id}:${search_starts}:${search_strategy}`,search(old,{...p,thin_solver:'variable_projection'}),search(current,p));
}
const thin=cases.find(c=>c.id==='Doublet-PseudoVoigt').project;
compare('numerical-joint-fallback',invoke(old,'fit_json',{...thin,thin_solver:'variable_projection',derivative_method:'numerical'}),invoke(current,'fit_json',{...thin,derivative_method:'numerical'}));
compare('bounded-lm-joint-recovery',invoke(old,'fit_recovery_json',{...thin,thin_solver:'variable_projection'}),invoke(current,'fit_recovery_json',thin));
for(const c of JSON.parse(readFileSync('tests/fixtures/transmission-performance.json')).cases.filter(c=>c.project.mode!=='thin')){const method=c.calibration?'fit_source_json':'fit_json';compare(`${c.id}:unaffected`,invoke(old,method,c.project),invoke(current,method,c.project));}
const paths=['rust-core/src/lib.rs','rust-core/src/variable_projection.rs','rust-core/src/analytical.rs','rust-core/src/parallel.rs','src/App.tsx','src/session.ts','src/wasm/mossa_core.js','src/wasm/mossa_core_bg.wasm','tests/variable-projection.test.mjs','tests/variable-projection-options.test.tsx','tests/native-backend.integration.tsx','rust-core/src/tests.rs','README.md','PORTING.md','manual/src/content/docs/guides/building-models.md','scripts/verify-variable-projection-default.mjs',`${archive}/mossa_core.js`,`${archive}/mossa_core_bg.wasm`];
const result={date:new Date().toISOString(),passed:true,method:'Full results (including curves, parameters, full std, fractions, rank, DOF, convergence, warnings and search diagnostics) must be exact after removing only the solver-selection metadata. Frozen prior opt-in projection becomes the default. Explicit joint is compared with the frozen joint solver.',checks,hashes:Object.fromEntries(paths.map(p=>[p,sha(p)]))};
writeFileSync(`${base}/variable-projection-default-verification.json`,JSON.stringify(result,null,2)+'\n');console.log(`Verified ${checks.length} exact comparisons: 31 default thin fits, 31 explicit joint fits, eight full/selective searches, numerical/recovery fallbacks and unaffected transmission/source models.`);
