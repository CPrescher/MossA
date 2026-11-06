import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {ResultsPane,MIN_RESULTS_HEIGHT} from '../src/ResultsPane';
test('results pane provides a three-row minimum and responds to dragging and keyboard resizing',async()=>{
 const dom=new JSDOM('<div id="root"></div>');
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const container=document.getElementById('root')!,root=createRoot(container);
 await act(async()=>root.render(<ResultsPane><div>Site table</div></ResultsPane>));
 const splitter=container.querySelector('[role="separator"]') as HTMLElement,pane=container.querySelector('section') as HTMLElement;
 const proto=dom.window.HTMLElement.prototype as any;proto.setPointerCapture=()=>{};proto.releasePointerCapture=()=>{};proto.hasPointerCapture=()=>true;
 const pointer=async(type:string,y:number)=>act(async()=>{const e=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,clientY:y,button:0});Object.defineProperty(e,'pointerId',{value:1});splitter.dispatchEvent(e);});
 try {
  const initial=parseFloat(pane.style.height);assert.ok(initial>=MIN_RESULTS_HEIGHT);
  await pointer('pointerdown',400);await pointer('pointermove',300);await pointer('pointerup',300);assert.equal(parseFloat(pane.style.height),initial+100);
  await act(async()=>{splitter.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));});assert.equal(parseFloat(pane.style.height),MIN_RESULTS_HEIGHT);
  await pointer('pointerdown',300);await pointer('pointermove',1000);await pointer('pointerup',1000);assert.equal(parseFloat(pane.style.height),MIN_RESULTS_HEIGHT);
  await act(async()=>{splitter.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));});assert.equal(parseFloat(pane.style.height),MIN_RESULTS_HEIGHT+24);
 } finally {await act(async()=>root.unmount());}
});
