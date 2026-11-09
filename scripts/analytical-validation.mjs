// Shared scientific checks for exact-vs-numerical thin-model fits.
import {readFileSync} from 'node:fs';
const load=p=>JSON.parse(readFileSync(p));
const parameter=(value,fit=true,min=null,max=null)=>({value,fit,min,max,link:null});
export function analyticalCases(evaluate) {
  const cases=load('tests/fixtures/transmission-performance.json').cases.filter(c=>c.project.mode==='thin').map(c=>({id:c.id,project:structuredClone(c.project)}));
  cases.push(...load('tests/fixtures/analytical-measured-coarse.json').cases.map(c=>({id:c.id,project:structuredClone(c.project)})));
  const base=structuredClone(cases[0].project);
  for(const kind of ['Singlet','Doublet','Sextet'])for(const profile of ['Lorentzian','Gaussian','PseudoVoigt','LorSquared']) {
    const p=structuredClone(base);p.sites=p.sites.slice(0,1);p.weighting=profile==='Gaussian'?'counts':'unweighted';p.max_iterations=300;
    p.spectrum={x:Array.from({length:401},(_,i)=>-10+i/20),y:Array(401).fill(10000)};
    p.background=[parameter(10000),parameter(.2)];
    p.sites[0]={...p.sites[0],kind,profile,params:{cs:parameter(.23,true,-2,2),fwhm:parameter(.42,true,.01,3),intensity:parameter(400,true,0),qs:parameter(1.8,kind!=='Singlet',-5,5),bhf:parameter(31.2,kind==='Sextet',0,60),a12:parameter(kind==='Doublet'?.37:1.6,kind!=='Singlet',kind==='Doublet'?0:.01,kind==='Doublet'?1:null),a13:parameter(3.2,kind==='Sextet',.01),mix:parameter(.3,profile==='PseudoVoigt',0,1)}};
    p.spectrum.y=evaluate(p).y.map((y,i)=>y+.3*Math.sin(i*1.72));
    p.sites[0].params.cs.value+=.03;p.sites[0].params.fwhm.value*=1.1;p.sites[0].params.intensity.value*=.9;
    cases.push({id:`${kind}-${profile}`,project:p});
  }
  const linked=structuredClone(cases.find(c=>c.id==='Doublet-PseudoVoigt'));linked.id='linked-mixed-sites';
  const s=structuredClone(linked.project.sites[0]);s.profile='Gaussian';s.params.cs.value=1.7;
  s.params.fwhm.link={target:'site:0:fwhm',factor:1.5};s.params.intensity.link={target:'site:0:intensity',factor:.7};s.params.qs.link={target:'site:0:qs',factor:-.5};
  linked.project.sites.push(s);linked.project.spectrum.y=evaluate(linked.project).y.map((y,i)=>y+.2*Math.sin(2.3*i));linked.project.sites[0].params.cs.value+=.01;cases.push(linked);
  const bounded=structuredClone(cases.find(c=>c.id==='Singlet-Lorentzian'));bounded.id='active-width-bound';bounded.project.sites[0].params.fwhm.min=.5;bounded.project.sites[0].params.fwhm.value=.5;cases.push(bounded);
  const rank=structuredClone(cases.find(c=>c.id==='Singlet-Lorentzian'));rank.id='rank-deficient-areas';rank.project.sites.push(structuredClone(rank.project.sites[0]));for(const s of rank.project.sites)for(const [k,v]of Object.entries(s.params))v.fit=k==='intensity';cases.push(rank);
  return cases;
}
// Fixed before benchmark: minima within 1e-8 relative (1e-7 absolute),
// curves within .001 residual RMS; std within 1e-4 relative + 1e-10.
// Same-basin parameters: .001 baseline std + 1e-7 relative physical scale.
export function compareAnalytical(reference, actual) {
  const a=reference.evaluation.objective,b=actual.evaluation.objective;
  const minimumTolerance=Math.max(1e-7,1e-8*a),delta=b-a;
  const sameMinimum=Math.abs(delta)<=minimumTolerance,better=delta < -minimumTolerance;
  const failures=[];
  if(delta>minimumTolerance)failures.push('worse-minimum');
  if(actual.rank!==reference.rank)failures.push('rank');
  const curveRms=Math.sqrt(actual.evaluation.y.reduce((s,v,i)=>s+(v-reference.evaluation.y[i])**2,0)/actual.evaluation.y.length);
  const residualRms=Math.sqrt(reference.evaluation.sse/reference.evaluation.y.length);
  let maxStdRelative=0,maxParameterStd=0;
  if(sameMinimum) {
    if(curveRms>Math.max(1e-7,.001*residualRms))failures.push('curve');
    for(const [key,std]of Object.entries(reference.errors)) {
      const next=actual.errors[key];
      if((std===null)!==(next===null)){failures.push(`std-availability:${key}`);continue;}
      if(std!==null) {
        maxStdRelative=Math.max(maxStdRelative,Math.abs(next-std)/Math.max(std,1e-10));
        if(Math.abs(next-std)>1e-10+1e-4*std)failures.push(`std:${key}`);
      }
      const v=reference.evaluation.parameters[key],w=actual.evaluation.parameters[key];
      if(std!==null&&v!==undefined&&w!==undefined) {
        const d=Math.abs(w-v),tolerance=1e-7*Math.max(1,Math.abs(v))+.001*(std??0);
        maxParameterStd=Math.max(maxParameterStd,d/Math.max(std??0,1e-7*Math.max(1,Math.abs(v))));
        if(d>tolerance)failures.push(`parameter:${key}`);
      }
    }
  }
  let maxFractionStdRelative=0;
  if(sameMinimum)for(let i=0;i<reference.intensity_fractions.length;i++) {
    const a=reference.intensity_fractions[i],b=actual.intensity_fractions[i];
    if(!b||(a.error===null)!==(b.error===null)){failures.push(`fraction-std-availability:${i}`);continue;}
    if(a.error!==null) {
      maxFractionStdRelative=Math.max(maxFractionStdRelative,Math.abs(a.error-b.error)/Math.max(a.error,1e-10));
      if(Math.abs(a.error-b.error)>1e-10+1e-4*a.error)failures.push(`fraction-std:${i}`);
    }
  }
  return {passed:!failures.length,failures,delta_objective:delta,reference_objective:a,analytical_objective:b,same_minimum:sameMinimum,better,curve_rms:curveRms,residual_rms:residualRms,max_std_relative:maxStdRelative,max_parameter_std:maxParameterStd,max_fraction_std_relative:maxFractionStdRelative,iterations:[reference.iterations,actual.iterations],termination:[reference.termination,actual.termination]};
}
