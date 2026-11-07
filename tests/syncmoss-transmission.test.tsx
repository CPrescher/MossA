import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import init, { evaluate_json } from '../src/wasm/mossa_core.js';
import type { Project } from '../src/types';
await init({ module_or_path: readFileSync(new URL('../src/wasm/mossa_core_bg.wasm', import.meta.url)) });
const fixture = JSON.parse(readFileSync(new URL('./fixtures/syncmoss-sms-transmission.json', import.meta.url), 'utf8'));
const p: Project = fixture.project;
const evaluate = (project: Project) => JSON.parse(evaluate_json(JSON.stringify(project))).y as number[];

test('full transmission matches actual pinned SYNCmoss output at all measured SMS-standard velocities', () => {
  assert.equal(fixture.upstream_commit, 'b712fbc1521004a47409b964b9ab012fe5c5e255');
  assert.equal(fixture.reference_nodes, 2048);
  assert.equal(p.spectrum.x.length, 511);
  assert.equal(p.source_gaussians?.length, 3);
  const actual = evaluate(p), baseline = p.background[0].value;
  const max = Math.max(...actual.map((v, i) => Math.abs(v - fixture.reference_y[i])));
  assert.ok(max / baseline < fixture.max_relative_tolerance, `maximum engine difference ${max} counts`);
});

test('the pinned measured spectrum and source conversion retain provenance and asymmetry handedness', () => {
  const bytes = readFileSync(new URL('../validation-data/syncmoss-sms/inputs/Standard_SMS.dat', import.meta.url));
  const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(blob, '7e1b8d1bd0b0fbc4447e2e3a6b8adfaf24c0eafd');
  const source = fixture.upstream_source;
  p.source_gaussians!.forEach((g, i) => {
    const [a, mu, c] = source.raw_INSexp.slice(3 * i, 3 * i + 3);
    assert.equal(g.center, -mu);
    assert.ok(Math.abs(g.fwhm - 2 * Math.sqrt(2 * Math.log(2)) * (a * a + .098 / 2)) < 1e-15);
    assert.equal(g.weight, c * c);
  });
  const wrong = structuredClone(p);
  wrong.source_gaussians!.forEach(g => g.center = -g.center);
  const difference = Math.max(...evaluate(wrong).map((v,i) => Math.abs(v - fixture.reference_y[i])));
  assert.ok(difference > 10, 'a reflected asymmetric source must fail the comparison');
});
