import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react';
import { colors, type Evaluation, type Project } from './types';
import { niceTicks, formatTick } from './axes.mjs';

type Range=[number,number];
type View={x:Range;y:Range|null;residual:Range|null};
type Point={x:number;y:number};
type Drag={button:number;start:Point;last:Point;view:View;yrange:Range;region:'main'|'residual';moved:boolean};
export type Picking={stage:number;first?:Point;width?:Point;cursor?:Point;kind:string};
function extent(a:number[],fallback:Range):Range{let lo=Infinity,hi=-Infinity;for(const n of a){lo=Math.min(lo,n);hi=Math.max(hi,n);}return Number.isFinite(lo)&&Number.isFinite(hi)?[lo,hi]:fallback;}
export function Plot({id="spectrum-plot",project,evaluation,fitted,highlightedSite=null,picking,onPick,onHover,onCancelPick}:{id?:string;project:Project;evaluation:Evaluation|null;fitted:boolean;highlightedSite?:number|null;picking:Picking|null;onPick:(p:Point)=>void;onHover:(p:Point)=>void;onCancelPick:()=>void}){
 const clipPrefix=id==='spectrum-plot'?'':`${id}-`;
 const xs=project.spectrum.x,ys=project.spectrum.y,full:Range=[xs[0],xs[xs.length-1]];
 const [view,setView]=useState<View>({x:full,y:null,residual:null});
 const [cursor,setCursor]=useState<Point|null>(null),[selection,setSelection]=useState<{a:Point;b:Point;region:'main'|'residual'}|null>(null),[showSites,setShowSites]=useState(true);
 const history=useRef<View[]>([]),drag=useRef<Drag|null>(null),rightTimer=useRef<ReturnType<typeof setTimeout>|null>(null),lastRight=useRef(0);
 const ref=useRef<SVGSVGElement>(null);
 const [size,setSize]=useState({w:900,h:565});
 const W=size.w,H=size.h,R=W-16,T=20,B=T+Math.max(45,(H-130)*.78),RT=B+30,RB=H-60;
 useEffect(()=>{const node=ref.current;if(!node)return;const observer=new ResizeObserver(([entry])=>{const {width,height}=entry.contentRect;if(width>0&&height>0)setSize({w:width,h:height});});observer.observe(node);return()=>observer.disconnect();},[]);
 useEffect(()=>{setView({x:[xs[0],xs[xs.length-1]],y:null,residual:null});history.current=[];},[xs]);
 useEffect(()=>()=>{if(rightTimer.current)clearTimeout(rightTimer.current);},[]);
 const visible=xs.map((x,i)=>x>=view.x[0]&&x<=view.x[1]?i:-1).filter(i=>i>=0);
 const allY:Range=extent(ys,[0,1]);
 const [a,b]=extent(visible.map(i=>ys[i]).concat(evaluation?visible.map(i=>evaluation.y[i]):[]),allY);
 const pad=Math.max((b-a)*.12,Math.abs(b)*1e-5,1e-5),yrange:Range=view.y??[a-pad,b+pad];
 let rm=1e-6;for(const i of visible)rm=Math.max(rm,Math.abs(evaluation?.residual[i]??1));rm*=1.15;
 const rrange:Range=view.residual??[-rm,rm];
 const yt=niceTicks(yrange[0],yrange[1],Math.max(2,Math.min(7,Math.floor((B-T)/60))));
 const rt=niceTicks(rrange[0],rrange[1],Math.max(2,Math.min(5,Math.floor((RB-RT)/40))));
 const labelWidth=Math.max(0,...yt.values.map(v=>formatTick(v,yt.step).length),...rt.values.map(v=>formatTick(v,rt.step).length))*6.4;
 const L=Math.max(62,Math.min(112,labelWidth+36));
 const xt=niceTicks(view.x[0],view.x[1],Math.max(2,Math.min(8,Math.floor((R-L)/80))));
 useEffect(()=>{if(picking)setView(v=>({...v,y:yrange}));},[!!picking]);
 const px=(v:number)=>L+(v-view.x[0])/(view.x[1]-view.x[0])*(R-L);
 const py=(v:number)=>B-(v-yrange[0])/(yrange[1]-yrange[0])*(B-T);
 const pr=(v:number)=>RB-(v-rrange[0])/(rrange[1]-rrange[0])*(RB-RT);
 const vx=(v:number,vw=view)=>vw.x[0]+(v-L)/(R-L)*(vw.x[1]-vw.x[0]);
 const vy=(v:number,range:Range,region:'main'|'residual')=>range[1]-(v-(region==='main'?T:RT))/(region==='main'?B-T:RB-RT)*(range[1]-range[0]);
 const path=(y:number[],residual=false)=>visible.map((i,k)=>`${k?'L':'M'}${px(xs[i]).toFixed(2)},${(residual?pr(y[i]):py(y[i])).toFixed(2)}`).join('');
 const point=(e:RPointerEvent<SVGSVGElement>|RWheelEvent<SVGSVGElement>):Point=>{const s=e.currentTarget.createSVGPoint();s.x=e.clientX;s.y=e.clientY;const matrix=e.currentTarget.getScreenCTM();const p=matrix?s.matrixTransform(matrix.inverse()):s;return{x:p.x,y:p.y};};
 const region=(p:Point)=>p.x>=L&&p.x<=R?(p.y>=T&&p.y<=B?'main':p.y>=RT&&p.y<=RB?'residual':null):null;
 const reset=()=>{history.current=[];setView({x:full,y:null,residual:null});};
 const unzoom=()=>setView(history.current.pop()??{x:full,y:null,residual:null});
 const zoom=(factor:number,p?:Point)=>{history.current.push(view);const center=p?vx(p.x):(view.x[0]+view.x[1])/2;const span=Math.max((full[1]-full[0])/1000,(view.x[1]-view.x[0])*factor);setView({...view,x:[center-span/2,center+span/2]});};
 const down=(e:RPointerEvent<SVGSVGElement>)=>{const p=point(e),r=region(p);if(!r||![0,2].includes(e.button))return;e.preventDefault();

  drag.current={button:e.button,start:p,last:p,view,yrange:r==='main'?yrange:rrange,region:r,moved:false};e.currentTarget.setPointerCapture(e.pointerId);
 };
 const move=(e:RPointerEvent<SVGSVGElement>)=>{const p=point(e),r=region(p);setCursor(r==='main'?{x:vx(p.x),y:vy(p.y,yrange,'main')}:null);
  const d=drag.current;if(picking&&!d&&r==='main')onHover({x:vx(p.x),y:vy(p.y,yrange,'main')});if(!d)return;d.last=p;if(Math.hypot(p.x-d.start.x,p.y-d.start.y)>4)d.moved=true;if(!d.moved)return;
  if(d.button===0){setSelection({a:d.start,b:{x:Math.max(L,Math.min(R,p.x)),y:Math.max(d.region==='main'?T:RT,Math.min(d.region==='main'?B:RB,p.y))},region:d.region});}
  else{const dx=(d.start.x-p.x)/(R-L)*(d.view.x[1]-d.view.x[0]),dy=(p.y-d.start.y)/(d.region==='main'?B-T:RB-RT)*(d.yrange[1]-d.yrange[0]);const next:View={...d.view,x:[d.view.x[0]+dx,d.view.x[1]+dx]};next[d.region==='main'?'y':'residual']=[d.yrange[0]+dy,d.yrange[1]+dy];setView(next);}
 };
 const up=(e:RPointerEvent<SVGSVGElement>)=>{const d=drag.current;if(!d)return;drag.current=null;setSelection(null);const p=point(e);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  if(d.button===0){if(!d.moved){if(picking&&d.region==='main'&&region(p)==='main')onPick({x:vx(p.x),y:vy(p.y,yrange,'main')});return;}const end={x:Math.max(L,Math.min(R,p.x)),y:Math.max(d.region==='main'?T:RT,Math.min(d.region==='main'?B:RB,p.y))};if(Math.abs(end.x-d.start.x)<4||Math.abs(end.y-d.start.y)<4)return;
   history.current.push(d.view);const next:View={...d.view,x:[vx(Math.min(d.start.x,end.x),d.view),vx(Math.max(d.start.x,end.x),d.view)]};const yy:Range=[vy(Math.max(d.start.y,end.y),d.yrange,d.region),vy(Math.min(d.start.y,end.y),d.yrange,d.region)];next[d.region==='main'?'y':'residual']=yy;setView(next);
  }else if(!d.moved){const now=performance.now();if(lastRight.current>0&&now-lastRight.current<350){if(rightTimer.current)clearTimeout(rightTimer.current);rightTimer.current=null;lastRight.current=0;reset();}else{lastRight.current=now;rightTimer.current=setTimeout(()=>{unzoom();rightTimer.current=null;},280);}}
 };
 const pickGuide=picking?.cursor??cursor;
 const sampled=visible.filter((_,k)=>k%Math.max(1,Math.ceil(visible.length/4000))===0);
 let componentScale=1;
 if(project.mode==='transmission'&&evaluation){let maximum=0;for(let i=0;i<xs.length;i++)maximum=Math.max(maximum,evaluation.components.reduce((total,c)=>total+c[i],0));let minimum=Infinity;for(const y of ys)minimum=Math.min(minimum,y);componentScale=maximum>0?.8*Math.max(0,project.background[0].value-minimum)/maximum:0;}

 return <div className={`plot-shell ${picking?'picking':''}`}>
  <div className="plot-toolbar"><div className="plot-legend"><span><i className="dot"/>Data</span><span><i className="line model"/>Model</span><label title={project.mode === 'transmission' ? 'Absorber profiles scaled together for display; not additive transmission components' : 'Show individual sites'}><input type="checkbox" checked={showSites} onChange={e=>setShowSites(e.target.checked)}/>Sites</label></div><div className="plot-tools"><button aria-label="Zoom in" title="Zoom in" onClick={()=>zoom(.65)}>＋</button><button aria-label="Zoom out" title="Zoom out" onClick={()=>zoom(1.5)}>−</button><button onClick={unzoom}>Unzoom</button><button onClick={reset}>Reset view</button></div></div>
  <svg ref={ref} id={id} data-view-x={view.x.join(',')} data-view-y={yrange.join(',')} viewBox={`0 0 ${W} ${H}`} role="img" tabIndex={0} aria-label="Mössbauer spectrum with observed points, current model, and residuals" onContextMenu={e=>e.preventDefault()} onKeyDown={e=>{if(e.key==='Escape'){if(picking)onCancelPick();else{drag.current=null;setSelection(null);}}}} onWheel={e=>{const p=point(e);if(region(p))zoom(e.deltaY>0?1.15:.85,p);}} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{drag.current=null;setSelection(null);}} onPointerLeave={()=>setCursor(null)}>
   <defs><clipPath id={`${clipPrefix}spectrum-clip`}><rect x={L} y={T} width={R-L} height={B-T}/></clipPath><clipPath id={`${clipPrefix}residual-clip`}><rect x={L} y={RT} width={R-L} height={RB-RT}/></clipPath></defs><rect className="plot-background" width={W} height={H} fill="white"/>
   {yt.values.map((t,i)=><g key={i}><line x1={L} x2={R} y1={py(t)} y2={py(t)} className="grid"/><text x={L-12} y={py(t)+4} textAnchor="end" className="tick">{formatTick(t,yt.step)}</text></g>)}
   {xt.values.map((t,i)=><g key={i}><line x1={px(t)} x2={px(t)} y1={T} y2={B} className="grid"/><line x1={px(t)} x2={px(t)} y1={RT} y2={RB} className="grid"/><text x={px(t)} y={RB+20} textAnchor="middle" className="tick">{formatTick(t,xt.step)}</text></g>)}
   <g clipPath={`url(#${clipPrefix}spectrum-clip)`}>
    {evaluation&&showSites&&evaluation.components.map((c,k)=>k===highlightedSite?null:<path data-site-index={k} key={k} d={path(c.map((v,i)=>evaluation.background[i]-v*componentScale))} fill="none" stroke={colors[k%colors.length]} strokeWidth="1.3" opacity=".65"/>)}
    {evaluation&&<path d={path(evaluation.background)} fill="none" stroke="#a6afb6" strokeDasharray="5 4" strokeWidth="1.2"/>}
    {sampled.map(i=><circle className="observed-point" key={i} cx={px(xs[i])} cy={py(ys[i])} r="1.65" fill="#3e4852" opacity=".65"/>)}
    {evaluation&&<path d={path(evaluation.y)} fill="none" className="total-model-curve" stroke="#171c20" strokeWidth="2.2"/>}
    {evaluation&&showSites&&highlightedSite!==null&&evaluation.components[highlightedSite]&&<g className="highlighted-site-curve" data-site-index={highlightedSite}>
      <path d={path(evaluation.components[highlightedSite].map((v,i)=>evaluation.background[i]-v*componentScale))} fill="none" className="highlighted-site-halo" stroke="white" strokeWidth="4.6" opacity=".75"/>
      <path d={path(evaluation.components[highlightedSite].map((v,i)=>evaluation.background[i]-v*componentScale))} fill="none" stroke={colors[highlightedSite%colors.length]} strokeWidth="2.8"/>
    </g>}
   </g>
   <line x1={L} x2={R} y1={B} y2={B} className="axis"/><line x1={L} x2={L} y1={T} y2={B} className="axis"/><text transform={`translate(14 ${(T+B)/2}) rotate(-90)`} textAnchor="middle" className="axis-label">Counts / intensity</text><text x={L} y={RT-13} className="section-label">Residual</text><line x1={L} x2={R} y1={pr(0)} y2={pr(0)} stroke="#aeb7bd" strokeDasharray="4 4"/><g clipPath={`url(#${clipPrefix}residual-clip)`}>{evaluation&&sampled.map(i=><circle className="residual-point" key={i} cx={px(xs[i])} cy={pr(evaluation.residual[i])} r="1.5" fill="#647c8b" opacity=".8"/>)}</g>{rt.values.map((t,i)=><g key={i}><line x1={L} x2={R} y1={pr(t)} y2={pr(t)} className="grid"/><text x={L-12} y={pr(t)+4} textAnchor="end" className="tick">{formatTick(t,rt.step)}</text></g>)}<line x1={L} x2={R} y1={RB} y2={RB} className="axis"/><text x={(L+R)/2} y={H-8} textAnchor="middle" className="axis-label">Velocity (mm/s)</text>
   {cursor&&!picking&&<g pointerEvents="none"><line x1={px(cursor.x)} x2={px(cursor.x)} y1={T} y2={RB} stroke="#b2bec5" strokeDasharray="3 4"/><rect className="cursor-label" x={Math.min(R-112,Math.max(L,px(cursor.x)-55))} y={T+4} width="110" height="23" rx="3" fill="#f0f4f6"/><text x={Math.min(R-57,Math.max(L+55,px(cursor.x)))} y={T+20} textAnchor="middle" className="tick">{cursor.x.toFixed(3)} mm/s</text></g>}
   {picking&&pickGuide&&<g clipPath={`url(#${clipPrefix}spectrum-clip)`} pointerEvents="none"><line x1={px(pickGuide.x)} x2={px(pickGuide.x)} y1={T} y2={B} stroke="#278b84" strokeDasharray="5 4"/><line x1={L} x2={R} y1={py(pickGuide.y)} y2={py(pickGuide.y)} stroke="#278b84" strokeDasharray="5 4"/>{picking.first&&<circle cx={px(picking.first.x)} cy={py(picking.first.y)} r="4" fill="#278b84"/>}{picking.stage===1&&picking.first&&<line x1={px(2*picking.first.x-pickGuide.x)} x2={px(pickGuide.x)} y1={py(picking.first.y)} y2={py(picking.first.y)} stroke="#278b84" strokeWidth="2"/>}</g>}
   {selection&&<rect data-testid="zoom-rectangle" x={Math.min(selection.a.x,selection.b.x)} y={Math.min(selection.a.y,selection.b.y)} width={Math.abs(selection.b.x-selection.a.x)} height={Math.abs(selection.b.y-selection.a.y)} fill="#2d8d8522" stroke="#2d8d85" strokeDasharray="4 2" pointerEvents="none"/>}
  </svg>
  {picking&&<div className="picking-tooltip" style={{ bottom: H-B+8 }} role="status" aria-live="polite"><strong>{picking.stage+1}/{picking.kind==='Singlet'?2:3}</strong><span>{picking.stage===0?'Click the first line':picking.stage===1?'Click to set half-width':picking.kind==='Doublet'?'Click the other line':'Click the opposite outer line'}</span><kbd>Esc</kbd></div>}

 </div>;
}
