import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ResultsPane,MIN_RESULTS_HEIGHT} from '../src/ResultsPane';
test('results pane provides a compact minimum and responds to dragging and keyboard resizing',async()=>{
 const dom=new JSDOM('<div id="root"></div>');
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const container=document.getElementById('root')!,root=createRoot(container);
 await act(async()=>root.render(<ResultsPane><div>Site table</div></ResultsPane>));
 await act(async()=>{(container.querySelector('.results-collapse-toggle') as HTMLButtonElement).click();});
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

test('short windows collapse results initially and preserve the table and resized height when toggled',async()=>{
 const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(async()=>root.render(<ResultsPane summary="2 sites · Converged" height={260}><table><tbody><tr><td>Preserved result</td></tr></tbody></table></ResultsPane>));
  const button=document.querySelector<HTMLButtonElement>('.results-collapse-toggle')!, content=document.getElementById('site-results-content')!;
  assert.equal(button.getAttribute('aria-expanded'),'false');assert.equal(content.hidden,true);assert.match(button.textContent!,/2 sites · Converged.*Values and 1 std/);
  await act(async()=>button.click());assert.equal(content.hidden,false);assert.equal(document.querySelector<HTMLElement>('.results-panel')!.style.height,'260px');
  await act(async()=>button.click());assert.equal(content.hidden,true);assert.equal(content.textContent,'Preserved result');
  await act(async()=>button.click());assert.equal(document.querySelector<HTMLElement>('.results-panel')!.style.height,'260px');
 }finally{await act(async()=>root.unmount());dom.window.close();}
});

 test('extra-large text collapses results in a default-height native window and scales the reopened minimum',async()=>{
 const dom=new JSDOM('<html style="font-size:20px"><body><div id="root"></div></body></html>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(window,'innerHeight',{value:940});
 const root=createRoot(document.getElementById('root')!);try{await act(async()=>root.render(<ResultsPane><div>Results</div></ResultsPane>)); const toggle=document.querySelector<HTMLButtonElement>('.results-collapse-toggle')!;assert.equal(toggle.getAttribute('aria-expanded'),'false'); await act(async()=>toggle.click());assert.equal(document.querySelector('[role=separator]')!.getAttribute('aria-valuemin'),'190');const splitter=document.querySelector('[role=separator]')!;const maximum=Number(splitter.getAttribute('aria-valuemax'));assert.ok(maximum>190);await act(async()=>splitter.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true})));assert.equal(document.querySelector<HTMLElement>('.results-panel')!.style.height,`${maximum}px`);}finally{await act(async()=>root.unmount());dom.window.close();}
});

test('Results can share the Fit control row, leaving no separate collapsed strip',async()=>{
 const dom=new JSDOM('<div id="controls"></div><div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});const root=createRoot(document.getElementById('root')!);try{await act(async()=>root.render(<ResultsPane controlsId="controls" summary="2 sites · Converged"><div>Table values</div></ResultsPane>));const button=document.querySelector<HTMLButtonElement>('#controls button')!,pane=document.querySelector('.results-panel')!;assert.equal(button.textContent,'▸ Results');assert.equal(button.getAttribute('aria-label'),'Show results');assert.ok(pane.classList.contains('results-external-control'));assert.equal(pane.querySelector('button'),null);await act(async()=>button.click());assert.equal(button.getAttribute('aria-expanded'),'true');assert.equal(document.getElementById('site-results-content')!.hidden,false);}finally{await act(async()=>root.unmount());dom.window.close();}
});


test('extra-large native laptop results retain a real keyboard resize range',async()=>{
 const dom=new JSDOM('<html style="font-size:20px"><body><div id="root"></div></body></html>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(window,'innerHeight',{value:738});
 const root=createRoot(document.getElementById('root')!);try{
  await act(async()=>root.render(<ResultsPane><div>Results</div></ResultsPane>));await act(async()=>document.querySelector<HTMLButtonElement>('.results-collapse-toggle')!.click());
  const splitter=document.querySelector('[role=separator]')!,pane=document.querySelector<HTMLElement>('.results-panel')!,initial=parseFloat(pane.style.height);
  await act(async()=>splitter.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true})));
  assert.ok(parseFloat(pane.style.height)>initial,'The laptop splitter must move at Extra large text.');
  const maximum=Number(splitter.getAttribute('aria-valuemax'));assert.ok(maximum>initial);
  await act(async()=>splitter.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true})));
  assert.equal(parseFloat(pane.style.height),maximum);
 }finally{await act(async()=>root.unmount());dom.window.close();}
});


test('Results control reveals an inactive spectrum in one click while retaining expansion state',async()=>{
 const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(window,'innerHeight',{value:1200});
 const root=createRoot(document.getElementById('root')!);let revealed=0;
 function Harness(){const[active,setActive]=useState(false);return <ResultsPane active={active} onExpandedChange={show=>{if(show){revealed++;setActive(true);}}}><div>Results</div></ResultsPane>;}
 try{await act(async()=>root.render(<Harness/>));const button=document.querySelector<HTMLButtonElement>('.results-collapse-toggle')!;assert.equal(button.getAttribute('aria-label'),'Show results');assert.equal(button.getAttribute('aria-expanded'),'false');await act(async()=>button.click());assert.equal(revealed,1);assert.equal(button.getAttribute('aria-label'),'Hide results');assert.equal(button.getAttribute('aria-expanded'),'true');assert.equal(document.getElementById('site-results-content')!.hidden,false);}finally{await act(async()=>root.unmount());dom.window.close();}
});
