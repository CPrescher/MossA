import { useEffect, useId, useMemo, useRef } from 'react';
import { useScreenPlotText } from './useScreenPlotText';
import { niceTicks,formatTick } from './axes.mjs';
import { contourSegments,densityColor,densityGrid,distributionRange,marginalDensity } from './xvbf-density';
import type { DistributionComponent,Xvbf } from './types';

export function DistributionPlot({components,label}:{components:DistributionComponent[];label:string}) {
  const text = useScreenPlotText(440,190);
  const titleVisible=typeof window==='undefined'||window.innerHeight>800;
  const axisY=Math.max(48,Math.min(120,175-(titleVisible?2.6:1.6)*text.labelSize));
  const tickY=axisY+Math.max(27,1.15*text.labelSize+5),titleY=tickY+Math.max(30,1.3*text.labelSize);
  const [lo,hi]=distributionRange(components),xs=Array.from({length:201},(_,i)=>lo+(hi-lo)*i/200);
  const curves=components.map(c=>xs.map(x=>marginalDensity([c],x))),sum=xs.map(x=>marginalDensity(components,x)),height=Math.max(...sum,1e-6),xx=(x:number)=>36+388*(x-lo)/(hi-lo),yy=(y:number)=>axisY-(axisY-16)*y/height;
  const path=(ys:number[])=>ys.map((y,i)=>`${i?'L':'M'}${xx(xs[i])},${yy(y)}`).join(' '),ticks=niceTicks(lo,hi,2);
  const valid=[lo,hi,height,...sum].every(Number.isFinite);
  return <svg ref={text.ref} style={text.style} id={`xvbf-${label.toLowerCase()}-plot`} className="xvbf-distribution-plot" width="440" height="190" viewBox="0 0 440 190" role="img" aria-label={`${label} distribution`}><title>{`${label} marginal of the joint CS–QS distribution in mm/s; widths use MATLAB pdd_calc's sigma convention`}</title><line x1="36" x2="424" y1={axisY} y2={axisY} stroke="#8b9ba4"/>{valid&&<>{curves.map((y,i)=>components[i].width.value>0?<path key={i} d={path(y)} fill="none" stroke="#78aaa5" strokeWidth="1.2"/>:components[i].weight.value>0?<line key={i} x1={xx(components[i].center.value)} x2={xx(components[i].center.value)} y1="16" y2={axisY} stroke="#78aaa5"/>:null)}<path d={path(sum)} className="xvbf-marginal-total" fill="none" stroke="#3b645f" strokeWidth="2"/>{ticks.values.map((x:number)=><text key={x} className="xvbf-plot-label" x={xx(x)} y={tickY} textAnchor="middle" fontSize="20" fill="#657582">{formatTick(x,ticks.step)}</text>)}</>}<text className="xvbf-plot-label" x="230" y={titleY} textAnchor="middle" fontSize="20" fill="#657582">{label} (mm/s)</text></svg>;
}
export function JointDistributionPlot({model,id='xvbf-correlation-plot',large=false,compact=false}:{model:Xvbf;id?:string;large?:boolean;compact?:boolean}) {
  const gradient=useId().replace(/[^a-zA-Z0-9_-]/g,''),data=useMemo(()=>densityGrid(model,large?120:64,large?100:56),[model,large]);
  const width=large?760:320,height=large?500:compact?212:292,ticksX=niceTicks(...data.cs,large?6:3),ticksY=niceTicks(...data.qs,large?6:4);
  const text = useScreenPlotText(width,height);
  const left=Math.max(large?80:72,36+Math.max(0,...ticksY.values.map((v:number)=>formatTick(v,ticksY.step).length))*9),right=width-25,top=18,bottom=height-104,w=right-left,h=bottom-top;
  const xx=(v:number)=>left+(v-data.cs[0])/(data.cs[1]-data.cs[0])*w,yy=(v:number)=>bottom-(v-data.qs[0])/(data.qs[1]-data.qs[0])*h;
  const singular=data.pairs.filter(p=>p.singular),regular=data.pairs.some(p=>!p.singular);
  const contours=useMemo(()=>data.maximum>0&&!data.error?[.1,.25,.5,.75,.9].map(f=>contourSegments(data.values,data.columns,data.rows,f*data.maximum)):[],[data]);
  return <svg ref={text.ref} style={text.style} id={id} className="xvbf-joint-plot" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Joint CS–QS distribution"><title>Joint CS–QS density from MATLAB pdd_calc; contours are fractions of peak density, not confidence regions</title><defs><linearGradient id={`${gradient}-scale`}>{[0,.25,.5,.75,1].map(f=><stop key={f} offset={`${f*100}%`} stopColor={densityColor(f)}/>)}</linearGradient><clipPath id={`${gradient}-clip`}><rect x={left} y={top} width={w} height={h}/></clipPath></defs><rect className={regular&&!data.error?undefined:"xvbf-joint-background"} x={left} y={top} width={w} height={h} fill={regular&&!data.error?densityColor(0):"#f7f9fa"}/>
    <g clipPath={`url(#${gradient}-clip)`}>{!data.error&&data.maximum>0&&data.values.map((v,i)=>{const f=v/data.maximum;if(f<.001)return null;const x=i%data.columns,y=Math.floor(i/data.columns),cellW=w/(data.columns-1),cellH=h/(data.rows-1);return <rect key={i} x={left+(x-.5)*cellW} y={bottom-(y+.5)*cellH} width={cellW+.25} height={cellH+.25} fill={densityColor(f)}/>;})}
      {contours.map((segments,i)=><path key={i} data-testid="joint-density-contour" d={segments.map(([x1,y1,x2,y2])=>`M${left+x1*w/(data.columns-1)},${bottom-y1*h/(data.rows-1)}L${left+x2*w/(data.columns-1)},${bottom-y2*h/(data.rows-1)}`).join(' ')} fill="none" stroke="#fff" strokeWidth={large?1:.8} opacity=".65"/>)}
      {!data.error&&singular.map((p,i)=>p.csWidth===0&&p.qsWidth===0?<circle key={i} cx={xx(p.cs)} cy={yy(p.qs)} r="4" fill="#278c88"/>:<line key={i} x1={xx(p.cs-3*p.csWidth)} y1={yy(p.qs-3*(Math.abs(p.correlation)===1?p.correlation:1)*p.qsWidth)} x2={xx(p.cs+3*p.csWidth)} y2={yy(p.qs+3*(Math.abs(p.correlation)===1?p.correlation:1)*p.qsWidth)} stroke="#278c88" strokeWidth={2+2*p.weight} opacity={.35+.65*p.weight}/>)}
    </g><path d={`M${left},${top}V${bottom}H${right}`} fill="none" stroke="#8b9ba4"/>
    {!data.error&&<>{ticksX.values.map((v:number)=><g key={v}><line x1={xx(v)} x2={xx(v)} y1={bottom} y2={bottom+4} stroke="#8b9ba4"/><text className="xvbf-plot-label" x={xx(v)} y={bottom+19} textAnchor="middle" fontSize="16" fill="#657582">{formatTick(v,ticksX.step)}</text></g>)}{ticksY.values.map((v:number)=><g key={v}><line x1={left-4} x2={left} y1={yy(v)} y2={yy(v)} stroke="#8b9ba4"/><text className="xvbf-plot-label" x={left-8} y={yy(v)+4} textAnchor="end" fontSize="16" fill="#657582">{formatTick(v,ticksY.step)}</text></g>)}</>}
    <text className="xvbf-plot-label" x={(left+right)/2} y={bottom+38} textAnchor="middle" fontSize="16" fill="#657582">CS (mm/s)</text><text className="xvbf-plot-label" transform={`translate(14 ${(top+bottom)/2}) rotate(-90)`} textAnchor="middle" fontSize="16" fill="#657582">QS (mm/s)</text>
    {regular&&!data.error?<><rect x={left} y={height-16} width={w} height="5" fill={`url(#${gradient}-scale)`}/><text className="xvbf-plot-label" x={left} y={height-22} fontSize="14" fill="#657582">Relative density</text><text className="xvbf-plot-label" x={right} y={height-22} textAnchor="end" fontSize="14" fill="#657582">0 → 1</text></>:null}
    {!!singular.length&&!data.error&&<text className="xvbf-plot-label" x={(left+right)/2} y={height-3} textAnchor="middle" fontSize="14" fill="#657582">{regular?'Singular components shown as ridges/points':'Singular distribution: ridges/points'}</text>}
    {data.error&&<text className="xvbf-plot-label" x={(left+right)/2} y={(top+bottom)/2} textAnchor="middle" fontSize="16" fill="#ad5546">{data.error}</text>}
  </svg>;
}
export function CorrelationDialog({model,onClose}:{model:Xvbf;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);useEffect(()=>{dialog.current?.showModal();},[]);
  function exportSvg(){const svg=dialog.current?.querySelector('svg')?.cloneNode(true) as SVGElement|undefined;if(!svg)return;svg.setAttribute('xmlns','http://www.w3.org/2000/svg');const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'})),link=document.createElement('a');link.href=url;link.download='mossa-cs-qs-correlation.svg';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <dialog className="xvbf-correlation-dialog" ref={dialog} onClose={onClose} onKeyDown={e=>e.stopPropagation()} aria-labelledby="correlation-heading"><div className="help-heading"><h2 id="correlation-heading">CS–QS correlation</h2><span>δ = {Number(model.delta.value.toPrecision(5))}</span><button onClick={exportSvg}>Export SVG</button><form method="dialog"><button aria-label="Close correlation plot">×</button></form></div><div className="xvbf-correlation-large"><JointDistributionPlot model={model} id="xvbf-correlation-large" large/></div></dialog>;
}
