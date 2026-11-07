import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {renderFitReport,type FitReportInput} from '../src/fit-report';
import {defaultFigureOptions} from '../src/figure';
import {demo} from '../src/demo';
import {newSite,parameter} from '../src/types';

function fixture():FitReportInput {
 const project=demo();project.spectrum={x:[-2,-1,0,1,2],y:[100,92,83,94,100]};
 return {project,evaluation:{parameters:{'site:1:cs':.246},y:[100,91,81,91,100],background:[100,100,100,100,100],components:project.sites.map(()=>[0,3,6,3,0]),residual:[0,1,2,3,0],sse:14,objective:14},result:{errors:{'site:1:cs':.012},iterations:12,converged:true,termination:'Converged on objective',free_parameters:5,dof:20,rank:5,reduced_objective:.7,warnings:['Inspect parameter bounds.']},options:defaultFigureOptions(project),projectName:'Project <A>',spectrumName:'Spectrum A',modelName:'Model B',application:'MossA test',createdAt:new Date('2026-11-07T08:00:00Z')};
}
function docs(input:FitReportInput){return renderFitReport(input).map(svg=>new JSDOM(svg,{contentType:'image/svg+xml'}).window.document);}
function content(input:FitReportInput){return docs(input).map(d=>[...d.querySelectorAll('text')].map(n=>n.textContent).join(' ')).join(' ');}

test('a typical two-site fit fits on one A4 page',()=>{const f=fixture();f.result.warnings=[];assert.equal(docs(f).length,1);});

test('report resolves linked values, preserves uncertainty states and figure choices, and never mutates the fit',()=>{
 const f=fixture();f.project.sites[1].params.cs.link={target:'site:0:cs',factor:2};f.options.sites[1].visible=false;f.options.sites[0].name='Iron <metal>';f.options.sites[0].color='#123456';f.options.sign='model-data';f.options.range=[-1,1];
 const before=JSON.stringify(f),pages=docs(f),text=content(f);
 assert.match(text,/0.246\(12\) \*/);assert.match(text,/fixed/);assert.match(text,/\(—\)/);assert.match(text,/Inspect parameter bounds/);assert.match(text,/including sites hidden/);assert.match(text,/Iron <metal>/);assert.match(text,/Link: site:1:cs = 2 × site:0:cs/);
 assert.equal(pages[0].querySelectorAll('[data-point="observed"]').length,3);assert.equal(pages[0].querySelectorAll('[data-site-index]').length,1);
 assert.equal(pages[0].querySelector('[data-site-fill="0"]')?.getAttribute('fill'),'#123456');
 assert.match(text,/model - data/);assert.equal(JSON.stringify(f),before);
});

test('every applicable site parameter stays in the same table row, including mixing and line ratios',()=>{
 const f=fixture();f.project.sites[0].profile='PseudoVoigt';f.result.errors['site:0:mix']=.0081;
 const pages=docs(f),row=pages.flatMap(d=>[...d.querySelectorAll('[data-report-table="Site parameters"][data-report-row="0"]')]).map(n=>n.textContent).join(' ');
 for(const key of ['cs','fwhm','intensity','qs','bhf','a12','a13','mix']) {
  const value=f.project.sites[0].params[key].value.toString();assert.ok(row.includes(value),`${key} is missing from the site row`);
 }
 assert.ok(pages.some(d=>[...d.querySelectorAll('[data-report-table="Site parameters"][data-report-row="0"] text')].some(n=>n.textContent==='0.5000(81)')),'The mixing value and std must remain readable together');
 assert.doesNotMatch(content(f),/Additional site parameters/);
 const headers=content(f);for(const label of ['Intensity (raw)','A12','A13','Lorentz mix'])assert.ok(headers.includes(label));
});

test('report includes xVBF distribution components, raw intensity, backgrounds, and transmission source settings',()=>{
 const f=fixture();f.project.mode='transmission';f.project.sites[0].xvbf={delta:parameter(.2),cs:[{center:parameter(.3),width:parameter(.1),weight:parameter(1,false)}],qs:[{center:parameter(1.2),width:parameter(.2),weight:parameter(1,false)}]};
 f.project.sites[0].kind='Doublet';f.evaluation.parameters['site:0:cs']=.31;f.result.errors['site:0:cs']=.01;
 const text=content(f);
 assert.match(text,/CS distribution 1 center/);assert.match(text,/QS distribution 1 width/);assert.match(text,/coupling delta/);assert.match(text,/0.310\(10\)/);assert.match(text,/Intensity \(raw\)/);assert.match(text,/Background b0/);assert.match(text,/absorber-intensity fractions/);assert.match(text,/Source: Lorentzian/);
});

test('large reports paginate all sites and warnings without entering the footer or shrinking text',()=>{
 const f=fixture();f.project.sites=Array.from({length:40},(_,i)=>({...newSite(i),name:`Site ${i+1} ${'longlabel'.repeat(12)}`}));
 f.evaluation.components=f.project.sites.map(()=>[0,1,2,1,0]);f.options=defaultFigureOptions(f.project);f.options.legend='none';f.result.warnings=Array.from({length:35},(_,i)=>`Warning ${i+1}: ${'Inspect this fit. '.repeat(10)}`);
 const pages=docs(f),text=content(f);assert.ok(pages.length>3);assert.match(text,/40\. Site 40/);assert.match(text,/Warning 35:/);
 pages.forEach((doc,i)=>{assert.ok(doc.documentElement.textContent?.includes(`${i+1} / ${pages.length}`));
  for(const n of doc.documentElement.querySelector(':scope > g')!.querySelectorAll(':scope > text, :scope > g[data-report-row] text')) {const y=Number(n.getAttribute('y'));assert.ok(y<=280||y===290,`${y} enters footer`);assert.ok(Number(n.getAttribute('font-size'))>=2.3);}
 });
});

test('background-only fits export with their fit status and no fictitious site rows',()=>{
 const f=fixture();f.project.sites=[];f.evaluation.components=[];f.options=defaultFigureOptions(f.project);f.result.converged=false;f.velocityReversed=true;
 assert.match(content(f),/Background-only model; no sites/);assert.match(content(f),/Stopped/);assert.match(content(f),/Background b0/);assert.match(content(f),/Velocity axis reversed/);
});
