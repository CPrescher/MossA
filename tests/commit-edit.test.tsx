import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act,useRef,useState} from 'react';
import {JSDOM} from 'jsdom';
import {InlineNameEditor} from '../src/InlineNameEditor';
import {Numeric} from '../src/Numeric';
import {SiteNameEditor} from '../src/SiteNameEditor';
import {commitActiveEdit} from '../src/commit-edit';
import {focusActivatedControl} from '../src/focus-control';
const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
const {createRoot}=await import('react-dom/client');

test('Save reads the committed numeric/name draft for keyboard and click, and rejects invalid drafts',async()=>{
 const root=createRoot(document.getElementById('root')!),saved:{cs:number|null;name:string}[]=[];let save=()=>{};
 function Harness(){const[cs,setCS]=useState<number|null>(.123456789),[name,setName]=useState('Site 1'),latest=useRef({cs,name});latest.current={cs,name};save=()=>{const {invalid}=commitActiveEdit();if(invalid){invalid.focus();return;}saved.push({...latest.current});};return <div className="app" onClickCapture={event=>focusActivatedControl(event.target)}><Numeric label="CS" value={cs} onChange={setCS}/><SiteNameEditor name={name} onCommit={setName}/><button onClick={()=>save()}>Save</button></div>;}
 const edit=async(label:string,text:string)=>{const input=document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;await act(async()=>input.focus());await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(input,text);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});return input;};
 try{
  await act(async()=>root.render(<Harness/>));await edit('CS','0.456789123');await act(async()=>save());assert.equal(saved.at(-1)!.cs,.456789123);
  await edit('CS','0.789123456');await act(async()=>document.querySelector<HTMLButtonElement>('button')!.click());assert.equal(saved.at(-1)!.cs,.789123456);
  await edit('Site name','Fe$^{3+}$');await act(async()=>save());assert.equal(saved.at(-1)!.name,'Fe$^{3+}$');
  const count=saved.length,input=await edit('CS','invalid');await act(async()=>save());assert.equal(saved.length,count);assert.equal(input.getAttribute('aria-invalid'),'true');assert.equal(document.activeElement,input);
 }finally{await act(async()=>root.unmount());}
});

 test('project and model rename fields allow the Save shortcut to commit and serialize once',async()=>{
 const root=createRoot(document.getElementById('root')!),saved:string[]=[];
 function Harness(){const[name,setName]=useState('Project'),[editing,setEditing]=useState(true),latest=useRef(name);latest.current=name;return <div className="app" onKeyDown={event=>{if((event.metaKey||event.ctrlKey)&&event.key==='s'){event.preventDefault();const {origin}=commitActiveEdit();origin?.focus();saved.push(latest.current);}}}>{editing?<InlineNameEditor name={name} label="Project name" rowId="project" onCommit={next=>{setName(next);setEditing(false);}} onCancel={()=>setEditing(false)}/>:<button id="project">{name}</button>}</div>;}
 try{await act(async()=>root.render(<Harness/>));const input=document.querySelector('input')!;await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(input,'Saved name');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});const key=new dom.window.KeyboardEvent('keydown',{key:'s',metaKey:true,bubbles:true,cancelable:true});await act(async()=>input.dispatchEvent(key));assert.equal(key.defaultPrevented,true);assert.deepEqual(saved,['Saved name']);assert.equal(document.activeElement,document.getElementById('project'));}finally{await act(async()=>root.unmount());}
});
