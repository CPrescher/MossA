import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import init,{fit_json,fit_json_with_progress,FitSession,finalize_fit_json} from '../src/wasm/mossa_core.js';
await init({module_or_path:readFileSync('src/wasm/mossa_core_bg.wasm')});
const fit=p=>JSON.parse(fit_json(JSON.stringify(p)));
test('mixed ordinary/distribution model retains its frozen convergence, minimum and every uncertainty',()=>{
 const {project,reference}=JSON.parse(readFileSync('tests/fixtures/solver-qr-mixed-distribution.json'));
 assert.deepEqual(fit(project),reference);
});
test('compressed-SVD checkpoints, callbacks and deferred uncertainties match uninterrupted fitting',()=>{
 const {project}=JSON.parse(readFileSync('tests/fixtures/variable-projection-slow-trial.json'));
 const expected=fit(project),session=new FitSession(JSON.stringify(project),false);let actual;
 try{for(let i=0;i<2000;i++){const state=JSON.parse(session.advance());assert.notEqual(state.kind,'derivatives');if(state.kind==='done'){actual=state.result;break;}}assert.deepEqual(actual,expected);}finally{session.free();}
 assert.deepEqual(JSON.parse(fit_json_with_progress(JSON.stringify(project),()=>{})),expected);
 const pending=fit({...project,search_defer_uncertainties:true}).finalization;
 assert.deepEqual(JSON.parse(finalize_fit_json(JSON.stringify(pending))),expected);
});
