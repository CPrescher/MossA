import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NativeSession, type NativeTransport } from '../src/native-session';
import { Engine } from '../src/native-engine';
import { demo } from '../src/demo';

test('stopping during registration cannot start late native CPU work or publish readiness', async () => {
  const calls:string[]=[];let register:()=>void;
  const registration=new Promise<void>(resolve=>{register=resolve;});
  const bridge:NativeTransport={invoke:async <T,>(command:string) => {calls.push(command);if(command==='native_compute_start')await registration;return undefined as T;},channel:()=>{throw new Error('No progress channel should be opened');}};
  let ready=0,errors=0;const engine=new Engine(()=>ready++,()=>errors++,bridge);
  const queued=engine.request('fit',demo());engine.stop();await assert.rejects(queued,/canceled/);
  register!();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(ready,0);assert.equal(errors,0);assert.deepEqual(calls,['native_compute_start','native_compute_cancel']);
});

test('stopping rejects a running invoke immediately and ignores its late result and progress', async () => {
  let finish:(value:any)=>void;let publish:(value:any)=>void;const calls:string[]=[];
  const bridge:NativeTransport={invoke:async <T,>(command:string) => {calls.push(command);if(command==='native_compute')return await new Promise(resolve=>{finish=resolve;}) as T;return undefined as T;},channel:callback=>{publish=callback;return 'test-channel';}};
  const session=new NativeSession(bridge);let progress=0;
  const running=session.compute('fit',demo(),()=>progress++);await new Promise(resolve=>setTimeout(resolve,0));
  session.stop();await assert.rejects(running,/canceled/);publish!({});finish!({result:{},elapsed:1});await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(progress,0);assert.equal(calls.filter(c=>c==='native_compute_cancel').length,1);session.stop();
});
