import {test} from 'node:test';
import assert from 'node:assert/strict';
import {niceTicks,formatTick} from '../src/axes.mjs';
test('count axes use rounded intervals rather than interpolated endpoints',()=>{const t=niceTicks(98517,100179,5);assert.equal(t.step,500);assert.deepEqual(t.values,[99000,99500,100000]);assert.equal(formatTick(99500,t.step),'99,500');});
test('velocity ticks keep meaningful decimal places without floating point artifacts',()=>{const t=niceTicks(-.87,1.43,5);assert.deepEqual(t.values,[-.5,0,.5,1]);assert.equal(formatTick(-0,t.step),'0.0');assert.equal(formatTick(.3,.1),'0.3');assert.equal(formatTick(.25,.25),'0.25');});
test('very large and small axes have compact scientific labels',()=>{assert.equal(formatTick(1e8,1e7),'1.0e8');assert.equal(formatTick(.0002,.0001),'2e-4');assert.equal(niceTicks(0,0).values.length,0);});
