import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React,{act,useState} from 'react';
import { createRoot } from 'react-dom/client';
import { XvbfEditor, XvbfDistributions } from '../src/XvbfEditor';
import { demo } from '../src/demo';
import { newSite } from '../src/types';
import { enableXvbf, addDistribution } from '../src/xvbf';
import { renderToStaticMarkup } from 'react-dom/server';

test('xVBF editor enables a doublet, exposes editable distributions and bounds, and maintains normalized weights through add/delete',async()=>{
 const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
 const container=document.getElementById('root')!,root=createRoot(container);let current=demo();current.sites=[newSite(0)];
 function Harness(){const[p,set]=useState(current);current=p;return <><XvbfEditor project={p} selected={0} result={null} onSite={site=>set({...p,sites:[site]})}/><XvbfDistributions project={p} selected={0} result={null} onSite={site=>set({...p,sites:[site]})}/></>;}
 const find=(label:string)=>container.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;
 const click=async(el:Element)=>act(async()=>el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));
 try {
  await act(async()=>root.render(<Harness/>));await click(container.querySelector('input[type=checkbox]')!);
  assert.ok(current.sites[0].xvbf);assert.equal(find('Fit QS 1 width').checked,false);assert.equal(find('Fit CS 1 width').checked,true);
  assert.ok(container.querySelector('svg[aria-label="CS distribution"]'));assert.ok(container.querySelector('svg[aria-label="QS distribution"]'));
  await click(find('Add QS component'));assert.equal(current.sites[0].xvbf!.qs.length,2);assert.equal(current.sites[0].xvbf!.qs.reduce((s,c)=>s+c.weight.value,0),1);
  await click(find('Edit QS component 2 bounds'));assert.ok(find('QS 2 weight min'));assert.ok(find('QS 2 weight max'));await act(async()=>container.querySelector('dialog')!.dispatchEvent(new dom.window.Event('close',{bubbles:true})));
  await click(find('Delete QS component 2'));assert.equal(current.sites[0].xvbf!.qs.length,1);assert.equal(current.sites[0].xvbf!.qs[0].weight.value,1);
  assert.ok(find('QS 1 weight').disabled);assert.ok(find('Fit QS 1 weight').disabled);
 } finally {await act(async()=>root.unmount());dom.window.close();}
});


test('weight std is displayed in percentage points while stored weights remain fractions',()=>{
 const p=demo();const site=enableXvbf(newSite(0));site.xvbf=addDistribution(site.xvbf!,'qs');p.sites=[site];
 const fit={converged:true,termination:'test',iterations:1,free_parameters:1,dof:100,rank:1,reduced_objective:1,errors:{'site:0:qsd:0:weight':.01},warnings:[]};
 const html=renderToStaticMarkup(<XvbfDistributions project={p} selected={0} result={fit} onSite={()=>{}}/>);
 assert.match(html,/Displayed in percentage points\.[^>]*>± 1\.0<\/small>/);
 assert.equal(p.sites[0].xvbf!.qs[0].weight.value,.5);
});


test('CS/QS switch renders one clean editor or both without changing the model',()=>{
 const p=demo();p.sites=[enableXvbf(newSite(0))];const original=structuredClone(p);
 const markup=(view:'cs'|'qs'|'both')=>renderToStaticMarkup(<XvbfDistributions project={p} selected={0} result={null} onSite={()=>{}} view={view}/>);
 assert.match(markup('cs'),/aria-label="CS distribution parameters"/);assert.doesNotMatch(markup('cs'),/aria-label="QS distribution parameters"/);
 assert.match(markup('qs'),/aria-label="QS distribution parameters"/);assert.doesNotMatch(markup('qs'),/aria-label="CS distribution parameters"/);
 assert.match(markup('both'),/aria-label="CS distribution parameters"/);assert.match(markup('both'),/aria-label="QS distribution parameters"/);assert.deepEqual(p,original);
});
