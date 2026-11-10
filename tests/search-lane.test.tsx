import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SearchLane} from '../src/search-lane';
import {Engine} from '../src/engine';
import {demo} from '../src/demo';

test('search helper preserves progress/result routing and rejects active work on failure',async()=>{
 const sent:any[]=[],progress:any[]=[],lane=new SearchLane(m=>sent.push(m));
 lane.receive({kind:'ready'});await lane.ready;
 const p=lane.fit(demo(),s=>progress.push(s));await Promise.resolve();
 const id=sent[0].id;
 lane.receive({kind:'progress',id,progress:{iteration:3}});
 lane.receive({kind:'result',id,result:{complete:true}});
 assert.deepEqual(await p,{complete:true});assert.deepEqual(progress,[{iteration:3}]);
 const pending=lane.fit(demo());await Promise.resolve();lane.fail('terminated');
 await assert.rejects(pending,/terminated/);await assert.rejects(lane.fit(demo()),/unavailable/);
 lane.receive({kind:'result',id:sent.at(-1).id,result:{stale:true}});
});
test('search helper startup and send failures settle instead of hanging',async()=>{
 const unavailable=new SearchLane(()=>{}),startup=assert.rejects(unavailable.ready,/startup/);
 unavailable.receive({kind:'fatal',error:'startup'});await startup;
 const broken=new SearchLane(()=>{throw new Error('send failed');});broken.receive({kind:'ready'});
 await assert.rejects(broken.fit(demo()),/send failed/);broken.fail('closed');
});
test('Engine owns helper termination, rejects pending fits, and ignores messages from replaced workers',async()=>{
 class FakeWorker {
  static all:FakeWorker[]=[];onmessage:any;onerror:any;messages:any[]=[];stopped=false;
  constructor(){FakeWorker.all.push(this);}
  postMessage(m:any){this.messages.push(m);}
  terminate(){this.stopped=true;}
  emit(data:any){this.onmessage?.({data});}
 }
 const old=globalThis.Worker;(globalThis as any).Worker=FakeWorker;
 try{
  const engine=new Engine(()=>{},()=>{}),main=FakeWorker.all[0];
  main.emit({type:'search-worker',generation:1});const first=FakeWorker.all[1];
  first.emit({kind:'ready'});assert.equal(main.messages.at(-1).generation,1);
  main.emit({type:'search-send',generation:1,message:{id:7}});assert.deepEqual(first.messages,[{id:7}]);
  main.emit({type:'search-worker',generation:2});assert.equal(first.stopped,true);const second=FakeWorker.all[2];
  const length=main.messages.length;first.emit({kind:'result',id:7});assert.equal(main.messages.length,length);
  main.emit({type:'search-send',generation:1,message:{id:8}});assert.deepEqual(second.messages,[]);
  const fit=engine.request('fit',demo());engine.stop();await assert.rejects(fit,/canceled/);
  assert.ok(main.stopped&&second.stopped);assert.equal(engine.searchWorker,null);
 }finally{globalThis.Worker=old;}
});
