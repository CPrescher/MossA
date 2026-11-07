import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSpectrum, validImportInfo } from '../src/io.mjs';

const spec = (body, declaration = '8 0 7 1') => `#F supplied-name.mca\n#@MCA %4C\n#@CHANN ${declaration}\n#@CALIB 0 1 0\n@A ${body}`;
test('SPEC MCA flattens continued rows in acquisition order and retains source headers', () => {
  const parsed = parseSpectrum(spec('10 11 12 13 \\\n14 15 16 17\n'));
  assert.deepEqual(parsed.raw, [10,11,12,13,14,15,16,17]);
  assert.equal(parsed.spectrum, undefined);
  assert.equal(parsed.importInfo.format, 'spec-mca');
  assert.equal(parsed.importInfo.channels, 8);
  assert.ok(parsed.importInfo.headers.includes('#F supplied-name.mca'));
  assert.match(parsed.notice, /not used as a velocity scale/);
  assert.equal(validImportInfo(parsed.importInfo), true);
});
test('SPEC MCA rejects truncated, extra, malformed, negative, and multiple blocks', () => {
  for (const body of ['1 2 3', '1 2 3 4 5 6 7 8 9', '1 2 3 4 bad 6 7 8', '1 2 3 4 -1 6 7 8', '1 2 3 4 NaN 6 7 8', '1 2 3 4 5 6 7 8\n@A 1 2 3 4 5 6 7 8']) assert.throws(() => parseSpectrum(spec(body)));
  assert.throws(() => parseSpectrum(spec('1 2 3 4 5 6 7 8', '8 0 8 1')), /declaration/);
  assert.throws(() => parseSpectrum('#@MCA %16C\n#@CHANN 8 0 7 1\n1 2 3 4 5 6 7 8'), /@A/);
  assert.throws(() => parseSpectrum(spec('1 2 3 4 5 6 7 8').replace('#@CHANN 8 0 7 1\n','')), /#@CHANN/);
});
test('SMS five-column references select recorded total counts, with explicit provenance', () => {
  const rows = Array.from({length:8},(_,i) => [7-i, 21+i, 1-i, 11, 10+i]);
  const parsed = parseSpectrum(rows.map(r=>r.join(' ')).join('\n'));
  assert.deepEqual(parsed.spectrum.x, [0,1,2,3,4,5,6,7]);
  assert.deepEqual(parsed.spectrum.y, rows.map(r=>r[1]).reverse());
  assert.deepEqual(parsed.importInfo.columns, [1,2]);
  assert.match(parsed.notice, /column 2 \(total counts\)/);
  assert.equal(validImportInfo(parsed.importInfo), true);
});
test('SMS layout recognition rejects unrelated tables and inconsistent directional counts', () => {
  const rows = Array.from({length:8},(_,i) => `${i} 21 1 11 10`);
  assert.throws(()=>parseSpectrum(rows.join('\n').replace('21 1 11 10','22 1 11 10')), /Unrecognized/);
  assert.throws(()=>parseSpectrum(rows.join('\n').replace('21 1 11 10','21 2 11 10')), /Unrecognized/);
  assert.throws(()=>parseSpectrum(Array(8).fill('1 21 1 11 10').join('\n')), /Duplicate/);
  assert.equal(validImportInfo({format:'sms-five-column',channels:8,columns:[2,3]}), false);
});
test('original SMS teaching measurements import without conversion or losing the conflicting header', () => {
  const load=name=>parseSpectrum(readFileSync(new URL(`../manual/public/tutorial-data/sms/${name}`,import.meta.url),'utf8'));
  const sample=load('Fe7C3_01GPa.mca');
  assert.equal(sample.raw.length,1024);
  assert.equal(sample.raw.reduce((a,b)=>a+b,0),2211871);
  assert.deepEqual(sample.raw.slice(0,4),[2430,2368,2482,2423]);
  assert.deepEqual(sample.raw.slice(-4),[2388,2378,2292,2372]);
  assert.match(sample.importInfo.headers[0],/Fe7C3_b_02GPa\.mca/);
  assert.equal(load('Iron foil calibration.txt').raw.length,1024);
  for(const name of ['singleLineBefore.dat','singleLineAfter.dat']) {
    const reference=load(name);
    assert.equal(reference.spectrum.x.length,512);
    assert.equal(reference.importInfo.format,'sms-five-column');
    assert.deepEqual(reference.importInfo.columns,[1,2]);
  }
  assert.equal(load('singleLineBefore.dat').spectrum.y[0],4171);
});
