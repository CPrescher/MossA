import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {HeaderOptions} from '../src/HeaderOptions';

test('Header options keep null-blur clicks usable, closes outside, and returns keyboard focus on Escape',async()=>{
 const dom=new JSDOM('<div id="root"></div><button id="outside">Outside</button>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.getElementById('root')!,root=createRoot(host);
 try{
  await act(async()=>root.render(<HeaderOptions><button>Export graph</button><input aria-label="Example"/></HeaderOptions>));const more=host.querySelector<HTMLButtonElement>('.header-more-toggle')!;
  await act(async()=>more.click());assert.equal(more.getAttribute('aria-expanded'),'true');
  await act(async()=>more.dispatchEvent(new dom.window.FocusEvent('focusout',{bubbles:true,relatedTarget:null})));assert.equal(more.getAttribute('aria-expanded'),'true');
  await act(async()=>document.getElementById('outside')!.dispatchEvent(new dom.window.Event('pointerdown',{bubbles:true})));assert.equal(more.getAttribute('aria-expanded'),'false');
  await act(async()=>more.click());const action=host.querySelector<HTMLButtonElement>('.header-options-content button')!;action.focus();
  await act(async()=>action.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(more.getAttribute('aria-expanded'),'false');assert.equal(document.activeElement,more);
 }finally{await act(async()=>root.unmount());dom.window.close();}
});

test('opening a modal from header options preserves its return target instead of closing the menu on blur',async()=>{
 const dom=new JSDOM('<div id="root"></div><dialog open><button id="close">Close</button></dialog>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});const host=document.getElementById('root')!,root=createRoot(host);
 try{
  await act(async()=>root.render(<HeaderOptions><button>Export graph</button></HeaderOptions>));const more=host.querySelector<HTMLButtonElement>('.header-more-toggle')!;await act(async()=>more.click());const action=host.querySelector<HTMLButtonElement>('.header-options-content button')!,close=document.getElementById('close')!;
  await act(async()=>action.dispatchEvent(new dom.window.FocusEvent('focusout',{bubbles:true,relatedTarget:close})));assert.equal(more.getAttribute('aria-expanded'),'true');
  await act(async()=>close.dispatchEvent(new dom.window.Event('pointerdown',{bubbles:true})));assert.equal(more.getAttribute('aria-expanded'),'true');
 }finally{await act(async()=>root.unmount());dom.window.close();}
});

test('Header options ArrowDown skips unavailable exports and enters the first usable control',async()=>{
 const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});window.requestAnimationFrame=callback=>{setTimeout(()=>callback(0),0);return 1;};const host=document.getElementById('root')!,root=createRoot(host);
 try{
  await act(async()=>root.render(<HeaderOptions><button disabled>Export data</button><button disabled>Export graph</button><select aria-label="Text size"><option>Comfortable</option></select></HeaderOptions>));
  for(const node of host.querySelectorAll<HTMLElement>('button,select'))node.getClientRects=()=>[{width:40,height:32} as DOMRect] as any;
  const more=host.querySelector<HTMLButtonElement>('.header-more-toggle')!;await act(async()=>{more.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));await new Promise(resolve=>setTimeout(resolve,5));});
  assert.equal(document.activeElement,host.querySelector('select'));assert.equal(more.getAttribute('aria-expanded'),'true');
 }finally{await act(async()=>root.unmount());dom.window.close();}
});
