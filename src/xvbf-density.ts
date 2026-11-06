import type { DistributionComponent, Xvbf } from './types';
export type Range = [number, number];
export type DensityPair = { cs:number; qs:number; csWidth:number; qsWidth:number; weight:number; correlation:number; singular:boolean };
// csite.m:pdd_calc treats the legacy width arguments as Gaussian sigma.
// These display functions share that convention; they do not change the fit.
export function distributionRange(components:DistributionComponent[]):Range {
  const lo=Math.min(...components.map(c=>c.center.value-3*Math.max(0,c.width.value))),hi=Math.max(...components.map(c=>c.center.value+3*Math.max(0,c.width.value)));
  const pad=Math.max((hi-lo)*.04,1e-4);
  return [lo-pad,hi+pad];
}
export function marginalDensity(components:DistributionComponent[],x:number):number {
  return components.reduce((sum,c)=>c.width.value>0 ? sum+c.weight.value/(Math.sqrt(2*Math.PI)*c.width.value)*Math.exp(-.5*((x-c.center.value)/c.width.value)**2) : sum,0);
}
export function densityPairs(model:Xvbf):DensityPair[] {
  return model.cs.flatMap(c=>model.qs.map(q=>({cs:c.center.value,qs:q.center.value,csWidth:c.width.value,qsWidth:q.width.value,weight:c.weight.value*q.weight.value,correlation:model.delta.value,singular:c.width.value===0||q.width.value===0||Math.abs(model.delta.value)===1}))).filter(p=>p.weight>0);
}
export function pairDensity(pair:DensityPair,x:number,y:number):number {
  if(pair.singular)return 0; // A line/point mass has no finite 2D density.
  const u=(x-pair.cs)/pair.csWidth,v=(y-pair.qs)/pair.qsWidth,d=1-pair.correlation**2;
  // Sum-of-squares form avoids cancellation near perfect correlation.
  return pair.weight/(2*Math.PI*pair.csWidth*pair.qsWidth*Math.sqrt(d))*Math.exp(-.5*((u-pair.correlation*v)**2/d+v*v));
}
export function jointDensity(model:Xvbf,x:number,y:number):number {return densityPairs(model).reduce((s,p)=>s+pairDensity(p,x,y),0);}
export function densityGrid(model:Xvbf,columns=64,rows=56) {
  const cs=distributionRange(model.cs),qs=distributionRange(model.qs),pairs=densityPairs(model);
  const invalid=Math.abs(model.delta.value)>1||!Number.isFinite(model.delta.value)||[...model.cs,...model.qs].some(c=>c.width.value<0||c.weight.value<0||![c.center.value,c.width.value,c.weight.value].every(Number.isFinite))||![...cs,...qs].every(Number.isFinite);
  if(invalid)return {cs,qs,columns,rows,values:[] as number[],maximum:0,pairs,error:'Check widths, weights, and coupling.'};
  const values=Array.from({length:columns*rows},(_,i)=>{const x=cs[0]+(cs[1]-cs[0])*(i%columns)/(columns-1),y=qs[0]+(qs[1]-qs[0])*Math.floor(i/columns)/(rows-1);return pairs.reduce((sum,p)=>sum+pairDensity(p,x,y),0);});
  const maximum=Math.max(...values);
  return {cs,qs,columns,rows,values,maximum,pairs,error:values.every(Number.isFinite)?'':'Density is outside the display range.'};
}
// Marching squares at fractions of the combined density maximum. These are
// density contours, not confidence regions or enclosed-probability contours.
export function contourSegments(values:number[],columns:number,rows:number,level:number) {
  const segments:number[][]=[];
  for(let y=0;y<rows-1;y++)for(let x=0;x<columns-1;x++) {
    const corners=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]],v=[values[y*columns+x],values[y*columns+x+1],values[(y+1)*columns+x+1],values[(y+1)*columns+x]],crossings:{edge:number;x:number;y:number}[]=[];
    for(let edge=0;edge<4;edge++){const j=(edge+1)%4;if((v[edge]>=level)===(v[j]>=level))continue;const t=(level-v[edge])/(v[j]-v[edge]);crossings.push({edge,x:corners[edge][0]+t*(corners[j][0]-corners[edge][0]),y:corners[edge][1]+t*(corners[j][1]-corners[edge][1])});}
    const connect=(a:number,b:number)=>segments.push([crossings[a].x,crossings[a].y,crossings[b].x,crossings[b].y]);
    if(crossings.length===2)connect(0,1);
    else if(crossings.length===4){if((v.reduce((a,b)=>a+b,0)/4>=level)===(v[0]>=level)){connect(0,1);connect(2,3);}else{connect(3,0);connect(1,2);}}
  }
  return segments;
}
const palette=[[31,25,78],[48,70,122],[30,132,141],[100,193,103],[253,231,37]];
export function densityColor(fraction:number) {
  const value=Math.max(0,Math.min(1,fraction))*(palette.length-1),i=Math.min(palette.length-2,Math.floor(value)),t=value-i;
  return `rgb(${palette[i].map((v,k)=>Math.round(v+(palette[i+1][k]-v)*t)).join(',')})`;
}
