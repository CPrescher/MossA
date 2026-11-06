import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {demo} from '../src/demo';
import {ResultsTable} from '../src/ResultsTable';
import {intensityFractions,parameterValue,uncertainty,formatStd} from '../src/results';
import type {FitResult} from '../src/types';

test('fractions normalize intensity parameters, resolve links, and handle zero totals and zero sites',()=>{
 const p=demo();p.sites[0].params.intensity.value=30;p.sites[1].params.intensity.value=70;
 assert.deepEqual(intensityFractions(p,null,null).map(f=>f.value),[30,70]);
 p.sites[1].params.intensity.link={target:'site:0:intensity',factor:2};
 assert.equal(parameterValue(p,null,1,'intensity'),60);assert.ok(Math.abs(intensityFractions(p,null,null)[0].value!-100/3)<1e-10);
 p.sites[0].params.intensity.value=0;assert.ok(intensityFractions(p,null,null).every(f=>f.value===null));p.sites=[];assert.deepEqual(intensityFractions(p,null,null),[]);
});
test('uncertainty states distinguish fixed, linked, not-yet-fitted, and rank-deficient parameters',()=>{
 assert.equal(formatStd(.10434),'0.10');assert.equal(formatStd(1e-12),'1.0e-12');assert.equal(formatStd(0),'0');assert.equal(formatStd(null),'—');
 const p=demo();assert.equal(uncertainty(p,null,'site:0:cs').state,'needs-fit');assert.equal(uncertainty(p,null,'site:0:qs').state,'fixed');
 p.sites[1].params.cs.link={target:'site:0:qs',factor:2};assert.equal(uncertainty(p,null,'site:1:cs').state,'fixed');
 assert.equal(uncertainty(p,{errors:{},rank:1,free_parameters:2} as FitResult,'site:0:cs').state,'unavailable');
});
test('result table shows readable std, separate percentage fractions, unavailable reasons, and selection',async()=>{
 const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const container=document.getElementById('root')!,root=createRoot(container),p=demo();let selected=-1;
 const result={errors:{'site:0:cs':.00123,'site:0:intensity':5},rank:8,free_parameters:8,intensity_fractions:[{value:77.358490566,error:.25},{value:22.641509434,error:.25}]} as FitResult;
 try{
  await act(async()=>root.render(<ResultsTable project={p} evaluation={null} result={result} selected={0} onSelect={i=>selected=i}/>));
  assert.equal(container.querySelectorAll('th').length,11);assert.ok(container.querySelectorAll('th')[2].textContent!.includes('Intensity'));assert.equal(container.querySelectorAll('th')[10].textContent,'Lorentz mix');assert.equal(container.querySelectorAll('.fraction-result').length,2);
  assert.ok(container.querySelector('.fraction-result')!.textContent!.includes('77.36'));assert.ok(container.querySelector('.fraction-result .uncertainty')!.textContent!.includes('0.25'));
  assert.equal(container.querySelector('td[data-parameter="cs"] .uncertainty')!.textContent,'± 0.0012');assert.ok(container.querySelector('[data-state="fixed"]'));
  await act(async()=>(container.querySelectorAll('tbody tr')[1] as HTMLElement).click());assert.equal(selected,1);
  await act(async()=>root.render(<ResultsTable project={p} evaluation={null} result={null} selected={0} onSelect={()=>{}}/>));
  assert.ok(container.querySelector('[data-state="needs-fit"]')!.closest('td')!.title.includes('Fit the current model'));assert.ok(container.querySelector('[data-state="needs-fit"]')!.textContent!.includes('—'));
 }finally{await act(async()=>root.unmount());}
});
