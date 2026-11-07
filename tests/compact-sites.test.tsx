import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {useCompactSites} from '../src/useCompactSites';
import {newSite} from '../src/types';

test('a pane that fits mouse-sized primary rows switches to the selector for touch-sized rows',async()=>{
 for(const coarse of [false,true]){
  const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});document.documentElement.style.fontSize='16px';window.matchMedia=()=>({matches:coarse,addEventListener(){},removeEventListener(){}} as any);
  Object.defineProperty(dom.window.HTMLElement.prototype,'getBoundingClientRect',{value:()=>({height:420})});Object.assign(globalThis,{ResizeObserver:class{observe(){}disconnect(){}}});const sites=[newSite(0,'Sextet'),newSite(1,'Doublet'),newSite(2,'Doublet')],before=structuredClone(sites);
  function Example(){const panel=useRef<HTMLElement|null>(null),view=useCompactSites(panel,sites);return <aside ref={panel}><button onClick={view.toggle}>{view.compact?'selector':'list'}</button></aside>;}
  const root=createRoot(document.getElementById('root')!);
  try{await act(async()=>root.render(<Example/>));const toggle=document.querySelector('button')!;assert.equal(toggle.textContent,coarse?'selector':'list');if(coarse){await act(async()=>toggle.click());assert.equal(toggle.textContent,'list');}assert.deepEqual(sites,before);}
  finally{await act(async()=>root.unmount());dom.window.close();}
 }
});

test('a short two-site inspector also makes room for the five main sextet fields',async()=>{
 const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});document.documentElement.style.fontSize='20px';window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}} as any);
 Object.defineProperty(dom.window.HTMLElement.prototype,'getBoundingClientRect',{value:()=>({height:420})});Object.assign(globalThis,{ResizeObserver:class{observe(){}disconnect(){}}});const sites=[newSite(0,'Sextet'),newSite(1,'Doublet')],before=structuredClone(sites);
 function Example(){const panel=useRef<HTMLElement|null>(null),view=useCompactSites(panel,sites);return <aside ref={panel}><button onClick={view.toggle}>{view.compact?'selector':'list'}</button></aside>;}
 const root=createRoot(document.getElementById('root')!);
 try{await act(async()=>root.render(<Example/>));assert.equal(document.querySelector('button')!.textContent,'selector');await act(async()=>document.querySelector<HTMLButtonElement>('button')!.click());assert.equal(document.querySelector('button')!.textContent,'list');assert.deepEqual(sites,before);}
 finally{await act(async()=>root.unmount());dom.window.close();}
});
