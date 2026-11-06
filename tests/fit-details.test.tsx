import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {FitDetails} from '../src/FitDetails';

test('fit details toggle in compact layouts and automatically follow available editor space without oscillating',async()=>{
  const dom=new JSDOM('<div id="root"></div>');
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
  let available=20,measure=()=>{};
  Object.assign(globalThis,{ResizeObserver:class{constructor(cb:()=>void){measure=cb;}observe(){}disconnect(){}}});
  const proto=dom.window.HTMLElement.prototype;
  Object.defineProperty(proto,'clientHeight',{configurable:true,get(){return this.classList.contains('site-editor')?120+available-(document.querySelector('.fit-details.is-open')?54:0):0;}});
  Object.defineProperty(proto,'scrollHeight',{configurable:true,get(){return this.classList.contains('fit-details-body')?48:0;}});
  proto.getBoundingClientRect=function(){const height=this.classList.contains('parameters')?120:this.classList.contains('fit-details-body')&&this.parentElement?.classList.contains('is-open')?48:0;return {x:0,y:0,top:0,left:0,right:200,bottom:height,width:200,height,toJSON(){}};};
  const container=document.getElementById('root')!,root=createRoot(container);
  try{
    await act(async()=>root.render(<aside className="left-panel"><div className="site-editor"><div className="parameters"/></div><section className="status-panel"><div>Status stays above details</div><FitDetails warningCount={1}><dl><dt>SSE</dt><dd>1.23e4</dd></dl></FitDetails></section></aside>));
    const toggle=()=>container.querySelector('.fit-details-toggle') as HTMLButtonElement,body=()=>container.querySelector('.fit-details-body')!;
    assert.equal(toggle().getAttribute('aria-expanded'),'false');
    await act(async()=>toggle().click());assert.equal(toggle().getAttribute('aria-expanded'),'true');assert.equal(body().getAttribute('aria-hidden'),'false');
    await act(async()=>toggle().click());assert.equal(toggle().getAttribute('aria-expanded'),'false');
    available=120;await act(async()=>measure());assert.equal(toggle(),null);assert.equal(body().getAttribute('aria-hidden'),'false');
    for(let i=0;i<3;i++)await act(async()=>measure());assert.equal(toggle(),null);
    available=20;await act(async()=>measure());assert.equal(toggle().getAttribute('aria-expanded'),'false');
    assert.ok(container.querySelector('.status-panel')!.textContent!.includes('Status stays above details'));
  }finally{await act(async()=>root.unmount());}
});
