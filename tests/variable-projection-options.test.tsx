import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demo} from '../src/demo';
import {decodeSession,defaultLayout} from '../src/session';
import {createProjectFile,openProjectFile} from '../src/projectFile';
import type {Snapshot} from '../src/session';
test('thin solver survives session/project round trips and rejects invalid selections',async()=>{
 const project=demo();project.mode='thin';project.thin_solver='variable_projection';
 const snapshot:Snapshot={project,filename:'Projected thin fit',raw:null,cal:{max:10,shift:0,folding:false,sinusoidal:false,center:256.5},selected:0,fit:null};
 const session={version:1,snapshot,layout:defaultLayout,fit:null,elapsed:null};
 for(const choice of ['variable_projection','joint',undefined] as const){
  project.thin_solver=choice;
  assert.equal(decodeSession(JSON.stringify(session)).snapshot.project.thin_solver,choice);
  const file=await createProjectFile(snapshot,{}),opened=await openProjectFile(file,snapshot.cal,'thin.mossa',async()=>({parameters:{},y:[],background:[],components:[],residual:[],sse:0,objective:0}));
  assert.equal(opened.snapshot.project.thin_solver,choice);
 }
 const file=await createProjectFile(snapshot,{});
 (project as any).thin_solver='bad';assert.throws(()=>decodeSession(JSON.stringify(session)),/thin solver/);
 await assert.rejects(openProjectFile({...file,project},snapshot.cal,'bad',async()=>{throw Error('must reject before evaluate');}),/thin solver/);
});
