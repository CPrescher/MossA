import { parameter, type DistributionComponent, type Parameter, type Site, type Xvbf } from './types';
export function enableXvbf(site:Site):Site {
  if(site.kind!=='Doublet'||site.profile!=='Lorentzian') throw new Error('Select a Lorentzian doublet for xVBF.');
  return {...site,xvbf:site.xvbf??{delta:parameter(0,true,-1,1),cs:[{center:{...site.params.cs,link:null},width:parameter(.2,true,0,null),weight:parameter(1,false,0,1)}],qs:[{center:{...site.params.qs,value:Math.abs(site.params.qs.value),link:null},width:parameter(.2,false,0,null),weight:parameter(1,false,0,1)}]}};
}
export function validXvbf(x:unknown):x is Xvbf {
  const value=x as Xvbf;
  const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
  const valid=(p:Parameter)=>!!p&&finite(p.value)&&typeof p.fit==='boolean'&&(p.min===null||finite(p.min))&&(p.max===null||finite(p.max))&&p.link==null;
  return !!value&&valid(value.delta)&&Math.abs(value.delta.value)<=1&&[value.cs,value.qs].every(list=>Array.isArray(list)&&list.length>0&&list.length<=8&&list.every(c=>valid(c.center)&&valid(c.width)&&c.width.value>=0&&valid(c.weight)&&c.weight.value>=0&&c.weight.value<=1)&&Math.abs(list.reduce((s,c)=>s+c.weight.value,0)-1)<1e-9)&&value.qs.every(c=>c.center.value>=0);
}
function redistribute(list:DistributionComponent[],indices:number[],mass:number) {
  const total=indices.reduce((s,i)=>s+list[i].weight.value,0),delta=mass-total;
  if(Math.abs(delta)<1e-12)return;
  const capacities=indices.map(i=>delta>0?Math.min(1,list[i].weight.max??1)-list[i].weight.value:list[i].weight.value-Math.max(0,list[i].weight.min??0));
  const capacity=capacities.reduce((a,b)=>a+b,0);
  if(capacity<Math.abs(delta)-1e-10)throw new Error('The other free weights cannot absorb this change within their bounds. Free a weight or adjust its bounds.');
  indices.forEach((index,j)=>list[index].weight.value+=delta*capacities[j]/capacity);
}
export function editDistribution(model:Xvbf,axis:'cs'|'qs',index:number,key:keyof DistributionComponent,patch:Partial<Parameter>):Xvbf {
  const x=structuredClone(model),list=x[axis]; list[index][key]={...list[index][key],...patch};
  if(key==='weight'&&patch.value!==undefined) {
    if(patch.value<0||patch.value>1)throw new Error('Weight must be between 0 and 100%.');
    const indices=list.map((_,i)=>i).filter(i=>i!==index&&list[i].weight.fit);
    const fixed=list.reduce((s,c,i)=>i!==index&&!indices.includes(i)?s+c.weight.value:s,0);
    redistribute(list,indices,1-patch.value-fixed);
  }
  return x;
}
export function addDistribution(model:Xvbf,axis:'cs'|'qs'):Xvbf {
  const x=structuredClone(model),list=x[axis];if(list.length>=8)return model;
  const index=list.reduce((best,c,i)=>c.weight.value-(c.weight.min??0)>list[best].weight.value-(list[best].weight.min??0)?i:best,0),donor=list[index];
  const mass=(donor.weight.value-Math.max(0,donor.weight.min??0))/2;
  if(mass<=1e-12)throw new Error('No component can split its weight within the current bounds.');
  donor.weight={...donor.weight,value:donor.weight.value-mass,fit:true};
  const component=structuredClone(donor);component.weight=parameter(mass,true,0,1);
  component.center.value=Math.min(component.center.max??Infinity,component.center.value+Math.max(component.width.value,.05));
  list.push(component);return x;
}
export function removeDistribution(model:Xvbf,axis:'cs'|'qs',index:number):Xvbf {
  const x=structuredClone(model),list=x[axis];if(list.length===1)return model;
  list.splice(index,1);
  if(list.length===1) {const p=list[0].weight;if((p.min??0)>1||(p.max??1)<1)throw new Error('The last component must allow 100% weight.');list[0].weight={...p,value:1,fit:false};return x;}
  const indices=list.map((_,i)=>i).filter(i=>list[i].weight.fit),fixed=list.reduce((s,c,i)=>indices.includes(i)?s:s+c.weight.value,0);
  redistribute(list,indices,1-fixed);return x;
}
export function distributionMean(site:Site,axis:'cs'|'qs') {return site.xvbf?.[axis].reduce((sum,c)=>sum+c.center.value*c.weight.value,0)??site.params[axis].value;}
