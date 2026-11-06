import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AddSiteMenu} from '../src/AddSiteMenu';
import type {Site} from '../src/types';
test('Add exposes creation choices on demand and closes before graph definition',async()=>{
 const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const container=document.getElementById('root')!,root=createRoot(container);let defined='';
 function Harness(){const[k,setK]=useState<Site['kind']>('Doublet');const[p,setP]=useState<Site['profile']>('Lorentzian');return <AddSiteMenu disabled={false} kind={k} profile={p} onKind={setK} onProfile={setP} onDefine={()=>{defined=`${k}/${p}`;}}/>;}
 try{await act(async()=>root.render(<Harness/>));assert.equal(container.querySelector('[role="dialog"]'),null);
 await act(async()=>(container.querySelector('[aria-label="Add site"]') as HTMLElement).click());assert.ok(container.querySelector('[role="dialog"]'));
 const select=container.querySelector('[aria-label="New site type"]') as HTMLSelectElement;
 await act(async()=>{select.value='Sextet';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 await act(async()=>(container.querySelector('.define-new-site') as HTMLElement).click());assert.equal(defined,'Sextet/Lorentzian');assert.equal(container.querySelector('[role="dialog"]'),null);
 await act(async()=>(container.querySelector('[aria-label="Add site"]') as HTMLElement).click());await act(async()=>container.querySelector('.add-site-control')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(container.querySelector('[role="dialog"]'),null);
 }finally{await act(async()=>root.unmount());}
});
