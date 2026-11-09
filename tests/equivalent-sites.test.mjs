import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareAnalytical} from '../scripts/analytical-validation.mjs';
import {compareEquivalentSites} from '../scripts/compare-equivalent-sites.mjs';
const parameter=(value)=>({value,fit:true,min:-10,max:10,link:null});
function pair(){
 const a={project:{mode:'thin',weighting:'unweighted',spectrum:{x:[0,1],y:[10,10]},background:[{value:10,fit:false,min:null,max:null,link:null}],sites:[1,2].map(value=>({kind:'Singlet',profile:'Lorentzian',params:{cs:parameter(value)}}))},rank:2,free_parameters:2,dof:8,evaluation:{objective:1,sse:1,y:[10,10],parameters:{'site:0:cs':1,'site:1:cs':2},components:[[1,1],[2,2]]},errors:{'site:0:cs':.1,'site:1:cs':.2},intensity_fractions:[{value:30,error:.3},{value:70,error:.7}],iterations:10,termination:'RelativeCostTolerance'};
 const b=structuredClone(a);b.project.sites.reverse();b.evaluation.parameters={'site:0:cs':2,'site:1:cs':1};b.evaluation.components.reverse();b.errors={'site:0:cs':.2,'site:1:cs':.1};b.intensity_fractions.reverse();return [a,b];
}
test('benchmark alignment preserves raw failures and only matches interchangeable labels',()=>{
 const [a,b]=pair();assert.equal(compareAnalytical(a,b).passed,false);
 const q=compareEquivalentSites(a,b);assert.equal(q.passed,true);assert.equal(q.raw_comparison.passed,false);assert.deepEqual(q.site_permutation,[1,0]);
});
test('benchmark alignment cannot hide different constraints, links, curves, or uncertainty values',()=>{
 for(const edit of [b=>b.project.sites[0].params.cs.max=1.5,b=>b.project.sites[0].params.cs.link={target:'site:1:cs',factor:1},b=>b.project.background[0].value=20,b=>b.evaluation.y[0]=20,b=>b.errors['site:0:cs']=.8]){
  const [a,b]=pair();edit(b);assert.equal(compareEquivalentSites(a,b).passed,false);
 }
});
