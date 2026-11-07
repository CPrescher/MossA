import { siteDisplayCurves } from './site-display';
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { colors, siteColor, type Evaluation, type Project } from './types';
import { niceTicks, formatTick } from './axes.mjs';

type Range=[number,number];
type View={x:Range;y:Range|null;residual:Range|null};
type Point={x:number;y:number};
type Drag={button:number;origin:Point;start:Point;last:Point;view:View;yrange:Range;region:'main'|'residual';moved:boolean};
export type Picking={stage:number;first?:Point;width?:Point;cursor?:Point;kind:string};
function extent(a:number[],fallback:Range):Range{let lo=Infinity,hi=-Infinity;for(const n of a){lo=Math.min(lo,n);hi=Math.max(hi,n);}return Number.isFinite(lo)&&Number.isFinite(hi)?[lo,hi]:fallback;}
export function Plot({id="spectrum-plot",project,evaluation,fitted,highlightedSite=null,picking,onPick,onHover,onCancelPick}:{id?:string;project:Project;evaluation:Evaluation|null;fitted:boolean;highlightedSite?:number|null;picking:Picking|null;onPick:(p:Point)=>void;onHover:(p:Point)=>void;onCancelPick:()=>void}){
 const clipPrefix=id==='spectrum-plot'?'':`${id}-`;
 const xs=project.spectrum.x,ys=project.spectrum.y,full:Range=[xs[0],xs[xs.length-1]];
 const [view,setView]=useState<View>({x:full,y:null,residual:null});
 const [cursor,setCursor]=useState<(Point&{region:'main'|'residual'})|null>(null),[selection,setSelection]=useState<{a:Point;b:Point;region:'main'|'residual'}|null>(null),[showSites,setShowSites]=useState(true),[fillSites,setFillSites]=useState(false);
 const [badgeSide,setBadgeSide]=useState<'left'|'right'|null>(null);
 const badgeHoldUntil=useRef(0);
 const history=useRef<View[]>([]),drag=useRef<Drag|null>(null),rightTimer=useRef<ReturnType<typeof setTimeout>|null>(null),lastRight=useRef(0);
 const ref=useRef<SVGSVGElement>(null);
 const [size,setSize]=useState({w:900,h:565,text:16});
 const scale=size.text/16;
 const bottomSpace=52*scale;
 const W=size.w,H=size.h,R=W-16*scale,T=20*scale,B=T+Math.max(45,(H-bottomSpace-52*scale)*.78),RT=B+12*scale,RB=H-bottomSpace;
 useEffect(()=>{const node=ref.current;if(!node)return;const observer=new ResizeObserver(([entry])=>{const {width,height}=entry.contentRect;if(width>0&&height>0)setSize({w:width,h:height,text:Number.parseFloat(window.getComputedStyle(node).fontSize)||16});});observer.observe(node);return()=>observer.disconnect();},[]);
 useEffect(()=>{setView({x:[xs[0],xs[xs.length-1]],y:null,residual:null});history.current=[];},[xs]);
 useEffect(()=>()=>{if(rightTimer.current)clearTimeout(rightTimer.current);},[]);
 // Screen outlines and optional fills use the same geometry as figure export.
 const siteCurves=useMemo(()=>evaluation&&showSites?siteDisplayCurves(project,evaluation).curves:[],[evaluation,showSites,project.mode,project.background,ys]);
 const visible=useMemo(()=>xs.map((x,i)=>x>=view.x[0]&&x<=view.x[1]?i:-1).filter(i=>i>=0),[xs,view.x]);
 const allY:Range=extent(ys,[0,1]);
 const rangeValues=visible.map(i=>ys[i]);
 if(evaluation){for(const i of visible)rangeValues.push(evaluation.y[i],evaluation.background[i]);for(const curve of siteCurves)for(const i of visible)rangeValues.push(curve[i]);}
 const [a,b]=extent(rangeValues,allY);
 const pad=Math.max((b-a)*.12,Math.abs(b)*1e-5,1e-5),yrange:Range=view.y??[a-pad,b+pad];
 let rm=1e-6;for(const i of visible)rm=Math.max(rm,Math.abs(evaluation?.residual[i]??1));rm*=1.15;
 const rrange:Range=view.residual??[-rm,rm];
 const yt=niceTicks(yrange[0],yrange[1],Math.max(B-T >= 140*scale ? 4 : 2,Math.min(7,Math.floor((B-T)/(35*scale)))));
 const rt=niceTicks(rrange[0],rrange[1],Math.max(3,Math.min(5,Math.floor((RB-RT)/(28*scale)))));
 const residualTicks=RB-RT<40*scale?rt.values.filter(t=>Math.abs(t)<1e-12):rt.values;
 const labelWidth=Math.max(0,...yt.values.map(v=>formatTick(v,yt.step).length),...rt.values.map(v=>formatTick(v,rt.step).length))*7.5*scale;
 const L=Math.max(78*scale,Math.min(150*scale,labelWidth+42*scale));
 const xt=niceTicks(view.x[0],view.x[1],Math.max(2,Math.min(8,Math.floor((R-L)/(90*scale)))));
 useEffect(()=>{if(picking)setView(v=>({...v,y:yrange}));},[!!picking]);
 const px=(v:number)=>L+(v-view.x[0])/(view.x[1]-view.x[0])*(R-L);
 const py=(v:number)=>B-(v-yrange[0])/(yrange[1]-yrange[0])*(B-T);
 const pr=(v:number)=>RB-(v-rrange[0])/(rrange[1]-rrange[0])*(RB-RT);
 const vx=(v:number,vw=view)=>vw.x[0]+(v-L)/(R-L)*(vw.x[1]-vw.x[0]);
 const vy=(v:number,range:Range,region:'main'|'residual')=>range[1]-(v-(region==='main'?T:RT))/(region==='main'?B-T:RB-RT)*(range[1]-range[0]);
 const path=(y:number[],residual=false)=>visible.map((i,k)=>`${k?'L':'M'}${px(xs[i]).toFixed(2)},${(residual?pr(y[i]):py(y[i])).toFixed(2)}`).join('');
 const area=(curve:number[])=>evaluation&&visible.length>1?`${path(curve)}${[...visible].reverse().map(i=>`L${px(xs[i]).toFixed(2)},${py(evaluation.background[i]).toFixed(2)}`).join('')}Z`:'';
 const filledSites=useMemo(()=>fillSites?siteCurves.map((curve,index)=>({curve,index,depth:curve.reduce((depth,value,i)=>Math.max(depth,(evaluation?.background[i]??0)-value),0)})).sort((a,b)=>b.depth-a.depth||a.index-b.index).map(({curve,index})=>({index,path:area(curve)})):[],[fillSites,siteCurves,evaluation?.background,visible,L,R,T,B,view.x,yrange[0],yrange[1]]);
 const point=(e:{currentTarget:SVGSVGElement;clientX:number;clientY:number}):Point=>{const s=e.currentTarget.createSVGPoint();s.x=e.clientX;s.y=e.clientY;const matrix=e.currentTarget.getScreenCTM();const p=matrix?s.matrixTransform(matrix.inverse()):s;return{x:p.x,y:p.y};};
 const region=(p:Point)=>p.x>=L&&p.x<=R?(p.y>=T&&p.y<=B?'main':p.y>=RT&&p.y<=RB?'residual':null):null;
 const clamp=(p:Point,r:'main'|'residual'):Point=>({x:Math.max(L,Math.min(R,p.x)),y:Math.max(r==='main'?T:RT,Math.min(r==='main'?B:RB,p.y))});
 const reset=()=>{history.current=[];setView({x:full,y:null,residual:null});};
 const unzoom=()=>setView(history.current.pop()??{x:full,y:null,residual:null});
 const zoom=(factor:number,p?:Point)=>{const anchor=p?(p.x-L)/(R-L):.5;const center=view.x[0]+anchor*(view.x[1]-view.x[0]);const span=Math.max((full[1]-full[0])/1000,(view.x[1]-view.x[0])*factor);history.current.push(view);setView({...view,x:[center-anchor*span,center+(1-anchor)*span],...(p?{y:yrange,residual:rrange}:{})});};
 // A native non-passive listener keeps wheel zoom from scrolling the page.
 useEffect(()=>{const node=ref.current;if(!node)return;const wheel=(e:WheelEvent)=>{const p=point({currentTarget:node,clientX:e.clientX,clientY:e.clientY});if(!region(p)||e.deltaY===0)return;e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?H:1);zoom(Math.exp(Math.max(-100,Math.min(100,delta))*.0015),p);};node.addEventListener('wheel',wheel,{passive:false});return()=>node.removeEventListener('wheel',wheel);});
 const down=(e:RPointerEvent<SVGSVGElement>)=>{const p=point(e),r=region(p)??(e.button===0?(p.y<(B+RT)/2?'main':'residual'):null);if(!r||![0,2].includes(e.button))return;e.preventDefault();

  // Left drags can start on the axes or margins; zoom bounds stay inside the nearest plot.
  drag.current={button:e.button===0&&!picking&&(e.ctrlKey||e.metaKey||e.pointerType==='touch')?2:e.button,origin:p,start:e.button===0?clamp(p,r):p,last:p,view,yrange:r==='main'?yrange:rrange,region:r,moved:false};e.currentTarget.setPointerCapture(e.pointerId);
 };
 const move=(e:RPointerEvent<SVGSVGElement>)=>{const p=point(e),r=region(p);setCursor(r?{x:vx(p.x),y:vy(p.y,r==='main'?yrange:rrange,r),region:r}:null);
  const d=drag.current;if(picking&&!d&&r==='main')onHover({x:vx(p.x),y:vy(p.y,yrange,'main')});if(!d)return;d.last=p;if(Math.hypot(p.x-d.origin.x,p.y-d.origin.y)>4)d.moved=true;if(!d.moved)return;
  if(d.button===0){setSelection({a:d.start,b:clamp(p,d.region),region:d.region});}
  else{const dx=(d.start.x-p.x)/(R-L)*(d.view.x[1]-d.view.x[0]),dy=(p.y-d.start.y)/(d.region==='main'?B-T:RB-RT)*(d.yrange[1]-d.yrange[0]);const next:View={...d.view,x:[d.view.x[0]+dx,d.view.x[1]+dx]};next[d.region==='main'?'y':'residual']=[d.yrange[0]+dy,d.yrange[1]+dy];setView(next);}
 };
 const up=(e:RPointerEvent<SVGSVGElement>)=>{const d=drag.current;if(!d)return;drag.current=null;setSelection(null);const p=point(e);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  if(d.button===0){if(!d.moved){if(picking&&region(d.origin)==='main'&&region(p)==='main')onPick({x:vx(p.x),y:vy(p.y,yrange,'main')});return;}const end=clamp(p,d.region);if(Math.abs(end.x-d.start.x)<4||Math.abs(end.y-d.start.y)<4)return;
   history.current.push(d.view);const next:View={...d.view,x:[vx(Math.min(d.start.x,end.x),d.view),vx(Math.max(d.start.x,end.x),d.view)]};const yy:Range=[vy(Math.max(d.start.y,end.y),d.yrange,d.region),vy(Math.min(d.start.y,end.y),d.yrange,d.region)];next[d.region==='main'?'y':'residual']=yy;setView(next);
  }else if(!d.moved){if(e.button===0)return;const now=performance.now();if(lastRight.current>0&&now-lastRight.current<350){if(rightTimer.current)clearTimeout(rightTimer.current);rightTimer.current=null;lastRight.current=0;reset();}else{lastRight.current=now;rightTimer.current=setTimeout(()=>{unzoom();rightTimer.current=null;},280);}}
 };
 const pickGuide=picking?.cursor??(cursor?.region==='main'?cursor:null);
 const cursorVelocity=cursor?cursor.x.toFixed(3):'—',cursorValue=cursor?cursor.y.toLocaleString('en-US',{maximumSignificantDigits:6}):'—';
 const cursorLabel=cursor?.region==='residual'?'Residual':'Counts';
 const badgeWidth=Math.max(0,Math.min(140*scale,R-L-16*scale)),badgeHeight=44*scale;
 const leftBadge=L+8*scale,rightBadge=R-8*scale-badgeWidth;
 const lowerBadge=Math.max(T+4*scale,B-52*scale);
 const collisions=(box:{x:number;y:number})=>{let score=0;for(const i of visible){const x=px(xs[i]);if(x<box.x-3*scale||x>box.x+badgeWidth+3*scale)continue;for(const value of [ys[i],evaluation?.y[i]]){if(value===undefined)continue;const y=py(value);if(y>box.y-3*scale&&y<box.y+badgeHeight+3*scale)score++;}}return score;};
 const clearSide=useMemo(()=>collisions({x:leftBadge,y:lowerBadge})<collisions({x:rightBadge,y:lowerBadge})?'left':'right',[visible,ys,evaluation?.y,view.x,yrange[0],yrange[1],L,R,B,scale,badgeWidth]);
 const readoutSide=badgeSide??clearSide;
 const badgeLeft=readoutSide==='left'?leftBadge:rightBadge,badgeY=lowerBadge,badgeTextX=badgeLeft+badgeWidth-8*scale;
 const pointerOverBadge=!!cursor&&px(cursor.x)>badgeLeft-12*scale&&px(cursor.x)<badgeLeft+badgeWidth+12*scale&&(cursor.region==='main'?py(cursor.y):pr(cursor.y))>badgeY-12*scale&&(cursor.region==='main'?py(cursor.y):pr(cursor.y))<badgeY+badgeHeight+12*scale;
 const oppositeLeft=readoutSide==='left'?rightBadge:leftBadge;
 const pointerOverOpposite=!!cursor&&px(cursor.x)>oppositeLeft-12*scale&&px(cursor.x)<oppositeLeft+badgeWidth+12*scale&&(cursor.region==='main'?py(cursor.y):pr(cursor.y))>badgeY-12*scale&&(cursor.region==='main'?py(cursor.y):pr(cursor.y))<badgeY+badgeHeight+12*scale;
 const readoutActive=!!cursor&&!picking;
 // Keep the readout in one corner while inspecting a trace. Only sustained
 // pointer overlap moves it; crossing the middle of the plot never does.
 useEffect(()=>{
  if(!readoutActive){setBadgeSide(null);badgeHoldUntil.current=0;return;}
  if(badgeSide===null){setBadgeSide(clearSide);return;}
  if(!pointerOverBadge||pointerOverOpposite||Math.abs(rightBadge-leftBadge)<24*scale)return;
  const timer=window.setTimeout(()=>{setBadgeSide(side=>side==='left'?'right':'left');badgeHoldUntil.current=Date.now()+1200;},Math.max(600,badgeHoldUntil.current-Date.now()+600));
  return()=>window.clearTimeout(timer);
 },[readoutActive,badgeSide,clearSide,pointerOverBadge,pointerOverOpposite,leftBadge,rightBadge,scale]);

 const sampled=visible.filter((_,k)=>k%Math.max(1,Math.ceil(visible.length/4000))===0);

 return <div className={`plot-shell ${picking?'picking':''}`}>
  <div className="plot-toolbar"><div className="plot-legend"><span><i className="dot"/>Data</span><span title="Total evaluated spectrum, including all sites and background"><i className="line model"/>Total model</span><label title={project.mode === 'transmission' ? 'Absorber profiles scaled together for display; not additive transmission components' : 'Show dashed individual site curves; the total model stays solid'}><input type="checkbox" checked={showSites} onChange={e=>setShowSites(e.target.checked)}/><i className="line site"/>Sites</label><label className="fill-sites-control" title={showSites ? (project.mode==='transmission' ? 'Fill display-scaled absorber profiles; these are not additive transmission components' : 'Fill each site to the evaluated background') : 'Show Sites to enable filled areas'}><input type="checkbox" aria-label="Fill sites" checked={fillSites} disabled={!showSites||!evaluation||!project.sites.length} onChange={e=>setFillSites(e.target.checked)}/>Fill sites</label></div><div className="plot-tools">{picking&&<button aria-label="Cancel site definition" onClick={onCancelPick}>Cancel</button>}<button aria-label="Zoom in" title="Zoom in" onClick={()=>zoom(.65)}>＋</button><button aria-label="Zoom out" title="Zoom out" onClick={()=>zoom(1.5)}>−</button><button onClick={unzoom}>Unzoom</button><button onClick={reset}>Reset view</button></div></div>
  <div className="plot-canvas">
  <svg ref={ref} id={id} data-view-x={view.x.join(',')} data-view-y={yrange.join(',')} data-view-residual={rrange.join(',')} viewBox={`0 0 ${W} ${H}`} role="img" tabIndex={0} aria-label="Mössbauer spectrum with observed points, total model, and residuals" aria-description="Left-drag zooms; Ctrl/Command-left-drag or right-drag pans. Touch drag pans. Focus graph: +/−, arrows, 0/Home, Backspace." onContextMenu={e=>e.preventDefault()} onKeyDown={e=>{if(e.altKey||e.ctrlKey||e.metaKey)return;if(['+','=','-','0','Home','Backspace','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();if(e.key==='+'||e.key==='=')zoom(.65);else if(e.key==='-')zoom(1.5);else if(e.key==='0'||e.key==='Home')reset();else if(e.key==='Backspace')unzoom();else{history.current.push(view);if(e.key==='ArrowLeft'||e.key==='ArrowRight'){const delta=(view.x[1]-view.x[0])*.1*(e.key==='ArrowRight'?1:-1);setView({...view,x:[view.x[0]+delta,view.x[1]+delta]});}else{const delta=(yrange[1]-yrange[0])*.1*(e.key==='ArrowUp'?1:-1);setView({...view,y:[yrange[0]+delta,yrange[1]+delta]});}}}if(e.key==='Escape'){if(picking)onCancelPick();else{drag.current=null;setSelection(null);}}}} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{drag.current=null;setSelection(null);}} onPointerLeave={()=>setCursor(null)}>
   <defs><clipPath id={`${clipPrefix}spectrum-clip`}><rect x={L} y={T} width={R-L} height={B-T}/></clipPath><clipPath id={`${clipPrefix}residual-clip`}><rect x={L} y={RT} width={R-L} height={RB-RT}/></clipPath></defs><rect className="plot-background" width={W} height={H} fill="white"/>
   {yt.values.map((t,i)=><g key={i}><line x1={L} x2={R} y1={py(t)} y2={py(t)} className="grid"/><text x={L-12} y={py(t)+4} textAnchor="end" className="tick">{formatTick(t,yt.step)}</text></g>)}
   {xt.values.map((t,i)=><g key={i}><line x1={px(t)} x2={px(t)} y1={T} y2={B} className="grid"/><line x1={px(t)} x2={px(t)} y1={RT} y2={RB} className="grid"/><text x={px(t)} y={RB+24*scale} textAnchor="middle" className="tick">{formatTick(t,xt.step)}</text></g>)}
   <g clipPath={`url(#${clipPrefix}spectrum-clip)`}>
    {filledSites.map(({path:filledPath,index})=><path className="site-fill" data-site-index={index} key={`fill-${index}`} d={filledPath} fill={siteColor(project.sites[index],index)} stroke="none" pointerEvents="none"/>)}
    {siteCurves.map((c,k)=>k===highlightedSite?null:<path className="site-component-curve" data-site-index={k} key={k} d={path(c)} fill="none" stroke={siteColor(project.sites[k],k)} strokeWidth="1.7" strokeDasharray="7 3" opacity=".8"/>)}
    {evaluation&&<path className="background-curve" d={path(evaluation.background)} fill="none" stroke="#a6afb6" strokeDasharray="5 4" strokeWidth="1.2"/>}
    {highlightedSite!==null&&siteCurves[highlightedSite]&&<g className="highlighted-site-curve" data-site-index={highlightedSite}>
      <path d={path(siteCurves[highlightedSite])} fill="none" className="highlighted-site-halo" stroke="white" strokeWidth="4.6" strokeDasharray="7 3" opacity=".75"/>
      <path className="site-component-curve" d={path(siteCurves[highlightedSite])} fill="none" stroke={siteColor(project.sites[highlightedSite],highlightedSite)} strokeWidth="2.4" strokeDasharray="7 3"/>
    </g>}
    <g className="observed-data">{sampled.map(i=><circle className="observed-point" key={i} cx={px(xs[i])} cy={py(ys[i])} r={1.5*Math.sqrt(scale)} fill="#536d83" opacity=".75"/>)}</g>
    {evaluation&&<path d={path(evaluation.y)} fill="none" className="total-model-curve" stroke="#9b410b" strokeWidth="2.6"/>}
   </g>
   <line x1={L} x2={R} y1={B} y2={B} className="axis"/><line x1={L} x2={L} y1={T} y2={B} className="axis"/><text transform={B-T<150*scale?undefined:`translate(14 ${(T+B)/2}) rotate(-90)`} x={B-T<150*scale?L:undefined} y={B-T<150*scale?T-8:undefined} textAnchor={B-T<150*scale?'start':'middle'} className="axis-label">Counts / intensity</text><line x1={L} x2={R} y1={pr(0)} y2={pr(0)} stroke="#aeb7bd" strokeDasharray="4 4"/><g clipPath={`url(#${clipPrefix}residual-clip)`}>{evaluation&&sampled.map(i=><circle className="residual-point" key={i} cx={px(xs[i])} cy={pr(evaluation.residual[i])} r={1.7*Math.sqrt(scale)} fill="#647c8b" opacity=".8"/>)}</g>{residualTicks.map((t,i)=><g key={i}><line x1={L} x2={R} y1={pr(t)} y2={pr(t)} className="grid"/><text x={L-12} y={pr(t)+4} textAnchor="end" className="tick">{formatTick(t,rt.step)}</text></g>)}<line x1={L} x2={R} y1={RB} y2={RB} className="axis"/><text transform={`translate(14 ${(RT+RB)/2}) rotate(-90)`} textAnchor="middle" className="section-label residual-axis-label">Residual</text><text x={(L+R)/2} y={H-7*scale} textAnchor="middle" className="axis-label velocity-axis-label">Velocity (mm/s)</text>
   {cursor&&!picking&&<line pointerEvents="none" x1={px(cursor.x)} x2={px(cursor.x)} y1={T} y2={RB} stroke="#b2bec5" strokeDasharray="3 4"/>}
   {picking&&pickGuide&&<g clipPath={`url(#${clipPrefix}spectrum-clip)`} pointerEvents="none"><line x1={px(pickGuide.x)} x2={px(pickGuide.x)} y1={T} y2={B} stroke="#278b84" strokeDasharray="5 4"/><line x1={L} x2={R} y1={py(pickGuide.y)} y2={py(pickGuide.y)} stroke="#278b84" strokeDasharray="5 4"/>{picking.first&&<circle cx={px(picking.first.x)} cy={py(picking.first.y)} r="4" fill="#278b84"/>}{picking.stage===1&&picking.first&&<line x1={px(2*picking.first.x-pickGuide.x)} x2={px(pickGuide.x)} y1={py(picking.first.y)} y2={py(picking.first.y)} stroke="#278b84" strokeWidth="2"/>}</g>}
   {selection&&<rect data-testid="zoom-rectangle" x={Math.min(selection.a.x,selection.b.x)} y={Math.min(selection.a.y,selection.b.y)} width={Math.abs(selection.b.x-selection.a.x)} height={Math.abs(selection.b.y-selection.a.y)} fill="#2d8d8522" stroke="#2d8d85" strokeDasharray="4 2" pointerEvents="none"/>}
   <g className="plot-coordinate-badge" visibility={cursor&&!picking?'visible':'hidden'} aria-hidden={!cursor||!!picking} pointerEvents="none">
    <rect x={badgeLeft} y={badgeY} width={badgeWidth} height={badgeHeight} rx={4*scale}/>
    <text className="plot-coordinates plot-coordinate-labels" x={badgeLeft+8*scale} y={badgeY+17*scale} textAnchor="start"><tspan x={badgeLeft+8*scale}>v (mm/s)</tspan><tspan x={badgeLeft+8*scale} y={badgeY+35*scale}>{cursor?.region==='residual'?'Residual':'Counts'}</tspan></text>
    <text className="plot-coordinates plot-coordinate-values" x={badgeTextX} y={badgeY+17*scale} textAnchor="end" aria-label="Mouse coordinates"><tspan className="cursor-velocity" x={badgeTextX}>{cursorVelocity}</tspan><tspan x={badgeTextX} y={badgeY+35*scale} className={cursor?.region==='residual'?'cursor-residual':'cursor-counts'}>{cursorValue}</tspan></text>
   </g>
  </svg>
  {picking&&<div className="picking-tooltip" style={{ bottom: H-B+8 }} role="status" aria-live="polite"><strong>{picking.stage+1}/{picking.kind==='Singlet'?2:3}</strong><span>{picking.stage===0?'Click the first line':picking.stage===1?'Click to set half-width':picking.kind==='Doublet'?'Click the other line':'Click the opposite outer line'}</span><kbd>Esc</kbd></div>}
  </div>

 </div>;
}
