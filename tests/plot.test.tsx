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
async function mount(picking:any=null, selectedSite=0, withEvaluation=false, mode='thin'){const root=createRoot(container);let picked:any[]=[],canceled=0;const project=demo();project.mode=mode as any;const evaluation=withEvaluation?{parameters:{},y:project.spectrum.y,background:project.spectrum.y.map(()=>100000),components:project.sites.map(()=>project.spectrum.y.map(()=>5)),residual:project.spectrum.y.map((_,i)=>Math.sin(i)),sse:0,objective:0}:null;await act(async()=>root.render(<Plot project={project} evaluation={evaluation} selectedSite={selectedSite} fitted={false} picking={picking} onPick={p=>picked.push(p)} onHover={()=>{}} onCancelPick={()=>canceled++}/>));const svg=container.querySelector('svg')!;
 const event=async(type:string,x:number,y:number,button=0)=>act(async()=>{const e=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button});Object.defineProperty(e,'pointerId',{value:1});svg.dispatchEvent(e);});
 const range=()=>svg.getAttribute('data-view-x')!.split(',').map(Number);
 const drag=async(a:number[],b:number[],button=0)=>{await event('pointerdown',a[0],a[1],button);await event('pointermove',b[0],b[1],button);await event('pointerup',b[0],b[1],button);};
 return{svg,event,range,drag,picked,canceled:()=>canceled,close:async()=>act(async()=>root.unmount())};}
test('left rectangle zooms both axes; right drag pans; right click restores the previous zoom',async()=>{const t=await mount();try{
 assert.deepEqual(t.range(),[-10,10]);await t.drag([200,80],[650,300]);const zoomed=t.range();assert.ok(zoomed[1]-zoomed[0]<20);
 const yy=t.svg.getAttribute('data-view-y');await t.drag([400,180],[450,210],2);const pan=t.range();assert.ok(pan[0]<zoomed[0]);assert.ok(Math.abs((pan[1]-pan[0])-(zoomed[1]-zoomed[0]))<1e-10);assert.notEqual(t.svg.getAttribute('data-view-y'),yy);
 await t.event('pointerdown',400,180,2);await t.event('pointerup',400,180,2);await act(()=>new Promise(r=>setTimeout(r,310)));assert.deepEqual(t.range(),[-10,10]);
}finally{await t.close();}});
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
test('residuals are points and the selected site is thicker and painted last',async()=>{const t=await mount(null,1,true);try{
 assert.equal(t.svg.querySelector('.total-model-curve')?.getAttribute('stroke'),'#171c20');assert.equal(t.svg.querySelectorAll('.residual-point').length,512);assert.equal(t.svg.querySelectorAll('g[clip-path="url(#residual-clip)"] path').length,0);
 const active=t.svg.querySelector('.selected-site-curve')!;assert.equal(active.getAttribute('data-site-index'),'1');assert.equal(active.nextElementSibling,null);
 assert.ok(Number(active.lastElementChild!.getAttribute('stroke-width'))>Number(t.svg.querySelector('path[data-site-index="0"]')!.getAttribute('stroke-width')));
}finally{await t.close();}});
test('full-transmission mode also offers selected absorber overlays',async()=>{const t=await mount(null,0,true,'transmission');try{assert.ok(t.svg.querySelector('.selected-site-curve'));assert.equal(container.querySelector('label')?.getAttribute('title')?.includes('not additive'),true);}finally{await t.close();}});
