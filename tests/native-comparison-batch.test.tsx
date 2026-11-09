import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NativeComparisonBatch} from '../src/native-comparison-batch';
import type {NativeSession} from '../src/native-session';
import {newSite,parameter,type Project} from '../src/types';
function setup(failure:''|'validation'|'fit'='') {
  const p:Project={spectrum:{x:Array.from({length:8},(_,i)=>i),y:Array(8).fill(100)},sites:[newSite(0,'Singlet')],background:[parameter(100)],mode:'thin',source_fwhm:.097,source_squared:false,weighting:'unweighted',max_iterations:100,search_starts:4};
  let operations=0;
  const session={check(){},async comparisonBatch(request:any){
    return {models:request.models,results:request.operations.map((op:any)=>{
      operations++;
      if(failure==='validation')return{id:op.id,result:null,error:'Invalid candidate'};
      return{id:op.id,error:null,result:{kind:'prefitted',error:failure==='fit'?'Local fit failed':null,fit:failure==='fit'?null:{kind:'trial',values:op.values,objective:1,free_parameters:1,state:{x:[0],iterations:1,converged:true,termination:'Converged',source_calibration:false}}}};
    })};
  }} as unknown as NativeSession;
  const batch=new NativeComparisonBatch(session),lane=batch.lane(p.spectrum.y);
  return {p,lane,operations:()=>operations};
}
test('a prefitted trial is consumed once without repeating the native fit',async()=>{
  const {p,lane,operations}=setup();await lane.validate(p);
  const result=await lane.fit({...p,search_defer_uncertainties:true} as Project);
  assert.equal(result.evaluation.objective,1);assert.equal(operations(),1);lane.close();
});
test('a cached prefitted trial cannot be applied to different observations or velocities',async()=>{
  for(const field of ['x','y'] as const) {
    const {p,lane,operations}=setup();await lane.validate(p);
    const changed=structuredClone(p);changed.spectrum[field][0]+=.1;
    await assert.rejects(lane.fit({...changed,search_defer_uncertainties:true} as Project),/spectrum changed|velocity grid changed/);
    assert.equal(operations(),1);lane.close();
  }
});
test('prefit solver failures surface at the fit step rather than rejecting candidate validation',async()=>{
  const {p,lane}=setup('fit');await lane.validate(p);
  await assert.rejects(lane.fit({...p,search_defer_uncertainties:true} as Project),/Local fit failed/);lane.close();
});
test('prefit validation failures surface before a candidate can enter the search',async()=>{
  const {p,lane}=setup('validation');await assert.rejects(lane.validate(p),/Invalid candidate/);lane.close();
});
test('overflowed candidate values are rejected locally without poisoning another native batch',async()=>{
  const {p,lane,operations}=setup();p.sites[0].params.intensity.value=Infinity;
  await assert.rejects(lane.validate(p),/Invalid comparison parameter values/);assert.equal(operations(),0);
  p.sites[0].params.intensity.value=400;await lane.validate(p);
  await lane.fit({...p,search_defer_uncertainties:true} as Project);assert.equal(operations(),1);lane.close();
});
