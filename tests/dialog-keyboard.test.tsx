import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useDialogKeyboardNavigation } from '../src/useDialogKeyboardNavigation';

test('modal keyboard boundaries wrap, skip hidden/disabled controls, and prefer a nested modal',async()=>{
 const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 dom.window.HTMLElement.prototype.getClientRects=function(){return [{width:10,height:10}] as unknown as DOMRectList;};
 function Harness(){useDialogKeyboardNavigation();return <><button id="outside">Outside</button><dialog open tabIndex={-1}><button id="first">Close</button><input disabled/><div hidden><button>Hidden</button></div><button id="last">Save</button><dialog id="nested" tabIndex={-1}><button id="nested-first">Back</button><button id="nested-last">Apply</button></dialog></dialog></>;}
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(async()=>root.render(<Harness/>));
  const press=async(shiftKey:boolean)=>{const e=new dom.window.KeyboardEvent('keydown',{key:'Tab',shiftKey,bubbles:true,cancelable:true});await act(async()=>{document.activeElement!.dispatchEvent(e);});assert.equal(e.defaultPrevented,true);};
  document.getElementById('first')!.focus();await press(true);assert.equal(document.activeElement?.id,'last');
  const nested=document.getElementById('nested') as HTMLDialogElement;nested.open=true;
  document.getElementById('nested-first')!.focus();await press(true);assert.equal(document.activeElement?.id,'nested-last');
  await press(false);assert.equal(document.activeElement?.id,'nested-first');
  nested.focus();await press(true);assert.equal(document.activeElement?.id,'nested-last');
  document.getElementById('outside')!.focus();await press(false);assert.equal(document.activeElement?.id,'nested-first');
 }finally{await act(async()=>root.unmount());dom.window.close();}
});
