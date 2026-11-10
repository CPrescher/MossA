import {readFileSync}from'node:fs';
const clone=structuredClone;
const par=(value,fit=true,min=null,max=null)=>({value,fit,min,max,link:null});
export function sourceXvbfCases(evaluate,evaluateSource){
 const frozen=JSON.parse(readFileSync('tests/fixtures/transmission-performance.json')).cases;
 const cases=frozen.filter(c=>c.calibration||c.project.sites.some(s=>s.xvbf)).map(c=>({id:c.id,project:clone(c.project),calibration:!!c.calibration}));
 for(const count of [1,2,3]){
  const p=clone(cases.find(c=>c.calibration).project);
  p.source_gaussians=[{center:0,fwhm:.21,weight:1},{center:.34,fwhm:.37,weight:.28},{center:-.5,fwhm:.43,weight:.15}].slice(0,count);
  p.spectrum.y=evaluateSource(p).y.map((y,i)=>y+.1*Math.sin(17.3*i));
  p.source_gaussians.forEach((g,i)=>{g.fwhm*=1.05;if(i){g.center+=.02;g.weight*=.95;}});p.max_iterations=600;
  cases.push({id:`source-calibration-gaussian-${count}`,project:p,calibration:true});
 }
 const base=clone(cases.find(c=>!c.calibration).project);
 for(const mode of ['thin','transmission'])for(const mixture of [false,true]){
  const p=clone(base),d=p.sites[0].xvbf;p.mode=mode;p.max_iterations=600;p.sites[0].params.intensity.value=mode==='thin'?800:.45;
  if(mixture){
   d.cs=[clone(d.cs[0]),clone(d.cs[0])];d.qs=[clone(d.qs[0]),clone(d.qs[0])];
   for(const [i,c]of d.cs.entries()){c.center=par(i?.7:-.6,true,-3,3);c.width=par(i?.15:.1,true,0,1);c.weight=par(i?.35:.65,true,.1,.9);}
   for(const [i,c]of d.qs.entries()){c.center=par(i?3.3:1.4,true,0,6);c.width=par(i?.17:.22,false,0,1);c.weight=par(i?.4:.6,true,.1,.9);}
   d.delta=par(.35,true,-1,1);
  }
  p.spectrum.y=evaluate(p).y.map((y,i)=>y+.1*Math.sin(17.3*i));d.cs[0].center.value+=.02;d.cs[0].width.value*=1.05;
  cases.push({id:`xvbf-${mode}-${mixture?'mixture':'single'}`,project:p,calibration:false});
 }
 const corner=clone(base);corner.max_iterations=600;const cd=corner.sites[0].xvbf;cd.cs[0].width.value=.11;cd.qs[0].width.value=.22;cd.delta.value=1;cd.delta.fit=true;
 corner.spectrum.y=evaluate(corner).y.map((y,i)=>y+.1*Math.sin(17.3*i));cd.cs[0].center.value+=.02;
 cases.push({id:'xvbf-perfect-correlation',project:corner,calibration:false});

 const gaussian=clone(base);gaussian.source_gaussians=[{center:0,fwhm:.21,weight:1},{center:.34,fwhm:.37,weight:.28}];
 gaussian.spectrum.y=evaluate(gaussian).y.map((y,i)=>y+.1*Math.sin(17.3*i));gaussian.sites[0].xvbf.cs[0].center.value+=.02;
 cases.push({id:'xvbf-gaussian-source',project:gaussian,calibration:false});

 const mixed=clone(base);const extra=clone(frozen.find(c=>c.id==='thin-control').project.sites[1]);extra.params.intensity.value=.2;mixed.sites.push(extra);
 mixed.spectrum.y=evaluate(mixed).y.map((y,i)=>y+.1*Math.sin(17.3*i));mixed.sites[0].xvbf.cs[0].center.value+=.02;extra.params.bhf.value+=.1;
 cases.push({id:'xvbf-mixed-sites',project:mixed,calibration:false});
 const fixed=clone(base);const fd=fixed.sites[0].xvbf;fd.cs=Array.from({length:3},()=>clone(fd.cs[0]));
 fd.cs.forEach((c,i)=>{c.center=par(-.7+i,true,-3,3);c.width=par(.1+i*.03,i>0,0,1);c.weight=par([.2,.5,.3][i],i>0,.1,.7);});
 fixed.spectrum.y=evaluate(fixed).y.map((y,i)=>y+.1*Math.sin(17.3*i));fd.cs[1].center.value+=.02;
 cases.push({id:'xvbf-fixed-weight',project:fixed,calibration:false});

 return cases;
}
