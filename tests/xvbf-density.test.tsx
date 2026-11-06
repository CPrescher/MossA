import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newSite,type Xvbf} from '../src/types';
import {enableXvbf,addDistribution} from '../src/xvbf';
import {jointDensity,marginalDensity,densityGrid,contourSegments} from '../src/xvbf-density';
function model():Xvbf {const x=enableXvbf(newSite(0)).xvbf!;x.cs[0].center.value=.3;x.cs[0].width.value=.2;x.qs[0].center.value=1.5;x.qs[0].width.value=.4;x.delta.value=.6;return x;}
test('joint density matches the independent MATLAB pdd_calc expression for multiple components and signed coupling',()=>{
 let x=addDistribution(addDistribution(model(),'cs'),'qs');x.cs[0].weight.value=.3;x.cs[1].weight.value=.7;x.qs[0].weight.value=.6;x.qs[1].weight.value=.4;
 for(const delta of [-.8,0,.6]) {x.delta.value=delta;for(const cs of [.05,.3,.5])for(const qs of [1.1,1.5,1.8]) {
  let expected=0;
  for(const a of x.cs)for(const b of x.qs) {const u=a.width.value,v=b.width.value,c=a.center.value,q=b.center.value;
   expected+=a.weight.value*b.weight.value/(2*Math.PI*u*v*Math.sqrt(1-delta*delta))*Math.exp(-1/(2*(1-delta*delta))*((cs-c)**2/(u*u)+(qs-q)**2/(v*v)-2*delta*(cs-c)*(qs-q)/(u*v)));
  }
  assert.ok(Math.abs(jointDensity(x,cs,qs)-expected)<1e-12);
 }}
});
test('the one-dimensional plots are marginals of the same correlated joint density',()=>{
 const x=model();x.delta.value=-.7;
 for(const cs of [.1,.3,.6]) {
  const step=.004;let integral=0;for(let i=0;i<2000;i++)integral+=jointDensity(x,cs,-2.5+(i+.5)*step)*step;
  assert.ok(Math.abs(integral-marginalDensity(x.cs,cs))<1e-9);
 }
 x.delta.value=0;assert.ok(Math.abs(jointDensity(x,.4,1.7)-marginalDensity(x.cs,.4)*marginalDensity(x.qs,1.7))<1e-12);
});
test('positive and negative coupling tilt the joint map in opposite directions',()=>{
 const x=model(),same=()=>jointDensity(x,.5,1.9),opposite=()=>jointDensity(x,.5,1.1);
 assert.ok(same()>opposite());x.delta.value=-.6;assert.ok(same()<opposite());
 const grid=densityGrid(x);assert.ok(grid.maximum>0);assert.ok(grid.values.every(Number.isFinite));assert.ok(contourSegments(grid.values,grid.columns,grid.rows,grid.maximum/2).length>0);
});
test('perfect correlation and zero-width components use singular ridges or points instead of a fabricated finite density',()=>{
 const x=model();x.delta.value=1;let grid=densityGrid(x);assert.equal(grid.error,'');assert.equal(grid.maximum,0);assert.ok(grid.pairs.every(p=>p.singular));
 x.delta.value=-1;assert.equal(jointDensity(x,.3,1.5),0);
 x.delta.value=.4;x.cs[0].width.value=0;grid=densityGrid(x);assert.equal(grid.maximum,0);assert.ok(grid.pairs[0].singular);
 x.qs[0].width.value=0;assert.ok(densityGrid(x).pairs[0].singular);
 x.delta.value=1.1;assert.match(densityGrid(x).error,/coupling/);
});
