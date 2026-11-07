import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeSession, readSession, writeSession, SESSION_KEY, defaultLayout, summarizeFit, type Session } from '../src/session';
import { demo } from '../src/demo';
import { nuclearConstants } from '../src/nuclear-constants.mjs';
export function fixture(): Session { return { version: 1, snapshot: { project: demo(nuclearConstants()), raw: Array.from({length:16},(_,i)=>i), cal:{max:10,shift:.12,folding:true,sinusoidal:false,center:8.5},filename:'my spectrum',selected:1 }, layout: {...defaultLayout,resultsHeight:284,sitesHeight:156,tab:'Bnds'},fit:null,elapsed:null }; }
test('local session round-trips full-precision data, preprocessing, selection, and layout', () => {
  const session=fixture(); session.snapshot.project.sites[1].params.cs.value=.123456789123;
  const memory=new Map<string,string>(), store={getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,value:string)=>{memory.set(key,value);}};
  assert.equal(writeSession(session,store),true); assert.ok(memory.has(SESSION_KEY));
  assert.deepEqual(readSession(store),{session,error:''});
  session.snapshot.project.sites=[];session.snapshot.selected=0;
  assert.equal(decodeSession(JSON.stringify(session)).snapshot.project.sites.length,0);
});
test('session decoding rejects malformed data and unsupported versions and sanitizes layout', () => {
  assert.throws(()=>decodeSession('{'));
  const saved=fixture(); saved.version=99 as 1; assert.throws(()=>decodeSession(JSON.stringify(saved)));
  saved.version=1;saved.snapshot.project.spectrum.y.pop();assert.throws(()=>decodeSession(JSON.stringify(saved)));
  const clean=fixture();clean.layout={resultsHeight:-5,sitesHeight:99999,tab:'missing',optionsOpen:false};clean.snapshot.selected=100;
  const restored=decodeSession(JSON.stringify(clean));assert.equal(restored.layout.resultsHeight,152);assert.equal(restored.layout.sitesHeight,300);assert.equal(restored.layout.tab,'Gen');assert.equal(restored.snapshot.selected,1);
});
test('missing or unavailable storage is handled without crashing or losing manual-save access', () => {
  const store={getItem:()=>null,setItem:()=>{throw new Error('Quota exceeded');}};
  assert.deepEqual(readSession(store),{session:null,error:''});assert.equal(writeSession(fixture(),store),false);
  assert.ok(readSession({getItem:()=>'{bad',setItem:()=>{}}).error);
});
test('fit summary retains results and uncertainties without duplicating spectrum or model arrays', () => {
  const fit={project:demo(),evaluation:{y:[1,2]},errors:{'site:0:cs':.000123},iterations:8,converged:true,termination:'Converged',free_parameters:8,dof:504,rank:8,reduced_objective:1.2,warnings:[]} as any;
  const summary=summarizeFit(fit)!;assert.equal('project' in summary,false);assert.equal('evaluation' in summary,false);
  const session=fixture();session.fit=summary;session.elapsed=90;
  const restored=decodeSession(JSON.stringify(session));assert.deepEqual(restored.fit,summary);assert.equal(restored.elapsed,90);
  session.fit!.intensity_fractions=[{value:75,error:.25},{value:25,error:.25}];
  assert.deepEqual(decodeSession(JSON.stringify(session)).fit!.intensity_fractions,session.fit!.intensity_fractions);
});
test('autosave writes only the active fit once while history snapshots can carry their own fit metadata',()=>{
  const session=fixture();const fit={errors:{'site:0:cs':.01},iterations:2,converged:true,termination:'Converged',rank:1,free_parameters:1,dof:511,reduced_objective:1,warnings:[]};
  session.fit=fit;session.elapsed=12;session.snapshot.fit=fit;session.snapshot.fitElapsed=12;
  let text='';assert.equal(writeSession(session,{getItem:()=>null,setItem:(_key,value)=>{text=value;}}),true);
  const parsed=JSON.parse(text);assert.equal('fit' in parsed.snapshot,false);assert.equal('fitElapsed' in parsed.snapshot,false);assert.deepEqual(parsed.fit,fit);
  const restored=decodeSession(text);assert.deepEqual(restored.fit,fit);assert.equal(restored.elapsed,12);
});

test('site colors round-trip with saved results and invalid color metadata is rejected',()=>{
 const s=fixture();s.snapshot.project.sites[0].color='#6633aa';const loaded=decodeSession(JSON.stringify(s));assert.equal(loaded.snapshot.project.sites[0].color,'#6633aa');s.snapshot.project.sites[0].color='url(invalid)';assert.throws(()=>decodeSession(JSON.stringify(s)),/Invalid saved model/);
});
