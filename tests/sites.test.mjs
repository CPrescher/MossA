import {test} from 'node:test';
import assert from 'node:assert/strict';
import {removeSiteAt,duplicateSiteAt} from '../src/sites.mjs';
test('duplicate copies independent parameters and bounds, remaps internal links, and preserves external links',()=>{
 const project={sites:[{name:'Iron',kind:'Doublet',profile:'PseudoVoigt',params:{cs:{value:.123456789,fit:false,min:-1,max:1,link:null},qs:{value:2,fit:true,min:0,max:5,link:{target:'site:0:cs',factor:2}},fwhm:{value:.3,fit:true,min:.01,max:3,link:{target:'site:1:fwhm',factor:1}}}},{name:'Other',params:{}}]};
 const next=duplicateSiteAt(project,0);assert.equal(next.selected,2);assert.equal(next.project.sites[2].name,'Iron copy');assert.equal(next.project.sites[2].params.qs.link.target,'site:2:cs');assert.equal(next.project.sites[2].params.fwhm.link.target,'site:1:fwhm');
 next.project.sites[2].params.cs.value=7;assert.equal(project.sites[0].params.cs.value,.123456789);assert.equal(project.sites[0].params.qs.link.target,'site:0:cs');
 assert.equal(duplicateSiteAt(next.project,0).project.sites[3].name,'Iron copy 2');
});
test('duplicate is unavailable without a selection or at the sixteen-site limit',()=>{
 const empty={sites:[]};assert.equal(duplicateSiteAt(empty,0).project,empty);
 const full={sites:Array.from({length:16},(_,i)=>({name:`Site ${i}`,params:{}}))};assert.equal(duplicateSiteAt(full,1).project,full);
});
test('deleting an unselected site preserves the selected site and remaps surviving links',()=>{
 const p=(target=null)=>({value:1,fit:true,min:null,max:null,link:target?{target,factor:2}:null});
 const project={sites:[{name:'First',params:{a:p()}},{name:'Selected',params:{a:p('site:2:a'),b:p('site:0:a')}},{name:'Third',params:{a:p()}}]};
 const next=removeSiteAt(project,1,0);assert.equal(next.selected,0);assert.equal(next.project.sites[next.selected].name,'Selected');assert.equal(next.project.sites[0].params.a.link.target,'site:1:a');assert.equal(next.project.sites[0].params.b.link,null);assert.equal(project.sites.length,3);
 const last=removeSiteAt({sites:[project.sites[0]]},0,0);assert.equal(last.project.sites.length,0);assert.equal(last.selected,0);
});
test('deleting a later site keeps selection; deleting the selected site selects a neighbor',()=>{
 const project={sites:['A','B','C'].map(name=>({name,params:{}}))};
 assert.equal(removeSiteAt(project,0,2).selected,0);assert.equal(removeSiteAt(project,1,1).project.sites[1].name,'C');assert.equal(removeSiteAt(project,2,2).selected,1);
});
