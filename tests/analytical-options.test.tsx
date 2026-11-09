import {test} from 'node:test';
import assert from 'node:assert/strict';
import {usesAnalyticalDerivatives} from '../src/analytical-derivatives';
import {demo} from '../src/demo';
import {decodeSession,defaultLayout} from '../src/session';
import {createProjectFile,openProjectFile} from '../src/projectFile';
import type {Snapshot} from '../src/session';
test('analytical option follows whole-model support, including source calibration and distributions',()=>{
 const p=demo();assert.equal(usesAnalyticalDerivatives(p),true);p.derivative_method='numerical';assert.equal(usesAnalyticalDerivatives(p),false);delete p.derivative_method;p.mode='thin';assert.equal(usesAnalyticalDerivatives(p),true);
 assert.equal(usesAnalyticalDerivatives(p,true),true);p.mode='transmission';assert.equal(usesAnalyticalDerivatives(p),true);
 p.mode='thin';p.sites[0].xvbf={} as any;assert.equal(usesAnalyticalDerivatives(p),true);
});
test('derivative selection survives session and portable project saving and rejects invalid values',async()=>{
 const project=demo();project.derivative_method='analytical';
 const snapshot:Snapshot={project,filename:'Exact thin derivatives',raw:null,cal:{max:10,shift:0,folding:false,sinusoidal:false,center:256.5},selected:0,fit:null};
 const session={version:1,snapshot,layout:defaultLayout,fit:null,elapsed:null};
 assert.equal(decodeSession(JSON.stringify(session)).snapshot.project.derivative_method,'analytical');
 const file=await createProjectFile(snapshot,{});
 const opened=await openProjectFile(file,snapshot.cal,'exact.mossa',async()=>({parameters:{},y:[],background:[],components:[],residual:[],sse:0,objective:0}));
 assert.equal(opened.snapshot.project.derivative_method,'analytical');
 (project as any).derivative_method='unknown';assert.throws(()=>decodeSession(JSON.stringify(session)),/derivative method/);
 await assert.rejects(openProjectFile({...file,project},snapshot.cal,'bad',async()=>{throw new Error('should reject before evaluate');}),/derivative method/);
});
