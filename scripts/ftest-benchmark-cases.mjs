// Synthetic nested hypotheses: fixed-shape controls and bounded nonlinear fits.
import {parameter,newSite} from '../src/types.ts';
import {seededRandom,normalSample,poissonSample} from '../src/comparison.ts';

export function ftestBenchmarkCases(evaluate,simulations=199) {
  const cases=[];
  for(const [id,extra,nonlinear,mode,noise,starts] of [
    ['gaussian-absent',0,false,'thin','gaussian',1],
    ['gaussian-weak',1,false,'thin','gaussian',1],
    ['gaussian-clear',8,false,'thin','gaussian',1],
    ['gaussian-nonlinear-multistart',1,true,'thin','gaussian',4],
    ['poisson-nonlinear-multistart',30,true,'thin','poisson',4],
    ['transmission-nonlinear-multistart',.008,true,'transmission','poisson',4],
  ]) {
    const counts=noise==='poisson',transmission=mode==='transmission';
    const site=newSite(0,'Singlet');
    site.params.cs=parameter(-.6,nonlinear,-.9,-.3);
    site.params.fwhm=parameter(.45,nonlinear,.25,.7);
    site.params.intensity=parameter(transmission?.4:counts?2000:80,true,0);
    const simpler={spectrum:{x:Array.from({length:161},(_,i)=>-4+i/20),y:Array(161).fill(counts?20000:1000)},
      sites:[site],background:[parameter(counts?20000:1000)],mode,source_fwhm:.097,source_squared:false,
      weighting:counts?'counts':'unweighted',max_iterations:400,search_starts:starts};
    const larger=structuredClone(simpler),added=newSite(1,'Singlet');
    added.params.cs=parameter(1.1,nonlinear,.8,1.4);
    added.params.fwhm=parameter(.4,nonlinear,.25,.7);
    added.params.intensity=parameter(extra,true,0);larger.sites.push(added);
    const random=seededRandom(42),truth=evaluate(larger);
    simpler.spectrum.y=truth.y.map(mu=>counts?poissonSample(mu,random):mu+2*normalSample(random));
    larger.spectrum=structuredClone(simpler.spectrum);
    larger.sites[1].params.intensity.value=transmission?.01:counts?100:1;
    cases.push({id,simpler,larger,options:{simulations,seed:12345,noise,doubledFirstChannel:false,workers:1},
      generation:{seed:42,extra_intensity:extra,gaussian_std:counts?null:2}});
  }
  return cases;
}
