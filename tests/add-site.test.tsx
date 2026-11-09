import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AddSiteMenu} from '../src/AddSiteMenu';
import type {Site} from '../src/types';
test('Add exposes creation choices on demand and closes before graph definition',async()=>{
 const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const container=document.getElementById('root')!,root=createRoot(container);let defined='',added='';
 function Harness(){const[k,setK]=useState<Site['kind']>('Doublet');const[p,setP]=useState<Site['profile']>('Lorentzian');return <AddSiteMenu disabled={false} kind={k} profile={p} onKind={setK} onProfile={setP} onDefine={()=>{defined=`${k}/${p}`;}} onAdd={()=>{added=`${k}/${p}`;}}/>;}
 try{await act(async()=>root.render(<Harness/>));assert.equal(container.querySelector('[role="dialog"]'),null);
 await act(async()=>(container.querySelector('[aria-label="Add site"]') as HTMLElement).click());assert.ok(container.querySelector('[role="dialog"]'));
 const select=container.querySelector('[aria-label="New site type"]') as HTMLSelectElement;
 await act(async()=>{select.value='Sextet';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 await act(async()=>(container.querySelector('.define-new-site') as HTMLElement).click());assert.equal(defined,'Sextet/Lorentzian');assert.equal(container.querySelector('[role="dialog"]'),null);
 await act(async()=>(container.querySelector('[aria-label="Add site"]') as HTMLElement).click());await act(async()=>container.querySelector('.add-site-control')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(container.querySelector('[role="dialog"]'),null);
 await act(async()=>(container.querySelector('[aria-label="Add site"]') as HTMLElement).click());
 await act(async()=>(container.querySelector('.add-site-numerically') as HTMLElement).click());assert.equal(added,'Sextet/Lorentzian');assert.equal(container.querySelector('[role="dialog"]'),null);
 }finally{await act(async()=>root.unmount());}
});

test('both Add actions survive WebKit blurring a select to no focused button before click',async()=>{
 const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});const root=createRoot(document.getElementById('root')!);let added=0,defined=0;
 try{await act(async()=>root.render(<AddSiteMenu disabled={false} kind="Doublet" profile="Lorentzian" onKind={()=>{}} onProfile={()=>{}} onAdd={()=>added++} onDefine={()=>defined++}/>));
 for(const action of ['.add-site-numerically','.define-new-site']){await act(async()=>(document.querySelector('[aria-label="Add site"]') as HTMLElement).click());const select=document.querySelector('select')!;await act(async()=>select.dispatchEvent(new dom.window.FocusEvent('focusout',{bubbles:true,relatedTarget:null})));assert.ok(document.querySelector(action),'The action must remain mounted for its pending pointer click');await act(async()=>(document.querySelector(action) as HTMLElement).click());}assert.equal(added,1);assert.equal(defined,1);
 }finally{await act(async()=>root.unmount());dom.window.close();}
});
