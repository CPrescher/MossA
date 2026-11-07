// DOM event tests run in jsdom; no external browser automation is used.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Plot } from '../src/Plot';
import { demo } from '../src/demo';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,SVGElement:dom.window.SVGElement,IS_REACT_ACT_ENVIRONMENT:true});
class Resize { callback:any; constructor(cb:any){this.callback=cb;} observe(){this.callback([{contentRect:{width:900,height:565}}]);} disconnect(){} }
Object.assign(globalThis,{ResizeObserver:Resize});
const proto=dom.window.SVGElement.prototype as any;
proto.createSVGPoint=()=>({x:0,y:0,matrixTransform(){return{x:this.x,y:this.y};}});
proto.getScreenCTM=()=>({inverse:()=>({})});proto.setPointerCapture=()=>{};proto.releasePointerCapture=()=>{};proto.hasPointerCapture=()=>true;
const container=document.getElementById('root')!;
async function mount(picking:any=null, highlightedSite:number|null=null, withEvaluation=false, mode='thin', configure?:(project:any,evaluation:any)=>void){const root=createRoot(container);let picked:any[]=[],canceled=0;const project=demo();project.mode=mode as any;const evaluation=withEvaluation?{parameters:{},y:project.spectrum.y,background:project.spectrum.y.map(()=>100000),components:project.sites.map(()=>project.spectrum.y.map(()=>5)),residual:project.spectrum.y.map((_,i)=>Math.sin(i)),sse:0,objective:0}:null;configure?.(project,evaluation);const highlight=async(index:number|null)=>act(async()=>root.render(<Plot project={project} evaluation={evaluation} highlightedSite={index} fitted={false} picking={picking} onPick={p=>picked.push(p)} onHover={()=>{}} onCancelPick={()=>canceled++}/>));await highlight(highlightedSite);const svg=container.querySelector('svg')!;
 const event=async(type:string,x:number,y:number,button=0)=>act(async()=>{const e=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button});Object.defineProperty(e,'pointerId',{value:1});svg.dispatchEvent(e);});
 const range=()=>svg.getAttribute('data-view-x')!.split(',').map(Number);
 const drag=async(a:number[],b:number[],button=0)=>{await event('pointerdown',a[0],a[1],button);await event('pointermove',b[0],b[1],button);await event('pointerup',b[0],b[1],button);};
 return{svg,event,range,drag,picked,highlight,canceled:()=>canceled,close:async()=>act(async()=>root.unmount())};}
test('left rectangle zooms both axes; right drag pans; right click restores the previous zoom',async()=>{const t=await mount();try{
 const originalY=t.svg.getAttribute('data-view-y');assert.deepEqual(t.range(),[-10,10]);await t.drag([200,80],[650,300]);const zoomed=t.range();assert.ok(zoomed[1]-zoomed[0]<20);assert.notEqual(t.svg.getAttribute('data-view-y'),originalY);
 const yy=t.svg.getAttribute('data-view-y');await t.drag([400,180],[450,210],2);const pan=t.range();assert.ok(pan[0]<zoomed[0]);assert.ok(Math.abs((pan[1]-pan[0])-(zoomed[1]-zoomed[0]))<1e-10);assert.notEqual(t.svg.getAttribute('data-view-y'),yy);
 await t.event('pointerdown',400,180,2);await t.event('pointerup',400,180,2);await act(()=>new Promise(r=>setTimeout(r,310)));assert.deepEqual(t.range(),[-10,10]);
}finally{await t.close();}});
test('mouse coordinates sit at the far left on the velocity label baseline and follow the current view',async()=>{
 const t=await mount();try{
  const readout=container.querySelector('.plot-coordinates')!;
  assert.equal(readout.parentElement,t.svg);
  assert.equal(readout.getAttribute('x'),'0');
  assert.equal(readout.getAttribute('y'),t.svg.querySelector('.velocity-axis-label')!.getAttribute('y'));
  assert.equal(t.svg.querySelector('.section-label'),null);
  assert.equal(container.querySelector('.cursor-velocity')!.textContent,'—');
  const check=async(x:number,y:number)=>{
   await t.event('pointermove',x,y);
   const clip=t.svg.querySelector('#spectrum-clip rect')!;
   const left=Number(clip.getAttribute('x')),top=Number(clip.getAttribute('y'));
   const width=Number(clip.getAttribute('width')),height=Number(clip.getAttribute('height'));
   const [lo,hi]=t.svg.getAttribute('data-view-y')!.split(',').map(Number);
   const vx=t.range()[0]+(x-left)/width*(t.range()[1]-t.range()[0]);
   const counts=hi-(y-top)/height*(hi-lo);
   assert.equal(readout.querySelector('.cursor-velocity')!.textContent,vx.toFixed(3));
   assert.equal(readout.querySelector('.cursor-counts')!.textContent,counts.toLocaleString('en-US',{maximumSignificantDigits:6}));
   assert.equal(t.svg.querySelector('.cursor-label'),null);
  };
  await check(400,180);await t.drag([200,80],[650,300]);await check(550,250);
  await t.event('pointermove',10,10);assert.equal(readout.querySelector('.cursor-counts')!.textContent,'—');
 }finally{await t.close();}
});
test('residual hover shows velocity and signed residual coordinates, including after zoom',async()=>{
 const t=await mount(null,null,true);try{
  const readout=container.querySelector('.plot-coordinates')!;
  const check=async(fraction:number)=>{
   const clip=t.svg.querySelector('#residual-clip rect')!;
   const left=Number(clip.getAttribute('x')),top=Number(clip.getAttribute('y'));
   const width=Number(clip.getAttribute('width')),height=Number(clip.getAttribute('height'));
   const [lo,hi]=t.svg.getAttribute('data-view-residual')!.split(',').map(Number);
   await t.event('pointermove',left+width*.3,top+height*fraction);
   assert.equal(readout.querySelector('.cursor-velocity')!.textContent,(t.range()[0]+.3*(t.range()[1]-t.range()[0])).toFixed(3));
   assert.equal(readout.querySelector('.cursor-residual')!.textContent,(hi-fraction*(hi-lo)).toLocaleString('en-US',{maximumSignificantDigits:6}));
   assert.ok(readout.textContent!.includes('Residual:'));
   assert.equal(readout.querySelector('.cursor-counts'),null);
  };
  await check(.25);await check(.75);
  await t.drag([200,405],[650,480]);await check(.25);await check(.75);
  await t.event('pointermove',400,180);assert.ok(readout.querySelector('.cursor-counts'));assert.equal(readout.querySelector('.cursor-residual'),null);
  const residualTop=Number(t.svg.querySelector('#residual-clip rect')!.getAttribute('y'));
  await t.event('pointermove',400,residualTop-6);assert.equal(readout.querySelector('.cursor-velocity')!.textContent,'—');
 }finally{await t.close();}
});
test('left zoom can start in the surrounding margins and clamps to the nearest plot',async()=>{
 for(const plot of ['spectrum','residual']){
  for(const edge of ['top-left','bottom-right','left','right','top','bottom']){
   const t=await mount();try{
    const clip=t.svg.querySelector(`#${plot}-clip rect`)!;
    const left=Number(clip.getAttribute('x')),top=Number(clip.getAttribute('y'));
    const width=Number(clip.getAttribute('width')),height=Number(clip.getAttribute('height'));
    const right=left+width,bottom=top+height;
    const start=edge==='top-left'?[left-20,top-5]:edge==='bottom-right'?[right+10,bottom+5]:edge==='left'?[left-20,top+10]:edge==='right'?[right+10,top+10]:edge==='top'?[left+20,top-5]:[left+20,bottom+5];
    const end=[left+width*.6,top+height*.6];
    const mainY=t.svg.getAttribute('data-view-y'),residualY=t.svg.getAttribute('data-view-residual');
    await t.event('pointerdown',...start as [number,number]);await t.event('pointermove',...end as [number,number]);
    const rect=t.svg.querySelector('[data-testid="zoom-rectangle"]')!;assert.ok(rect,`${plot} ${edge}`);
    const x=Number(rect.getAttribute('x')),y=Number(rect.getAttribute('y'));
    assert.ok(x>=left&&x+Number(rect.getAttribute('width'))<=right);
    assert.ok(y>=top&&y+Number(rect.getAttribute('height'))<=bottom);
    await t.event('pointerup',...end as [number,number]);
    const range=t.range();assert.ok(range[1]-range[0]<20,`${plot} ${edge} zooms`);
    assert.ok(range[0]>=-10&&range[1]<=10);
    const original=(plot==='spectrum'?mainY:residualY)!.split(',').map(Number);
    const startY=Math.max(top,Math.min(bottom,start[1]));
    const expected=[Math.max(startY,end[1]),Math.min(startY,end[1])].map(y=>original[1]-(y-top)/height*(original[1]-original[0]));
    const actual=t.svg.getAttribute(plot==='spectrum'?'data-view-y':'data-view-residual')!.split(',').map(Number);
    actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-8,`${plot} ${edge} uses the correct vertical range`));
   }finally{await t.close();}
  }
 }
});
test('margin clicks do not place sites, and margin drags remain zoom gestures during picking',async()=>{
 const t=await mount({stage:0,kind:'Doublet'});try{
  await t.event('pointerdown',40,100);await t.event('pointerup',40,100);
  await t.event('pointerdown',40,100);await t.event('pointerup',200,150);
  assert.equal(t.picked.length,0);
  await t.drag([40,10],[650,300]);assert.ok(t.range()[1]-t.range()[0]<20);assert.equal(t.picked.length,0);
 }finally{await t.close();}
});
test('wheel zoom keeps both vertical ranges fixed and the pointer anchored in either plot',async()=>{
 for(const y of [180,440]){
  const t=await mount(null,null,true,'transmission',(project,evaluation)=>{
   liftedTransmission(project,evaluation);evaluation.residual=project.spectrum.x.map((x:number)=>x+12);
  });
  try{
   const mainY=t.svg.getAttribute('data-view-y'),residualY=t.svg.getAttribute('data-view-residual');
   const clip=t.svg.querySelector('#spectrum-clip rect')!;
   const fraction=(700-Number(clip.getAttribute('x')))/Number(clip.getAttribute('width'));
   const anchor=(range:number[])=>range[0]+fraction*(range[1]-range[0]);
   const originalAnchor=anchor(t.range());
   for(const deltaY of [-100,-100,-100,-100,100]){
    const before=t.range();const event=new dom.window.WheelEvent('wheel',{clientX:700,clientY:y,deltaY,bubbles:true,cancelable:true});
    await act(async()=>{t.svg.dispatchEvent(event);});
    assert.equal(event.defaultPrevented,true,'wheel zoom consumes scrolling over the plot');
    const after=t.range();assert.equal(after[1]-after[0]<before[1]-before[0],deltaY<0);
    assert.ok(Math.abs(anchor(after)-originalAnchor)<1e-10,'velocity under the pointer stays in place');
    assert.equal(t.svg.getAttribute('data-view-y'),mainY);
    assert.equal(t.svg.getAttribute('data-view-residual'),residualY);
   }
   for(let i=0;i<5;i++)await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Unzoom')!.click());
   assert.deepEqual(t.range(),[-10,10]);
   await act(async()=>(container.querySelector('.plot-legend input') as HTMLInputElement).click());
   assert.notEqual(t.svg.getAttribute('data-view-y'),mainY,'unzoom restores automatic vertical scaling');
  }finally{await t.close();}
 }
});
test('wheel ignores horizontal-only and out-of-plot scrolling, and handles small trackpad deltas gently',async()=>{
 const t=await mount();
 try{
  const wheel=async(clientX:number,clientY:number,deltaY:number,deltaX=0)=>{
   const event=new dom.window.WheelEvent('wheel',{clientX,clientY,deltaY,deltaX,bubbles:true,cancelable:true});
   await act(async()=>{t.svg.dispatchEvent(event);});return event;
  };
  assert.equal((await wheel(400,180,0,100)).defaultPrevented,false);assert.deepEqual(t.range(),[-10,10]);
  assert.equal((await wheel(10,10,-100)).defaultPrevented,false);assert.deepEqual(t.range(),[-10,10]);
  await wheel(400,180,-1);const span=t.range()[1]-t.range()[0];assert.ok(span<20&&span>19.9);
 }finally{await t.close();}
});
test('double right click resets every zoom level and suppresses the native menu',async()=>{const t=await mount();try{
 await t.drag([160,70],[700,310]);await t.drag([250,100],[600,280]);assert.ok(t.range()[1]-t.range()[0]<12);
 for(let i=0;i<2;i++){await t.event('pointerdown',400,180,2);await t.event('pointerup',400,180,2);}assert.deepEqual(t.range(),[-10,10]);
 const menu=new dom.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true});t.svg.dispatchEvent(menu);assert.equal(menu.defaultPrevented,true);
}finally{await t.close();}});
test('picking accepts clicks while rectangle zoom, pan, wheel, and right-click navigation stay available',async()=>{const t=await mount({stage:0,kind:'Doublet'});try{
 await t.event('pointerdown',350,150);await t.event('pointerup',350,150);assert.equal(t.picked.length,1);assert.deepEqual(t.range(),[-10,10]);
 await t.drag([200,80],[650,300]);assert.ok(t.range()[1]-t.range()[0]<20);assert.equal(t.picked.length,1);
 const before=t.range();await t.drag([400,180],[450,200],2);assert.notEqual(t.range()[0],before[0]);assert.equal(t.canceled(),0);
 await t.event('pointerdown',400,180,2);await t.event('pointerup',400,180,2);await act(()=>new Promise(r=>setTimeout(r,310)));assert.deepEqual(t.range(),[-10,10]);assert.equal(t.canceled(),0);
 await act(async()=>{t.svg.dispatchEvent(new dom.window.WheelEvent('wheel',{clientX:400,clientY:180,deltaY:-100,bubbles:true,cancelable:true}));});assert.ok(t.range()[1]-t.range()[0]<20);
 for(let i=0;i<2;i++){await t.event('pointerdown',400,180,2);await t.event('pointerup',400,180,2);}assert.deepEqual(t.range(),[-10,10]);assert.equal(t.canceled(),0);
 const hint=container.querySelector('.picking-tooltip') as HTMLElement;
 assert.ok(hint.textContent?.includes('Click the first line'));
 const mainClip=container.querySelector('#spectrum-clip rect')!;
 const mainBottom=Number(mainClip.getAttribute('y'))+Number(mainClip.getAttribute('height'));
 assert.ok(565-parseFloat(hint.style.bottom)<mainBottom,'picking hint stays above the spectrum bottom');
 await act(async()=>{t.svg.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});assert.equal(t.canceled(),1);
}finally{await t.close();}});
test('site curves have equal weight except during temporary highlighting; residuals stay points',async()=>{const t=await mount(null,null,true);try{
 assert.equal(t.svg.querySelector('.total-model-curve')?.getAttribute('stroke'),'#171c20');assert.equal(t.svg.querySelectorAll('.residual-point').length,512);assert.equal(t.svg.querySelectorAll('g[clip-path="url(#residual-clip)"] path').length,0);
 const curves=()=>[...t.svg.querySelectorAll('path[data-site-index]')];
 const normal=curves().map(curve=>[curve.getAttribute('data-site-index'),curve.getAttribute('stroke-width'),curve.getAttribute('opacity')]);
 assert.equal(normal.length,demo().sites.length);assert.equal(new Set(normal.map(([,width,opacity])=>`${width}/${opacity}`)).size,1);assert.equal(t.svg.querySelector('.highlighted-site-curve'),null);
 await t.highlight(1);
 const active=t.svg.querySelector('.highlighted-site-curve')!;assert.equal(active.getAttribute('data-site-index'),'1');assert.equal(active.nextElementSibling,null);
 assert.ok(Number(active.lastElementChild!.getAttribute('stroke-width'))>Number(t.svg.querySelector('path[data-site-index="0"]')!.getAttribute('stroke-width')));
 await t.highlight(null);assert.equal(t.svg.querySelector('.highlighted-site-curve'),null);assert.deepEqual(curves().map(curve=>[curve.getAttribute('data-site-index'),curve.getAttribute('stroke-width'),curve.getAttribute('opacity')]),normal);
}finally{await t.close();}});
test('full-transmission mode also offers temporary absorber highlights',async()=>{const t=await mount(null,0,true,'transmission');try{assert.ok(t.svg.querySelector('.highlighted-site-curve'));assert.equal(container.querySelector('label')?.getAttribute('title')?.includes('not additive'),true);}finally{await t.close();}});

function liftedTransmission(project:any,evaluation:any){
 project.background[0].value=140000;
 evaluation.background=project.spectrum.x.map((x:number)=>140000+4000*x);
}
function drawnCurvesFit(svg:SVGSVGElement){
 const clip=svg.querySelector('#spectrum-clip rect')!;
 const top=Number(clip.getAttribute('y')),bottom=top+Number(clip.getAttribute('height'));
 const curves=svg.querySelectorAll('.background-curve,.total-model-curve,path[data-site-index],.highlighted-site-curve path');
 assert.ok(curves.length>=2);
 for(const curve of curves){
  const points=[...curve.getAttribute('d')!.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)];
  assert.ok(points.length>0);
  for(const point of points)assert.ok(Number(point[2])>=top-.01&&Number(point[2])<=bottom+.01,`curve is clipped at y=${point[2]} (visible ${top}…${bottom})`);
 }
}
test('automatic transmission limits include the elevated baseline and displayed site curves; unzoom and reset restore them',async()=>{
 const t=await mount(null,0,true,'transmission',liftedTransmission);
 try{
  const auto=t.svg.getAttribute('data-view-y');
  const [lo,hi]=auto!.split(',').map(Number);
  assert.ok(hi>180000,'the elevated baseline belongs in the automatic range');
  assert.ok(lo<98000,'displayed site dips belong in the automatic range');
  drawnCurvesFit(t.svg);
  await t.drag([200,80],[650,300]);assert.notEqual(t.svg.getAttribute('data-view-y'),auto);
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Unzoom')!.click());
  assert.equal(t.svg.getAttribute('data-view-y'),auto);drawnCurvesFit(t.svg);
  await t.drag([200,80],[650,300]);
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Reset view')!.click());
  assert.equal(t.svg.getAttribute('data-view-y'),auto);drawnCurvesFit(t.svg);
 }finally{await t.close();}
});
test('automatic limits follow site visibility and highlighting, while manual Y zoom remains fixed',async()=>{
 const t=await mount(null,null,true,'transmission',liftedTransmission);
 try{
  const auto=t.svg.getAttribute('data-view-y');
  const toggle=()=>act(async()=>(container.querySelector('.plot-legend input') as HTMLInputElement).click());
  await toggle();const hidden=t.svg.getAttribute('data-view-y');assert.notEqual(hidden,auto);
  assert.equal(t.svg.querySelectorAll('path[data-site-index]').length,0);drawnCurvesFit(t.svg);
  await toggle();assert.equal(t.svg.getAttribute('data-view-y'),auto);
  await t.highlight(1);assert.equal(t.svg.getAttribute('data-view-y'),auto);drawnCurvesFit(t.svg);
  await t.drag([200,80],[650,300]);const manual=t.svg.getAttribute('data-view-y');
  await toggle();assert.equal(t.svg.getAttribute('data-view-y'),manual);
  await toggle();assert.equal(t.svg.getAttribute('data-view-y'),manual);
  await t.highlight(null);assert.equal(t.svg.getAttribute('data-view-y'),manual);
 }finally{await t.close();}
});
