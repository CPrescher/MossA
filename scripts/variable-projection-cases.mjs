import {analyticalCases} from './analytical-validation.mjs';
import {sourceXvbfCases} from './source-xvbf-analytical-cases.mjs';
export function variableProjectionCases(evaluate,source){
 const cases=[...analyticalCases(evaluate),...sourceXvbfCases(evaluate,source).filter(c=>c.project.mode==='thin')];
 const copy=id=>structuredClone(cases.find(c=>c.id===id));
 const base=copy('Singlet-Lorentzian');
 const add=(id,edit)=>{const c=structuredClone(base);c.id=id;edit(c.project);cases.push(c);};
 add('linear-only',p=>{for(const [k,v]of Object.entries(p.sites[0].params))v.fit=k==='intensity';});
 add('background-only',p=>{p.sites=[];});
 add('bounded-intensity',p=>{p.sites[0].params.intensity.max=350;p.sites[0].params.intensity.value=340;});
 add('bounded-background',p=>{p.background[0].max=9990;p.background[0].value=9990;});
 add('linked-linear-roots',p=>{const s=structuredClone(p.sites[0]);s.params.cs.value=1.5;s.params.intensity.link={target:'site:0:intensity',factor:.6};p.sites.push(s);p.background[1].link={target:'site:0:intensity',factor:.002};});
 add('cross-linked-shape-root',p=>{p.sites[0].params.cs.link={target:'bkg:1',factor:.3};});
 add('fixed-background',p=>{p.background.forEach(b=>b.fit=false);});
 add('all-fixed',p=>{p.background.forEach(b=>b.fit=false);Object.values(p.sites[0].params).forEach(v=>v.fit=false);});
 add('coincident-starts',p=>{const s=structuredClone(p.sites[0]);s.params.intensity.value*=.6;p.sites.push(s);const truth=structuredClone(p);truth.sites[0].params.cs.value-=.15;truth.sites[1].params.cs.value+=.18;p.spectrum.y=evaluate(truth).y.map((y,i)=>y+.1*Math.sin(i*1.7));});
 return cases;
}
