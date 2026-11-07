import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {createRoot} from 'react-dom/client';
import {ExportOptions} from '../src/ExportOptions';

test('Export exposes separate real output actions, explains unavailable tables, and keeps a modal opener available',async()=>{
 const dom=new JSDOM('<div id="root"></div><dialog open><button id="close">Close</button></dialog>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.getElementById('root')!,root=createRoot(host);let data=0,table=0,figure=0,report=0;
 try {
  const render=async(ready:boolean)=>act(async()=>root.render(<ExportOptions context="Spectrum A · Model B" canExport canExportTable={ready} onData={()=>data++} onTable={()=>table++} onFigure={()=>figure++} onReport={()=>report++}/>));
  await render(false);const trigger=host.querySelector<HTMLButtonElement>('[aria-label="Export"]')!;await act(async()=>trigger.click());
  let actions=host.querySelectorAll<HTMLButtonElement>('.export-action button');assert.equal(actions[1].disabled,true);assert.equal(actions[3].disabled,true);assert.ok(host.textContent?.includes('Fit the model to export'));assert.ok(host.textContent?.includes('Spectrum A · Model B'));
  await act(async()=>actions[0].click());await act(async()=>actions[1].click());assert.equal(data,1);assert.equal(table,0);
  await render(true);actions=host.querySelectorAll('.export-action button');await act(async()=>actions[1].click());await act(async()=>actions[2].click());assert.equal(table,1);assert.equal(figure,1);await act(async()=>actions[3].click());assert.equal(report,1);
  await act(async()=>actions[2].dispatchEvent(new dom.window.FocusEvent('focusout',{bubbles:true,relatedTarget:document.getElementById('close')})));assert.equal(trigger.getAttribute('aria-expanded'),'true');
  await act(async()=>actions[2].dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(document.activeElement,trigger);assert.equal(trigger.getAttribute('aria-expanded'),'false');
  assert.ok(host.textContent?.includes('SVG / PNG / EPS / PDF')); // All listed figure formats are implemented; reports remain separate.
 }finally{await act(async()=>root.unmount());dom.window.close();}
});
