import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyReducer, HISTORY_LIMIT, type History } from '../src/history';
import { demo } from '../src/demo';
import type { Snapshot, FitSummary } from '../src/session';

test('snapshot history restores data, parameters, bounds, links, and import metadata', () => {
  const initial = { project: demo(), filename: 'before', raw: [1,2,3], selected: 0 };
  let history: History<typeof initial> = { past: [], present: initial, future: [] };
  const next = structuredClone(initial);
  next.project.spectrum.y[0] = 123;
  next.project.sites[0].params.cs = { value: .123456789, fit: false, min: -.2, max: .5, link: { target: 'site:1:cs', factor: 2 } };
  next.filename = 'imported'; next.raw = [4,5,6]; next.selected = 1;
  history = historyReducer(history, { type: 'set', value: next, record: true });
  history = historyReducer(history, { type: 'undo' }); assert.deepEqual(history.present, initial);
  history = historyReducer(history, { type: 'redo' }); assert.deepEqual(history.present, next);
  assert.equal(initial.project.sites[0].params.cs.link, null);
});
test('history retains 50 actions, clears redo on a new edit, and ignores no-op edits', () => {
  let history: History<number> = { past: [], present: 0, future: [] };
  for (let i = 1; i <= 60; i++) history = historyReducer(history, { type: 'set', value: i, record: true });
  assert.equal(history.past.length, HISTORY_LIMIT);
  for (let i = 0; i < 55; i++) history = historyReducer(history, { type: 'undo' });
  assert.equal(history.present, 10); assert.equal(history.future.length, 50);
  history = historyReducer(history, { type: 'set', value: 10, record: true }); assert.equal(history.future.length, 50);
  history = historyReducer(history, { type: 'set', value: 100, record: true }); assert.equal(history.future.length, 0);
  history = historyReducer(history, { type: 'redo' }); assert.equal(history.present, 100);
});
function fittedSnapshot(): Snapshot {
  return {project:demo(),filename:'Fitted spectrum',raw:null,cal:{max:10,shift:0,folding:true,sinusoidal:false,center:256.5},selected:1,fitElapsed:92,fit:{errors:{'site:0:cs':.00033,'site:1:intensity':3.8},intensity_fractions:[{value:75,error:.1},{value:25,error:.1}],iterations:8,converged:true,termination:'Converged',rank:8,free_parameters:8,dof:504,reduced_objective:82.1,warnings:['Retained diagnostic']}};
}
test('undo and redo restore matching fit errors, percentages, diagnostics, and elapsed time after edits and deletion',()=>{
  const fitted=fittedSnapshot();let history:History<Snapshot>={past:[],present:fitted,future:[]};
  const changed:Snapshot={...fitted,project:structuredClone(fitted.project),fit:null,fitElapsed:null};changed.project.sites[0].params.cs.value=.8;
  history=historyReducer(history,{type:'set',value:changed,record:true});assert.equal(history.present.fit,null);
  history=historyReducer(history,{type:'undo'});assert.deepEqual(history.present,fitted);assert.equal(history.present.fit!.errors['site:0:cs'],.00033);
  history=historyReducer(history,{type:'redo'});assert.deepEqual(history.present,changed);
  history=historyReducer(history,{type:'undo'});
  const removed:Snapshot={...fitted,project:{...fitted.project,sites:[]},fit:null,fitElapsed:null,selected:0};
  history=historyReducer(history,{type:'set',value:removed,record:true});history=historyReducer(history,{type:'undo'});
  assert.equal(history.present.project.sites.length,2);assert.deepEqual(history.present.fit!.intensity_fractions,fitted.fit!.intensity_fractions);assert.deepEqual(history.present.fit!.warnings,['Retained diagnostic']);assert.equal(history.present.fitElapsed,92);
  history=historyReducer(history,{type:'redo'});assert.equal(history.present.project.sites.length,0);assert.equal(history.present.fit,null);
});
test('completed fits are single history steps, including a refit with unchanged parameters; names and selection retain fit metadata',()=>{
  const fitted=fittedSnapshot(),initial:Snapshot={...fitted,fit:null,fitElapsed:null};let history:History<Snapshot>={past:[],present:initial,future:[]};
  history=historyReducer(history,{type:'set',value:fitted,record:true});assert.equal(history.past.length,1);
  const refit:Snapshot={...fitted,fit:{...fitted.fit!,errors:{'site:0:cs':.00044},iterations:1,termination:'Refit'} as FitSummary,fitElapsed:15};
  history=historyReducer(history,{type:'set',value:refit,record:true});history=historyReducer(history,{type:'undo'});assert.deepEqual(history.present.fit,fitted.fit);assert.equal(history.present.fitElapsed,92);
  history=historyReducer(history,{type:'redo'});assert.deepEqual(history.present.fit,refit.fit);assert.equal(history.present.fitElapsed,15);
  const renamed:Snapshot={...refit,project:structuredClone(refit.project)};renamed.project.sites[0].name='New name';
  history=historyReducer(history,{type:'set',value:renamed,record:true});history=historyReducer(history,{type:'set',value:{...history.present,selected:0},record:false});assert.equal(history.present.fit,refit.fit);
  history=historyReducer(history,{type:'undo'});assert.deepEqual(history.present.fit,refit.fit);
});
