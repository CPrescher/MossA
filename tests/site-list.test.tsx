import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {SiteList} from '../src/site-list';
import {newSite} from '../src/types';
test('hover previews sites independently of selection; each site has its own trash button',async()=>{
 const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const container=document.getElementById('root')!,root=createRoot(container),sites=[newSite(0),newSite(1),newSite(2)];let selected=-1,deleted=-1,hovered:number|null=null;
 try{await act(async()=>root.render(<SiteList sites={sites} selected={1} disabled={false} onSelect={i=>selected=i} onDelete={i=>deleted=i} onHover={i=>hovered=i}/>));
 const rows=container.querySelectorAll('.site-row');
 await act(async()=>{rows[0].dispatchEvent(new dom.window.MouseEvent('pointerover',{bubbles:true}));});assert.equal(hovered,0);assert.equal(selected,-1);assert.ok(rows[1].classList.contains('selected'));
 await act(async()=>{rows[0].dispatchEvent(new dom.window.MouseEvent('pointerout',{bubbles:true}));});assert.equal(hovered,null);
 await act(async()=>{const event=new dom.window.MouseEvent('pointerover',{bubbles:true});Object.defineProperty(event,'pointerType',{value:'touch'});rows[0].dispatchEvent(event);});assert.equal(hovered,null);
 await act(async()=>{rows[2].dispatchEvent(new dom.window.MouseEvent('pointerover',{bubbles:true}));});assert.equal(hovered,2);
 const trash=container.querySelectorAll('.site-trash');assert.equal(trash.length,3);await act(async()=>(trash[2] as HTMLElement).click());assert.equal(deleted,2);assert.equal(selected,-1);
 assert.equal(hovered,null);
 const buttons=container.querySelectorAll('.site-select');await act(async()=>(buttons[0] as HTMLElement).click());assert.equal(selected,0);assert.equal(buttons[1].getAttribute('aria-pressed'),'true');
 }finally{await act(async()=>root.unmount());}
});
