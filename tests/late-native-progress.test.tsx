import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { FitResult, FitProgress, Project } from '../src/types';

// Native channels can deliver a queued progress callback after the fit RPC
// resolves. Unlike Worker replies, the channel outlives the request promise.
const stub = `
function evaluate(p) { return {parameters:{},y:p.spectrum.y,background:p.spectrum.y.map(()=>p.background[0].value),components:p.sites.map(()=>p.spectrum.y.map(()=>0)),residual:p.spectrum.y.map(()=>0),sse:12,objective:12}; }
export class Engine {
 constructor(ready) { queueMicrotask(ready); }
 request(method,project,progress) {
  if(method==='evaluate') return Promise.resolve({result:evaluate(project),elapsed:1});
  return new Promise(resolve=>{globalThis.__lateNativeFit={project:structuredClone(project),progress,resolve};});
 }
 stop() {}
}`;
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier.endsWith('.css')) return {url:'data:text/javascript,export default {}',shortCircuit:true};
  if (specifier === './engine' && context.parentURL?.includes('/src/App.tsx'))
    return {url:`data:text/javascript;base64,${Buffer.from(stub).toString('base64')}`,shortCircuit:true};
  return next(specifier,context);
} });
const {default:App}=await import('../src/App');
hooks.deregister();

test('late native progress cannot replace completed fit values or pair stale values with final std',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true});
 const originals=new Map<string,unknown>();
 const globals={window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,
  HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,Element:dom.window.Element,MutationObserver:dom.window.MutationObserver,
  requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),
  ResizeObserver:class{observe(){}disconnect(){}},IS_REACT_ACT_ENVIRONMENT:true};
 for(const [key,value] of Object.entries(globals)){originals.set(key,(globalThis as any)[key]);(globalThis as any)[key]=value;}
 window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}} as any);
 const root=createRoot(document.getElementById('root')!);
 const value=()=>Number(document.querySelector<HTMLInputElement>('[aria-label="CS value"]')!.value);
 try {
  await act(async()=>{root.render(<App/>);});
  await act(()=>new Promise(resolve=>setTimeout(resolve,150)));
  const fit=document.querySelector<HTMLButtonElement>('.fit-button')!;
  assert.equal(fit.disabled,false);
  await act(async()=>fit.click());
  const job=(globalThis as any).__lateNativeFit as {project:Project;progress:(p:FitProgress)=>void;resolve:(r:unknown)=>void};
  const fitted=structuredClone(job.project);fitted.sites[0].params.cs.value=.12;
  const evaluation={parameters:{},y:fitted.spectrum.y,background:fitted.spectrum.y,components:fitted.sites.map(()=>fitted.spectrum.y),residual:fitted.spectrum.y.map(()=>0),sse:12,objective:12};
  const result:FitResult={project:fitted,evaluation,errors:{'site:0:cs':.01},iterations:8,converged:true,termination:'Converged',free_parameters:1,dof:fitted.spectrum.y.length-1,rank:1,reduced_objective:.1,warnings:[]};
  await act(async()=>job.resolve({result,elapsed:20}));
  assert.equal(value(),.12);
  const stale=structuredClone(job.project);stale.sites[0].params.cs.value=-.5;
  await act(async()=>job.progress({project:stale,evaluation,iteration:1,elapsed_ms:1}));
  assert.equal(value(),.12,'completed values must remain visible after a delayed progress callback');
  assert.match(document.querySelector('.results-note')!.textContent!,/1 std/);
  await act(async()=>window.dispatchEvent(new dom.window.Event('pagehide')));
  const saved=JSON.parse(localStorage.getItem('mossa.workspace.v1')!);
  assert.equal(saved.workspace.spectra[0].models[0].project.sites[0].params.cs.value,.12);
 } finally {
  await act(async()=>root.unmount());dom.window.close();delete (globalThis as any).__lateNativeFit;
  for(const [key,value]of originals)(globalThis as any)[key]=value;
 }
});
