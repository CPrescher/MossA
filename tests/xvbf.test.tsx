import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import init, { evaluate_json, fit_json, fit_json_with_progress } from '../src/wasm/mossa_core.js';
import { demo } from '../src/demo';
import { newSite, parameter, type Project, type Site, type Xvbf, type FitResult } from '../src/types';
import { enableXvbf, addDistribution, editDistribution, removeDistribution } from '../src/xvbf';
import { decodeSession, defaultLayout, summarizeFit, writeSession, type Snapshot } from '../src/session';
import { createProjectFile, openProjectFile } from '../src/projectFile';
import { historyReducer } from '../src/history';
await init({module_or_path:readFileSync(new URL('../src/wasm/mossa_core_bg.wasm',import.meta.url))});
const evaluate=(p:Project)=>JSON.parse(evaluate_json(JSON.stringify(p)));
function project():Project {
 const site=enableXvbf(newSite(0));site.params.intensity=parameter(1200,true,0,null);
 site.xvbf!.cs[0].center=parameter(.2,true,-3,3);site.xvbf!.cs[0].width=parameter(.13,true,0,1);
 site.xvbf!.qs[0].center=parameter(1.5,true,0,6);site.xvbf!.qs[0].width=parameter(.22,false,0,1);site.xvbf!.delta.value=.3;
 return {...demo(),spectrum:{x:Array.from({length:401},(_,i)=>-5+10*i/400),y:Array(401).fill(20000)},sites:[site],background:[parameter(20000)]};
}
// Independent transcription of reference/MossA/voigt_curve.m and cta_fit.m.
function voigt(x:number,c:number,g:number,l:number,a:number) {
 if(g===0) return a*.5642/Math.sqrt(Math.PI)*l/((x-c)**2+l*l);
 const u=(x-c)/(g*2*Math.sqrt(2)),v=l/(g*2*Math.sqrt(2));
 const coeff=[[-1.2150,1.2359,-.3085,.0210],[-1.3509,.3786,.5906,-1.1858],[-1.2150,-1.2359,-.3085,-.0210],[-1.3509,-.3786,.5906,1.1858]];
 return a/(2*Math.sqrt(2*Math.PI)*g)*coeff.reduce((s,[r,i,t,z])=>s+(t*(v-r)+z*(u-i))/((v-r)**2+(u-i)**2),0);
}
function absorption(site:Site,v:number) {
 const x=site.xvbf!;let y=0;
 for(const c of x.cs)for(const q of x.qs)for(const sign of [-1,1]) {
  const width=Math.sqrt(Math.max(0,c.width.value**2+.25*q.width.value**2+sign*x.delta.value*c.width.value*q.width.value));
  y+=voigt(v,c.center.value+sign*q.center.value/2,width,.194,site.params.intensity.value*c.weight.value*q.weight.value/2);
 }
 return y;
}
function mixture(p:Project) {
 const x=p.sites[0].xvbf!;
 x.cs.push(structuredClone(x.cs[0]));x.cs[0].weight=parameter(.3,true,0,1);x.cs[1].weight=parameter(.7,true,0,1);x.cs[1].center.value=-.4;x.cs[1].width.value=.08;
 x.qs.push(structuredClone(x.qs[0]));x.qs[0].weight=parameter(.6,true,0,1);x.qs[1].weight=parameter(.4,true,0,1);x.qs[1].center.value=2.6;
 return p;
}
test('xVBF curves agree with independent MATLAB expressions for multiple CS/QS components and signed coupling',()=>{
 for(const delta of [-1,-.4,0,.7,1]) {
  const p=mixture(project());p.sites[0].xvbf!.delta.value=delta;
  const e=evaluate(p);
  p.spectrum.x.forEach((v,i)=>assert.ok(Math.abs(e.components[0][i]-absorption(p.sites[0],v))<1e-9));
  assert.ok(Math.abs(e.parameters['site:0:cs']-(.2*.3-.4*.7))<1e-12);
 }
 const p=project();p.sites[0].xvbf!.cs[0].width.value=.11;p.sites[0].xvbf!.delta.value=1;
 assert.ok(evaluate(p).y.every(Number.isFinite),'zero effective width has the analytic legacy-Voigt limit');
});
test('full transmission uses the normalized mixture weights and agrees with an independent direct convolution',()=>{
 const p=mixture(project());p.mode='transmission';p.sites[0].params.intensity.value=.7;
 p.spectrum.x=Array.from({length:101},(_,i)=>-5+i*.1);p.spectrum.y=Array(101).fill(20000);
 const source=Array.from({length:6001},(_,i)=>{const v=-30+i*.01,h=p.source_fwhm/2;return h/Math.PI/(v*v+h*h);});
 const transmitted=Array.from({length:6001},(_,i)=>Math.exp(-absorption(p.sites[0],-30+i*.01)));
 const e=evaluate(p);
 p.spectrum.x.forEach((v,i)=>{const k=Math.round((v+30)*100)+3000;let sum=0;for(let j=Math.max(0,k-6000);j<=Math.min(6000,k);j++)sum+=source[j]*transmitted[k-j];assert.ok(Math.abs(e.y[i]-20000*.01*sum)<1e-7);});
});
test('WASM fits coupled widths, centers, and intensity with an identifiable fixed-width reference',()=>{
 const p=project(),truth=structuredClone(p);
 p.spectrum.y=p.spectrum.x.map((v,i)=>20000-absorption(truth.sites[0],v)+.02*Math.sin(i*17.3));
 p.sites[0].xvbf!.delta.value=-.1;p.sites[0].xvbf!.cs[0].width.value=.18;p.sites[0].xvbf!.cs[0].center.value=.1;p.sites[0].xvbf!.qs[0].center.value=1.6;
 const fit=JSON.parse(fit_json(JSON.stringify(p))) as FitResult;
 assert.equal(fit.converged,true,fit.termination);
 assert.ok(fit.evaluation.sse<.2,`${fit.termination}: ${fit.evaluation.sse}`);
 assert.ok(Math.abs(fit.project.sites[0].xvbf!.delta.value-.3)<.001);
 assert.ok(Math.abs(fit.project.sites[0].xvbf!.cs[0].width.value-.13)<.001);
 assert.ok(fit.errors['site:0:csd:0:width']!>0);assert.ok(fit.errors['site:0:cs']!>0);
});
test('every accepted fit state respects exact normalization, fixed weights, bounds, and dependent-weight covariance',()=>{
 const p=project(),x=p.sites[0].xvbf!;
 for(const param of Object.values(p.sites[0].params))param.fit=false;p.background[0].fit=false;x.delta.fit=false;
 for(const list of [x.cs,x.qs])for(const c of list){c.center.fit=false;c.width.fit=false;}
 x.qs=[0,1,2].map((_,i)=>({center:parameter([.7,1.8,3][i],false,0,5),width:parameter(.2,false,0,1),weight:parameter([.3,.5,.2][i],i<2,[.1,.1,.2][i],[.7,.7,.2][i])}));
 p.spectrum.y=p.spectrum.x.map((v,i)=>20000-absorption(p.sites[0],v)+.001*Math.sin(i*17.3));x.qs[0].weight.value=.4;x.qs[1].weight.value=.4;
 const updates:any[]=[];const fit=JSON.parse(fit_json_with_progress(JSON.stringify(p),(v:string)=>updates.push(JSON.parse(v)))) as FitResult;
 for(const q of [...updates.map(u=>u.project.sites[0].xvbf),fit.project.sites[0].xvbf])for(const axis of ['cs','qs'] as const){assert.ok(Math.abs(q[axis].reduce((s:number,c:any)=>s+c.weight.value,0)-1)<1e-12);assert.ok(q[axis].every((c:any)=>c.weight.value>=c.weight.min-1e-12&&c.weight.value<=c.weight.max+1e-12));}
 assert.equal(fit.free_parameters,1);assert.equal(fit.project.sites[0].xvbf!.qs[2].weight.value,.2);
 assert.ok(Math.abs(fit.project.sites[0].xvbf!.qs[0].weight.value-.3)<1e-4);
 assert.ok(fit.errors['site:0:qsd:0:weight']!>0);assert.ok(Math.abs(fit.errors['site:0:qsd:0:weight']!-fit.errors['site:0:qsd:1:weight']!)<1e-10);
 assert.equal(fit.errors['site:0:qsd:2:weight'],0);
});
test('invalid normalization, unsupported site types, bounds, and distribution links are rejected',()=>{
 const p=project();p.sites[0].xvbf!.qs[0].weight.value=.8;assert.throws(()=>evaluate(p),/summing to one/);
 p.sites[0].xvbf!.qs[0].weight.value=1;p.sites[0].kind='Sextet';assert.throws(()=>evaluate(p),/Lorentzian doublet/);
 p.sites[0].kind='Doublet';p.sites[0].xvbf!.delta.value=1.1;assert.throws(()=>evaluate(p),/bounds/);
 p.sites[0].xvbf!.delta.value=0;p.sites[0].xvbf!.cs[0].center.link={target:'site:0:cs',factor:1};assert.throws(()=>evaluate(p),/Links on xVBF/);
});
test('distribution editing, duplicate-safe data, snapshots, and portable project files preserve the model and completed results',async()=>{
 let site=enableXvbf(newSite(0));let model=addDistribution(site.xvbf!,'qs');
 assert.equal(model.qs.length,2);model=editDistribution(model,'qs',0,'weight',{value:.3});assert.equal(model.qs[1].weight.value,.7);
 assert.equal(removeDistribution(model,'qs',1).qs[0].weight.value,1);
 const p=project();p.spectrum.y=p.spectrum.x.map((v,i)=>20000-absorption(p.sites[0],v)+.1*Math.sin(i*17.3));
 const fit=JSON.parse(fit_json(JSON.stringify(p))) as FitResult;
 const before:Snapshot={project:fit.project,fit:summarizeFit(fit),fitElapsed:45,cal:{max:5,shift:0,sinusoidal:false,folding:false,center:256.5},raw:null,filename:'xVBF reference',selected:0};
 const next={...before,project:{...before.project,sites:[{...before.project.sites[0],xvbf:addDistribution(before.project.sites[0].xvbf!,'qs')}]},fit:null};
 let h=historyReducer({past:[] as Snapshot[],present:before,future:[] as Snapshot[]},{type:'set',value:next,record:true});h=historyReducer(h,{type:'undo'});assert.deepEqual(h.present,before);
 let stored='';writeSession({version:1,snapshot:before,layout:defaultLayout,fit:before.fit!,elapsed:45},{getItem:()=>stored,setItem:(_key,value)=>{stored=value;}});assert.equal(JSON.parse(stored).version,2);const session=decodeSession(stored);assert.deepEqual(session.snapshot.project,before.project);
 const file=await createProjectFile(before,{});assert.equal(file.version,2);assert.deepEqual(file.required_features,['xvbf-v1']);const reopened=await openProjectFile(JSON.parse(JSON.stringify(file)),before.cal,'file',async p=>evaluate(p));assert.deepEqual(reopened.snapshot,before);
});

test('active weight bounds omit symmetric errors for dependent weights as well',()=>{
 const p=project(),x=p.sites[0].xvbf!;
 for(const param of Object.values(p.sites[0].params))param.fit=false;p.background[0].fit=false;x.delta.fit=false;
 x.cs.forEach(c=>{c.center.fit=false;c.width.fit=false;});
 x.qs=[{center:parameter(.8,false),width:parameter(.2,false),weight:parameter(.2,true,0,1)},{center:parameter(2.5,false),width:parameter(.2,false),weight:parameter(.8,true,0,1)}];
 p.spectrum.y=p.spectrum.x.map(v=>20000-absorption(p.sites[0],v));
 x.qs[0].weight.value=.6;x.qs[1].weight.value=.4;x.qs[0].weight.min=.5;
 const fit=JSON.parse(fit_json(JSON.stringify(p))) as FitResult;
 assert.ok(Math.abs(fit.project.sites[0].xvbf!.qs[0].weight.value-.5)<1e-5);
 assert.equal(fit.errors['site:0:qsd:0:weight'],null);assert.equal(fit.errors['site:0:qsd:1:weight'],null);
 assert.ok(fit.warnings.some(w=>w.includes('bound')));
});
