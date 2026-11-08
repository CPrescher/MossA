import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {demo} from '../src/demo';
import {ResultsTable} from '../src/ResultsTable';
import {intensityFractions,parameterValue,uncertainty,formatStd,formatParenthetical,resultCellLabel} from '../src/results';
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
  assert.equal(container.querySelectorAll('thead th').length,10);assert.ok(container.querySelectorAll('thead th')[2].textContent!.includes('Fraction'));assert.ok(!container.textContent!.includes('Lorentz mix'));assert.equal(container.querySelectorAll('.fraction-result').length,2);
  assert.ok(container.querySelector('.fraction-result')!.textContent!.includes('77.36'));assert.ok(container.querySelector('.fraction-result .uncertainty')!.textContent!.includes('(25)'));
  assert.equal(container.querySelector('td[data-parameter="cs"] .uncertainty')!.textContent,'(12)');assert.ok(container.querySelector('[data-state="fixed"]'));
  await act(async()=>(container.querySelectorAll('tbody tr')[1] as HTMLElement).click());assert.equal(selected,1);
  const row=container.querySelectorAll('tbody tr')[0] as HTMLElement;
  await act(async()=>row.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true})));
  assert.equal(selected,1);assert.equal(document.activeElement,container.querySelectorAll('tbody tr')[1]);
  await act(async()=>document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true})));
  assert.equal(selected,0);assert.equal(document.activeElement,row);
  await act(async()=>root.render(<ResultsTable project={p} evaluation={null} result={null} selected={0} onSelect={()=>{}}/>));
  assert.ok(container.querySelector('td[data-parameter="cs"]')!.getAttribute('title')!.includes('Fit the current model'));assert.ok([...container.querySelectorAll('[data-state="needs-fit"]')].every(node=>node.textContent===''));assert.ok(container.querySelector('td[data-parameter="cs"] .result-value')!.textContent);
  p.sites[0].profile='PseudoVoigt'; await act(async()=>root.render(<ResultsTable project={p} evaluation={null} result={null} selected={0} onSelect={()=>{}}/>));assert.equal(container.querySelectorAll('thead th')[10].textContent,'Lorentz mix');
  p.sites=p.sites.slice(0,1);p.sites[0].kind='Singlet';p.sites[0].profile='Lorentzian';await act(async()=>root.render(<ResultsTable project={p} evaluation={null} result={null} selected={0} onSelect={()=>{}}/>));assert.deepEqual([...container.querySelectorAll('thead th')].map(th=>th.textContent),['Site','Type','Fraction %','CS mm/s','FWHM mm/s','Intensity raw']);
 }finally{await act(async()=>root.unmount());}
});

test('parenthetical std rounds the value and uncertainty together without losing place information',()=>{
 assert.deepEqual(formatParenthetical(.120435092,.000329607),{value:'0.12044',suffix:'(33)'});
 assert.deepEqual(formatParenthetical(33.100485,.002374),{value:'33.1005',suffix:'(24)'});
 assert.deepEqual(formatParenthetical(2389.1025,6.7514),{value:'2389.1',suffix:'(68)'});
 assert.deepEqual(formatParenthetical(-.12345,.00999),{value:'-0.123',suffix:'(10)'});
 assert.deepEqual(formatParenthetical(1.23456e-10,1.23e-12),{value:'1.235',suffix:'(12)e-10'});
 assert.deepEqual(formatParenthetical(123456,1200),{value:'1.235',suffix:'(12)e5'});
 assert.deepEqual(formatParenthetical(0,0),{value:'0',suffix:'(0)'});
 assert.deepEqual(formatParenthetical(1.23,null),{value:'1.23',suffix:''});
 assert.deepEqual(formatParenthetical(2389.1,null),{value:'2389.1',suffix:''});
 assert.deepEqual(formatParenthetical(-.00001,.003),{value:'0.0000',suffix:'(30)'});
 assert.deepEqual(formatParenthetical(99999,150),{value:'1.0000',suffix:'(15)e5'});
 assert.deepEqual(formatParenthetical(.1,1000),{value:'0.0',suffix:'(10)e3'});
 assert.match(resultCellLabel(.120435092,.000329607,''),/0.12044, plus or minus 0.00033/);
});

test('selected results reveal vertically below the sticky header without moving columns',async()=>{
 const {revealSelectedResult}=await import('../src/result-scroll');
 const dom=new JSDOM('<div class="table-scroll"><table><thead><tr><th>Site</th></tr></thead><tbody><tr class="selected-row"><td>Site 3</td></tr></tbody></table></div>');
 const table=dom.window.document.querySelector('table')!,scroller=dom.window.document.querySelector<HTMLElement>('.table-scroll')!,row=table.querySelector('tbody tr')!;
 scroller.getBoundingClientRect=()=>({top:100,bottom:250} as DOMRect);table.tHead!.getBoundingClientRect=()=>({height:35} as DOMRect);
 Object.defineProperty(scroller,'clientHeight',{value:150,configurable:true});
 scroller.scrollTop=0;scroller.scrollLeft=0;row.getBoundingClientRect=()=>({top:220,bottom:260} as DOMRect);revealSelectedResult(table);assert.equal(scroller.scrollTop,10);assert.equal(scroller.scrollLeft,0);
 row.getBoundingClientRect=()=>({top:120,bottom:160} as DOMRect);scroller.scrollTop=30;scroller.scrollLeft=18;revealSelectedResult(table);assert.equal(scroller.scrollTop,15);assert.equal(scroller.scrollLeft,18);
 Object.defineProperty(scroller,'clientHeight',{value:135});row.getBoundingClientRect=()=>({top:225,bottom:245} as DOMRect);scroller.scrollTop=0;revealSelectedResult(table);assert.equal(scroller.scrollTop,10);assert.equal(scroller.scrollLeft,18);
});
