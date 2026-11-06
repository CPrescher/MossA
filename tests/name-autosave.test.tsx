import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act,useState} from 'react';
import {SiteNameEditor} from '../src/SiteNameEditor';
import {useAutosave} from '../src/useAutosave';
import {readSession,defaultLayout,type Session} from '../src/session';
import {demo} from '../src/demo';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
const {createRoot}=await import('react-dom/client');
test('name editing commits once, Escape cancels, and reload flush commits the focused name before saving',async()=>{
  const container=document.getElementById('root')!,root=createRoot(container);let commits=0;
  function Harness(){const[snapshot,setSnapshot]=useState<Session['snapshot']>({project:demo(),raw:null,cal:{max:10,shift:0,folding:true,sinusoidal:false,center:256.5},filename:'named',selected:0});const problem=useAutosave({version:1,snapshot,layout:defaultLayout,fit:null,elapsed:null});return <><SiteNameEditor name={snapshot.project.sites[0].name} onCommit={name=>{commits++;setSnapshot(old=>({...old,project:{...old.project,sites:old.project.sites.map((s,i)=>i===0?{...s,name}:s)}}));}}/><span>{problem}</span></>;}
  const input=()=>container.querySelector('input')!;
  const type=async(value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(input(),value);input().dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  try{
    await act(async()=>root.render(<Harness/>));await act(async()=>input().focus());await type('Hematite');await act(async()=>input().dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));assert.equal(commits,1);
    await act(async()=>input().focus());await type('Canceled');await act(async()=>input().dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(commits,1);assert.equal(input().value,'Hematite');
    await act(async()=>input().focus());await type('Restored after reload');await act(async()=>window.dispatchEvent(new dom.window.Event('pagehide')));
    assert.equal(commits,2);assert.equal(readSession().session?.snapshot.project.sites[0].name,'Restored after reload');
    await act(async()=>new Promise(resolve=>setTimeout(resolve,220)));assert.equal(readSession().session?.snapshot.project.sites[0].name,'Restored after reload');
  }finally{await act(async()=>root.unmount());}
});
