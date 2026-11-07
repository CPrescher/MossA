import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {FitWarningsDialog} from '../src/FitWarningsDialog';
import {warningParameters} from '../src/warning-parameters';
import {demo} from '../src/demo';
import {enableXvbf} from '../src/xvbf';
test('fit warnings remain complete, with context and a named close action',()=>{
 const warnings=['Jacobian is rank deficient; parameter uncertainties are unavailable.','One or more parameters are at a bound; symmetric uncertainty estimates for them and their linked parameters are omitted.'],before=structuredClone(warnings);
 const html=renderToStaticMarkup(<FitWarningsDialog warnings={warnings} context="Sample 1 · Model 1" onClose={()=>{}}/>);
 assert.ok(warnings.every(warning=>html.includes(warning)));assert.ok(html.includes('Sample 1 · Model 1'));assert.ok(html.includes('aria-label="Close fit warnings"'));assert.deepEqual(warnings,before);
});

test('warning inspection names unavailable fitted/linked values without mislabeling fixed parameters as bound',()=>{
 const project=demo();project.sites[1]=enableXvbf(project.sites[1]);project.sites[1].xvbf!.delta.value=-.9999994;
 project.sites[0].params.cs.link={target:'site:1:delta',factor:1};
 const result={rank:8,free_parameters:8,errors:{'site:1:delta':null,'site:1:qsd:0:width':null,'site:0:a12':null,'site:0:cs':null,'site:1:csd:0:center':.001,'bkg:0':null}} as any;
 const before=structuredClone({project,result}),items=warningParameters(project,result);
 assert.deepEqual(items.map(p=>p.id),['site:1:delta','site:0:cs','bkg:0']);
 assert.equal(items[0].field,'xVBF coupling');assert.equal(items[0].view,'corr');assert.equal(items[0].site,1);assert.ok(items[0].label.includes('xVBF coupling δ'));
 assert.equal(items[1].tab,'xVBF');assert.equal(items[1].field,'xVBF coupling');assert.ok(items[1].label.includes('linked to'));assert.equal(items[2].tab,'Gen');assert.equal(items[2].field,'Background 0');
 const html=renderToStaticMarkup(<FitWarningsDialog warnings={['At a bound.']} parameters={items} onInspect={()=>{}} context="Sample" onClose={()=>{}}/>);
 assert.ok(html.includes('Parameters without std (3)'));assert.ok(html.includes('Inspect parameter'));assert.ok(html.includes('Fitting options → xVBF → Corr'));assert.deepEqual({project,result},before);
});

test('partial bound warnings preserve the parenthetical std key and use a singular warning label',async()=>{
 const {ResultFitNote}=await import('../src/ResultFitNote');const result={rank:8,free_parameters:8,warnings:['One or more parameters are at a bound.']} as any;
 const html=renderToStaticMarkup(<ResultFitNote result={result} fitting={false} onWarnings={()=>{}}/>);assert.ok(html.includes('( ) = 1 std'));assert.ok(html.includes('1 fit warning'));assert.ok(!html.includes('1 fit warnings'));assert.ok(!html.includes('rank deficient'));
 const deficient=renderToStaticMarkup(<ResultFitNote result={{...result,rank:7}} fitting={false} onWarnings={()=>{}}/>);assert.ok(deficient.includes('std unavailable · rank deficient'));assert.ok(deficient.includes('( ) = 1 std'));
});
