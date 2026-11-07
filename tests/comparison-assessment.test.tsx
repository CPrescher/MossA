import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessComparison,residualAssessment,automaticNoiseSensitivityTriggers} from '../src/comparison-assessment';
import {newSite,parameter,type FitResult} from '../src/types';
import type {ComparisonResult} from '../src/comparison';

function fitted(sites:number):FitResult {
  const n=100, dof=n-(3*sites+1), residual=Array.from({length:n},(_,i)=>[1,1,-1,-1][i%4]*Math.sqrt(10000*dof/n));
  const project={spectrum:{x:Array.from({length:n},(_,i)=>i/10),y:residual.map(r=>10000+r)},sites:Array.from({length:sites},(_,i)=>newSite(i,'Singlet')),background:[parameter(10000)],mode:'thin' as const,source_fwhm:.097,source_squared:false,weighting:'unweighted' as const,max_iterations:200};
  const errors=Object.fromEntries(project.sites.flatMap((_,i)=>[['cs',.01],['fwhm',.01],['intensity',1]].map(([k,v])=>[`site:${i}:${k}`,v]))) as Record<string,number>;
  const sse=residual.reduce((s,v)=>s+v*v,0);
  return {project,errors,intensity_fractions:project.sites.map(()=>({value:100/sites,error:1})),evaluation:{parameters:{},y:Array(n).fill(10000),residual,sse,objective:sse,background:Array(n).fill(10000),components:project.sites.map((_,i)=>Array.from({length:n},(_,j)=>j>=i*50&&j<(i+1)*50?1:0))},converged:true,termination:'RelativeCostTolerance',iterations:5,free_parameters:n-dof,dof,rank:n-dof,reduced_objective:sse/dof,warnings:[]};
}
export function assessmentFixture():ComparisonResult {return {version:1,method:'parametric-bootstrap',options:{simulations:999,seed:7812,noise:'poisson',doubledFirstChannel:false},simpler:fitted(1),larger:fitted(2),improvement:20000,fStatistic:4,exceedances:17,pValue:.018,monteCarloInterval:[.011,.027],noiseStd:null,improvements:[],diagnostics:[],warnings:[]};}

test('even a clean, significant result describes statistical improvement without recommending another physical site',()=>{
  const r=assessmentFixture(),a=assessComparison(r);
  assert.equal(a.flags.length,0);assert.equal(a.title,'Statistical improvement detected');
  assert.match(a.explanation,/not an automatic recommendation/);assert.doesNotMatch(a.title,/Prefer/);
});
test('large local intensity uncertainty and redistributed overlapping profiles produce specific caution flags',()=>{
  const r=assessmentFixture();r.larger.intensity_fractions=[{value:1.7,error:.9},{value:5.5,error:5.2}];
  r.larger.project.sites[0].params.intensity.value=94.5;r.larger.project.sites[1].params.intensity.value=5.5;
  r.larger.evaluation.components[1]=[...r.simpler.evaluation.components[0]];
  const a=assessComparison(r);assert.equal(a.title,'Extra component needs caution');
  assert.ok(a.flags.some(f=>f.code==='weak-area-1'&&f.detail.includes('5.5% ± 5.2')));
  assert.equal(a.addedSites[0].fraction.error,5.2);
  r.larger.project.sites[0].params.intensity.value=1.7;r.larger.project.sites[1].params.intensity.value=98.3;
  assert.ok(assessComparison(r).flags.some(f=>f.code==='overlap-1'&&f.title.includes('being split')));
});
test('missing symmetric uncertainties are flagged rather than treated as zero; fixed parameters are identified',()=>{
  const r=assessmentFixture();r.larger.errors['site:1:intensity']=null;r.larger.intensity_fractions![1].error=null;
  r.larger.project.sites[1].params.cs.fit=false;
  const a=assessComparison(r);assert.ok(a.flags.some(f=>f.code==='missing-uncertainty-1'));
  assert.equal(a.addedSites[0].parameters.find(p=>p.label==='CS')!.state,'fixed');
  assert.equal(a.addedSites[0].parameters.find(p=>p.label==='Intensity')!.error,null);
});
test('excess Poisson scatter in the larger model triggers caution, while excess only in the simpler model does not',()=>{
  const r=assessmentFixture();const increase=(f:FitResult,factor:number)=>{f.evaluation.residual=f.evaluation.residual.map(v=>v*Math.sqrt(factor));};
  increase(r.simpler,1.8);assert.ok(!assessComparison(r).flags.some(f=>f.code==='excess-scatter'));
  increase(r.larger,1.8);const a=assessComparison(r);assert.ok(a.flags.some(f=>f.code==='excess-scatter'));
  assert.ok(Math.abs(a.noise.larger.poissonDispersion!-1.8)<1e-12);
});
test('Poisson residual checks account for doubled first and reversed last channels exactly once',()=>{
  for(const last of [false,true]){const r=assessmentFixture(),f=r.larger;f.dof=100;f.evaluation.residual=Array(100).fill(100);f.evaluation.residual[last?99:0]=Math.sqrt(20000);
    r.options.doubledFirstChannel=!last;r.options.doubledLastChannel=last;
    assert.ok(Math.abs(residualAssessment(f,r).poissonDispersion!-1)<1e-12);
  }
});
test('noise sensitivity compares Monte Carlo classifications and retains both assumptions',()=>{
  const r=assessmentFixture(),other=structuredClone(r);other.options.noise='gaussian';other.noiseStd=110;other.pValue=.044;other.monteCarloInterval=[.032,.057];
  const a=assessComparison(r,other);assert.ok(a.flags.some(f=>f.code==='noise-sensitive'));
  assert.equal(r.pValue,.018);assert.equal(other.pValue,.044);
  other.monteCarloInterval=[.02,.04];assert.ok(!assessComparison(r,other).flags.some(f=>f.code==='noise-sensitive'));
});
test('correlated larger-model residuals are flagged for either independent noise assumption',()=>{
  for(const noise of ['gaussian','poisson'] as const){const r=assessmentFixture();r.options.noise=noise;r.noiseStd=100;
    r.larger.evaluation.residual=Array.from({length:100},(_,i)=>100*Math.sin(i/10));
    assert.ok(assessComparison(r).flags.some(f=>f.code==='correlated-residuals'));
  }
});
test('RMS effect size uses unweighted SSE even when the comparison objective is count weighted',()=>{
  const r=assessmentFixture();r.larger.evaluation.sse=.81*r.simpler.evaluation.sse;r.larger.evaluation.objective=2;
  assert.ok(Math.abs(assessComparison(r).rmsReductionPercent!-10)<1e-12);
});
test('bound and poorly sampled width flags do not infer an instrumental resolution or relax the fit',()=>{
  const r=assessmentFixture();r.larger.project.sites[1].params.fwhm.value=.01;
  const before=JSON.stringify(r),a=assessComparison(r);
  assert.ok(a.flags.some(f=>f.code==='bound-1'));
  assert.ok(a.flags.some(f=>f.code==='narrow-1'&&f.detail.includes('not a measurement of instrumental resolution')));
  assert.equal(JSON.stringify(r),before);
});
test('a nonsignificant result remains explicitly unsupported even when parameter warnings are present',()=>{
  const r=assessmentFixture();r.pValue=.8;r.monteCarloInterval=[.7,.9];r.larger.errors['site:1:intensity']=null;
  const a=assessComparison(r);assert.ok(a.flags.length);assert.equal(a.title,'No clear statistical support for the extra component');
});
test('automatic sensitivity is triggered by Poisson residual concerns, independently of the p-value',()=>{
  const r=assessmentFixture();r.pValue=.8;r.monteCarloInterval=[.7,.9];
  r.larger.evaluation.residual=r.larger.evaluation.residual.map(v=>v*2);
  assert.ok(automaticNoiseSensitivityTriggers(r).some(f=>f.code==='excess-scatter'));
  r.options.noise='gaussian';r.noiseStd=100;
  assert.deepEqual(automaticNoiseSensitivityTriggers(r),[],'Gaussian checks must not trigger a loop');
});
test('significance and uncertain components alone do not automatically start another noise comparison',()=>{
  const r=assessmentFixture();r.pValue=.001;r.monteCarloInterval=[0,.01];
  r.larger.intensity_fractions![1].error=100;
  assert.ok(assessComparison(r).flags.some(f=>f.code==='weak-area-1'));
  assert.deepEqual(automaticNoiseSensitivityTriggers(r),[]);
});
test('correlated Poisson residuals can trigger automatic sensitivity without a variance excess',()=>{
  const r=assessmentFixture();r.larger.evaluation.residual=Array.from({length:100},(_,i)=>10*Math.sin(i/10));
  assert.deepEqual(automaticNoiseSensitivityTriggers(r).map(f=>f.code),['correlated-residuals']);
});
