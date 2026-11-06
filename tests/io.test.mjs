import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSpectrum, foldCounts, calibrateCounts, validateProjectFile } from '../src/io.mjs';
test('two-column import accepts headers, comments, scientific notation, and descending data', () => {
  const s = parseSpectrum('velocity,counts\n# data\n' + Array.from({ length: 8 }, (_, i) => `${7 - i},1e5`).join('\n')).spectrum;
  assert.deepEqual(s.x, [0,1,2,3,4,5,6,7]); assert.equal(s.y[0], 100000);
});
test('malformed rows and duplicate coordinates are errors, not silently skipped', () => {
  assert.throws(() => parseSpectrum('0 1\n1 bad')); assert.throws(() => parseSpectrum(Array.from({ length: 8 }, () => '1 2').join('\n')));
});
test('fold.m integer and half-integer conventions are preserved', () => {
  const d = Array.from({ length: 16 }, (_, i) => i + 1);
  assert.deepEqual(foldCounts(d, 8.5), [17,17,17,17,17,17,17,17]);
  assert.deepEqual(foldCounts(d, 8), [16,16,16,16,16,16,16,16]);
  assert.throws(() => foldCounts(d, 8.2)); assert.throws(() => foldCounts(d.slice(1), 8));
});
test('channel calibration reproduces linear/sinusoidal endpoint shifts', () => {
  const d = Array(16).fill(10);
  for (const sin of [false, true]) { const s = calibrateCounts(d, 10, .2, sin, 8.5); assert.equal(s.x[0], -10.2); assert.equal(s.x.at(-1), 9.8); assert.equal(s.y[0], 20); }
});
test('project versions are checked', () => { assert.throws(() => validateProjectFile({ format:'mossa-project', version:2 })); });
