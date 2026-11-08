import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act,useState} from 'react';
import {focusActivatedControl} from '../src/focus-control';
import {fitShortcut} from '../src/fit-shortcut';

test('fit shortcut commits the active field before fitting and never triggers a modal or Stop',async()=>{
 const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root')!);const values:string[]=[];
 function Harness({stop=false}:{stop?:boolean}){const[value,setValue]=useState('old');return <div onKeyDownCapture={fitShortcut} onClickCapture={event=>focusActivatedControl(event.target)}><input defaultValue="committed" onBlur={e=>setValue(e.target.value)}/><button className={`fit-button ${stop?'stop':''}`} onClick={()=>values.push(value)}>Fit</button><dialog/></div>;}
 const press=async()=>{const input=document.querySelector('input')!;await act(async()=>{input.focus();input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true}));});await act(()=>new Promise(r=>setTimeout(r,5)));};
 try{await act(async()=>root.render(<Harness/>));await press();assert.deepEqual(values,['committed']);assert.equal(document.activeElement,document.querySelector('input'));document.querySelector('dialog')!.setAttribute('open','');await press();assert.equal(values.length,1);document.querySelector('dialog')!.removeAttribute('open');await act(async()=>root.render(<Harness stop/>));await press();assert.equal(values.length,1);}finally{await act(async()=>root.unmount());dom.window.close();}
});

test('keyboard refit returns focus after temporarily disabling the edited field',async()=>{
 const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root')!);let finish:()=>void=()=>{};
 function Harness(){const[busy,setBusy]=useState(false);finish=()=>setBusy(false);return <div onKeyDownCapture={fitShortcut} onClickCapture={event=>focusActivatedControl(event.target)}><input disabled={busy}/><button className={`fit-button ${busy?'stop':''}`} onClick={()=>setBusy(true)}>Fit</button></div>;}
 try{await act(async()=>root.render(<Harness/>));const input=document.querySelector('input')!;await act(async()=>{input.focus();input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',metaKey:true,bubbles:true,cancelable:true}));});await act(()=>new Promise(r=>setTimeout(r,10)));assert.equal(input.disabled,true);await act(async()=>finish());await act(()=>new Promise(r=>setTimeout(r,5)));assert.equal(document.activeElement,input);}finally{await act(async()=>root.unmount());dom.window.close();}
});
