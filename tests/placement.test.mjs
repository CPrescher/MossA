import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placedParameters, placementProject, updatePlacementSite } from '../src/placement.mjs';
test('singlet two-click width and area follow the MATLAB Lorentzian convention',()=>{
 const p=placedParameters('Singlet','Lorentzian',{x:1,y:900},{x:1.2,y:950},null,1000,'thin');
 assert.ok(Math.abs(p.fwhm-.4)<1e-14);assert.ok(Math.abs(p.intensity-100*Math.PI*.2)<1e-12);assert.equal(p.cs,1);
});
test('third click defines doublet splitting and sextet hyperfine field in either direction',()=>{
 for(const sign of [-1,1]){const p=placedParameters('Doublet','Lorentzian',{x:0,y:900},{x:.2,y:950},{x:sign*2,y:900},1000,'thin');assert.equal(p.cs,sign);assert.equal(p.qs,2);
 const s=placedParameters('Sextet','Lorentzian',{x:-5,y:900},{x:-4.8,y:950},{x:5,y:900},1000,'thin');assert.equal(s.cs,0);assert.equal(s.bhf,30.97);assert.ok(s.intensity>0);}
});
test('all four profiles produce finite starting estimates and FT estimates use optical depth',()=>{
 for(const shape of ['Lorentzian','Gaussian','PseudoVoigt','LorSquared']){const p=placedParameters('Singlet',shape,{x:0,y:900},{x:.2,y:950},null,1000,'transmission');assert.ok(p.intensity>0&&p.intensity<1);}
});
test('redefinition replaces exactly one site and preserves identity, settings, and links',()=>{
 const parameter=(value,settings={})=>({value,fit:true,min:null,max:null,link:null,...settings});
 const named={name:'Named iron site',kind:'Sextet',profile:'Gaussian',params:{cs:parameter(.1,{fit:false,min:-2,max:2}),fwhm:parameter(.3,{link:{target:'site:1:fwhm',factor:2}}),intensity:parameter(40),qs:parameter(.05),bhf:parameter(30),a12:parameter(1.7),mix:parameter(.2)}};
 const original=structuredClone(named),other={...named,name:'Other'};
 const changed=updatePlacementSite(named,{cs:.5,fwhm:.8,intensity:90,qs:0,bhf:32});
 const project={sites:[named,other],spectrum:{x:[1],y:[2]}};
 const preview=placementProject(project,changed,0);
 assert.equal(preview.sites.length,2);assert.equal(preview.sites[0].name,named.name);assert.equal(preview.sites[0].profile,'Gaussian');assert.equal(preview.sites[1],other);
 assert.deepEqual(changed.params.cs,{...named.params.cs,value:.5});assert.deepEqual(changed.params.fwhm,named.params.fwhm);assert.equal(changed.params.qs.value,.05);assert.equal(changed.params.a12.value,1.7);
 assert.deepEqual(named,original);assert.equal(placementProject(project,changed).sites.length,3);
});
