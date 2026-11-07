import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {useSiteColors} from '../src/useSiteColors';
import {useWorkspaceHistory,workspaceFromSnapshot} from '../src/workspace';
import {defaultLayout,type Snapshot} from '../src/session';
import {demo} from '../src/demo';
import {newSite} from '../src/types';

test('twenty picker updates form one undo step and preserve the earlier model edit',async()=>{
 const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});const root=createRoot(document.getElementById('root')!);const initial:Snapshot={project:demo(),raw:null,cal:{max:10,shift:0,sinusoidal:false,folding:false,center:0},filename:'Color test',selected:0};let api:any;
 function Harness(){const history=useWorkspaceHistory(()=>workspaceFromSnapshot(initial));const picker=useSiteColors(history.present,history.set);api={history,picker};return null;}
 try{await act(async()=>root.render(<Harness/>));await act(async()=>api.history.set({...api.history.present,project:{...api.history.present.project,sites:[...api.history.present.project.sites,newSite(2)]}}));api.picker.begin();for(let i=0;i<20;i++)await act(async()=>api.picker.change(0,'#'+(0x112200+i).toString(16)));assert.equal(api.history.past.length,2);assert.equal(api.history.present.project.sites[0].color,'#112213');await act(async()=>api.history.undo());assert.equal(api.history.present.project.sites[0].color,undefined);assert.equal(api.history.present.project.sites.length,3);for(let i=0;i<20;i++)await act(async()=>api.picker.change(0,'#'+(0x223300+i).toString(16)));assert.equal(api.history.past.length,2,'continuing an open picker after Undo starts one fresh group');await act(async()=>api.history.undo());assert.equal(api.history.present.project.sites[0].color,undefined);assert.equal(api.history.present.project.sites.length,3);await act(async()=>api.history.undo());assert.equal(api.history.present.project.sites.length,2);
 api.picker.begin();await act(async()=>api.picker.change(0,'#335577'));api.picker.begin();await act(async()=>api.picker.change(0,'#7799bb'));assert.equal(api.history.past.length,2);await act(async()=>api.history.undo());assert.equal(api.history.present.project.sites[0].color,'#335577');
 }finally{await act(async()=>root.unmount());dom.window.close();}
});
