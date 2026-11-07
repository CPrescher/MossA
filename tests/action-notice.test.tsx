import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {useActionNotice} from '../src/useActionNotice';

test('save/export feedback is visible over a completed fit, repeated actions restart it, and stopping stays explicit',async()=>{
 const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const timers=new Map<number,{callback:()=>void;delay:number}>();let serial=0,notice:ReturnType<typeof useActionNotice>;
 window.setTimeout=((callback:()=>void,delay:number)=>{timers.set(++serial,{callback,delay});return serial;}) as typeof window.setTimeout;window.clearTimeout=id=>{timers.delete(id);};
 const root=createRoot(document.getElementById('root')!);
 function Harness(){notice=useActionNotice();return <div role="status">{notice.text||'Converged · previous fit'}</div>;}
 try{
  await act(async()=>root.render(<Harness/>));await act(async()=>notice!.show('Saved Garnet.mossa'));assert.equal(document.querySelector('[role=status]')!.textContent,'Saved Garnet.mossa');const first=serial;assert.equal(timers.get(first)!.delay,6000);
  await act(async()=>notice!.show('Saved Garnet.mossa'));assert.ok(!timers.has(first));assert.ok(timers.has(serial),'even the same repeated Save gets its full reading time');
  const expire=timers.get(serial)!.callback;timers.clear();await act(async()=>expire());assert.match(document.querySelector('[role=status]')!.textContent!,/Converged/);
  await act(async()=>notice!.show('Fit stopped · previous fit kept.',true));assert.equal(timers.size,0);assert.match(document.querySelector('[role=status]')!.textContent!,/Fit stopped/);
  await act(async()=>notice!.clear());assert.match(document.querySelector('[role=status]')!.textContent!,/Converged/);
 }finally{await act(async()=>root.unmount());dom.window.close();}
});
