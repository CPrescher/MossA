import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {captureDialogFocus,focusActivatedControl,withNativeDialogFocus} from '../src/focus-control';
test('activation focuses the actual button before a modal opener captures its return target',async()=>{
 const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});const host=document.getElementById('root')!,root=createRoot(host);let trigger:Element|null=null;
 try{
  await act(async()=>root.render(<div onClickCapture={event=>focusActivatedControl(event.target)}><button onClick={()=>{trigger=document.activeElement;}}><svg><path/></svg>Warnings</button><button disabled>Disabled</button><details><summary>Settings</summary></details></div>));
  assert.equal(document.activeElement,document.body);await act(async()=>host.querySelector('path')!.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));assert.equal(trigger,host.querySelector('button'));assert.equal(document.activeElement,host.querySelector('button'));
  focusActivatedControl(host.querySelector('button:disabled'));assert.equal(document.activeElement,trigger);focusActivatedControl(host.querySelector('summary'));assert.equal(document.activeElement,host.querySelector('summary'));
 }finally{await act(async()=>root.unmount());dom.window.close();}
});

test('native focus waits for delayed busy state and does not steal intentional focus',async()=>{
 const dom=new JSDOM('<button id="save">Save</button><button id="other">Other</button>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement});const button=document.getElementById('save') as HTMLButtonElement,other=document.getElementById('other')!;button.getClientRects=()=>[{width:100,height:32} as DOMRect] as any;let frames:FrameRequestCallback[]=[];window.requestAnimationFrame=callback=>{frames.push(callback);return 1;};
 try{
  button.focus();await withNativeDialogFocus(async()=>{button.disabled=true;button.blur();});frames.shift()!(0);assert.equal(document.activeElement,document.body);button.disabled=false;await new Promise(resolve=>setTimeout(resolve,0));assert.equal(document.activeElement,button);
  await withNativeDialogFocus(async()=>{button.disabled=true;button.blur();});frames.shift()!(0);other.focus();button.disabled=false;await new Promise(resolve=>setTimeout(resolve,0));assert.equal(document.activeElement,other);
 }finally{dom.window.close();}
});

test('native file panels restore their opener after cancellation or failure and skip removed openers',async()=>{
 const dom=new JSDOM('<button>Save project</button>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement});
 const button=document.querySelector('button')!;button.getClientRects=()=>[{width:100,height:32} as DOMRect] as any;let queued:FrameRequestCallback[]=[];window.requestAnimationFrame=callback=>{queued.push(callback);return 1;};
 try{
  button.focus();assert.equal(await withNativeDialogFocus(async()=>{button.disabled=true;button.blur();return false;}),false);button.disabled=false;queued.shift()!(0);assert.equal(document.activeElement,button);
  const beforePreparation=captureDialogFocus();button.disabled=true;button.blur();await Promise.resolve();await withNativeDialogFocus(async()=>false,beforePreparation);button.disabled=false;queued.shift()!(0);assert.equal(document.activeElement,button);
  await assert.rejects(withNativeDialogFocus(async()=>{button.blur();throw Error('Disk full');}),/Disk full/);queued.shift()!(0);assert.equal(document.activeElement,button);
  await withNativeDialogFocus(async()=>{button.remove();return true;});queued.shift()!(0);assert.equal(document.activeElement,document.body);
 }finally{dom.window.close();}
});
