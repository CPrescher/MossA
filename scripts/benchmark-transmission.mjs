// Freeze observations/starts with the original build, then compare each optimization.
// node scripts/benchmark-transmission.mjs --record --output baseline.json
// node scripts/benchmark-transmission.mjs --wasm-dir path --output stage.json
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import os from 'node:os';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const directory = resolve(option('--wasm-dir', 'src/wasm'));
const module = await import(pathToFileURL(resolve(directory, 'mossa_core.js')));
const bytes = readFileSync(resolve(directory, 'mossa_core_bg.wasm'));
await module.default({ module_or_path: bytes });
const fixturePath = option('--fixture', 'tests/fixtures/transmission-performance.json');
const repetitions = Number(option('--repetitions', '5'));
assert.ok(Number.isInteger(repetitions) && repetitions > 0);
const param = (value, fit = true, min = null, max = null) => ({ value, fit, min, max, link: null });
const site = (kind, cs, intensity, profile = 'Lorentzian') => ({ name: kind, kind, profile, params: {
  cs: param(cs, true, -3, 3), fwhm: param(.28, true, .03, 2), intensity: param(intensity, true, 0),
  qs: param(1.3, kind === 'Doublet', -4, 4), bhf: param(32, kind === 'Sextet', 0, 60),
  a12: param(kind === 'Doublet' ? .5 : 1.5, false), a13: param(3, false), mix: param(.35, profile === 'PseudoVoigt', 0, 1),
} });
function project(sites) {
  const x = Array.from({ length: 256 }, (_, i) => -8.013 + 16.027 * i / 255);
  return { spectrum: { x, y: x.map(() => 20000) }, sites, background: [param(20000), param(-.7, false), param(.12, false)],
    mode: 'transmission', source_fwhm: .097, source_squared: false, weighting: 'unweighted', max_iterations: 250 };
}
const evaluate = (c, p = c.project) => JSON.parse(module[c.calibration ? 'evaluate_source_json' : 'evaluate_json'](JSON.stringify(p)));
// This historical benchmark isolates numerical-kernel changes. New analytical
// fits have separate scientific-equivalence and end-to-end timing benchmarks.
const fit = c => {
  const result = JSON.parse(module[c.calibration ? 'fit_source_json' : 'fit_json'](JSON.stringify({ ...c.project, derivative_method: 'numerical' })));
  if (c.project.derivative_method === undefined) delete result.project.derivative_method;
  return result;
};
function makeCases() {
  const cases = [];
  for (const squared of [false, true]) {
    cases.push({ id: `singlet-${squared ? 'squared' : 'lorentzian'}-source`, project: { ...project([site('Singlet', .23, .3)]), source_squared: squared } });
    const p = project([site('Sextet', .18, .5), site('Sextet', .47, .35), site('Doublet', -.15, .15)]);
    p.sites[1].params.bhf.value = 46;
    cases.push({ id: `three-sites-${squared ? 'squared' : 'lorentzian'}-source`, project: { ...p, source_squared: squared } });
  }
  cases.push({ id: 'mixed-absorber-profiles-counts', project: { ...project([site('Doublet', -.2, .3, 'LorSquared'), site('Singlet', .5, .15, 'PseudoVoigt'), site('Singlet', -1, .12, 'Gaussian')]), weighting: 'counts', source_squared: true } });
  cases.push({ id: 'asymmetric-gaussian-source', project: { ...project([site('Doublet', .15, .4)]), source_gaussians: [{ center: 0, fwhm: .21, weight: 1 }, { center: .34, fwhm: .37, weight: .28 }] } });
  const xv = project([site('Doublet', .2, .5)]);
  xv.sites[0].xvbf = { cs: [{ center: param(.2, true, -3, 3), width: param(.13, true, 0, 1), weight: param(1, false, 0, 1) }],
    qs: [{ center: param(1.5, true, 0, 6), width: param(.22, false, 0, 1), weight: param(1, false, 0, 1) }], delta: param(.3, true, -1, 1) };
  cases.push({ id: 'xvbf-transmission', project: xv });
  const linked = project([site('Doublet', -.3, .3), site('Doublet', .6, .2)]);
  linked.sites[1].params.fwhm.link = { target: 'site:0:fwhm', factor: 1 };
  linked.sites[1].params.intensity.link = { target: 'site:0:intensity', factor: 2 / 3 };
  cases.push({ id: 'linked-parameters', project: linked });
  const bounded = project([site('Singlet', .23, .3)]);
  bounded.sites[0].params.fwhm.min = .32;
  bounded.sites[0].params.fwhm.value = .32;
  cases.push({ id: 'active-width-bound', project: bounded });
  const thin = project([site('Doublet', .23, 800), site('Sextet', -.15, 500)]);
  thin.mode = 'thin';
  cases.push({ id: 'thin-control', project: thin });
  for (const squared of [false, true]) {
    const p = project([site('Singlet', .23, .3)]);
    p.sites[0].params.fwhm = param(.097, false);
    p.source_squared = squared; p.source_fwhm = .31;
    p.spectrum.x = Array.from({ length: 257 }, (_, i) => -2.731 + 5.48 * i / 256);
    p.spectrum.y = p.spectrum.x.map(() => 20000);
    p.background[1].fit = true; p.background[2].fit = true;
    cases.push({ id: `source-calibration-${squared ? 'squared' : 'lorentzian'}`, calibration: true, project: p });
  }
  // Observations are generated ONCE by the unmodified scalar build. Later
  // stages must load these exact arrays and starts, never regenerate them.
  for (const c of cases) {
    const p = c.project;
    p.spectrum.y = evaluate(c).y.map((v, i) => v + 1.7 * Math.sin(i * 17.3) + .8 * Math.cos(i * 2.1));
    p.background[0].value *= 1.001;
    for (const s of p.sites) {
      s.params.cs.value += .035; s.params.intensity.value *= .9;
      if (s.params.fwhm.fit) s.params.fwhm.value *= 1.15;
      if (s.kind === 'Sextet') s.params.bhf.value -= .4;
      if (s.xvbf) { s.xvbf.cs[0].center.value += .04; s.xvbf.cs[0].width.value *= 1.15; s.xvbf.delta.value = .2; }
    }
    if (c.calibration) p.source_fwhm *= 1.15;
  }
  return cases;
}

import { compare } from './transmission-equivalence.mjs';

const recording = args.includes('--record');
const projectPaths = option('--record-projects', '').split(',').filter(Boolean);
const cases = recording ? projectPaths.length ? projectPaths.map(path => {
  const file = JSON.parse(readFileSync(path));
  const project = structuredClone(file.project);
  project.max_iterations = 250;
  for (const site of project.sites) {
    if (site.params.cs.fit && !site.params.cs.link) site.params.cs.value += .025;
    if (site.params.fwhm.fit && !site.params.fwhm.link) site.params.fwhm.value *= 1.08;
    if (site.params.intensity.fit && !site.params.intensity.link) site.params.intensity.value *= .95;
  }
  return { id: basename(path).replace('.mossa.json', ''), source_file: path, provenance: file.provenance, project };
}) : makeCases() : JSON.parse(readFileSync(fixturePath)).cases;
const rows = [];
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
for (const c of cases) {
  fit(c); // warm compilation and caches, excluded from timings
  const times = [], evalTimes = [];
  let result;
  for (let repeat = 0; repeat < repetitions; repeat++) {
    const begin = performance.now(); result = fit(c); times.push(performance.now() - begin);
    if (!recording) compare(c, result, args.includes('--diagnostic'));
    const start = performance.now(); for (let i = 0; i < 20; i++) evaluate(c); evalTimes.push((performance.now() - start) / 20);
  }
  const comparison = recording ? null : compare(c, result, args.includes('--diagnostic'));
  if (recording) { c.result = result; c.initial_evaluation = evaluate(c); }
  const row = { id: c.id, sites: c.project.sites.length, channels: c.project.spectrum.x.length, free_parameters: result.free_parameters,
    fit_ms: median(times), evaluation_ms: median(evalTimes), fit_samples_ms: times, evaluation_samples_ms: evalTimes,
    iterations: result.iterations, termination: result.termination, converged: result.converged, comparison };
  rows.push(row); console.log(c.id, JSON.stringify(row));
}
if (recording) writeFileSync(fixturePath, JSON.stringify({ provenance: `Original scalar WASM core, commit 281a032; ${projectPaths.length ? 'measured observations preserved, starting values perturbed' : 'synthetic noisy observations frozen before optimization'}. Timing excluded.`, cases }) + '\n');
const output = { runtime: process.version, platform: `${process.platform}/${process.arch}`, cpu: os.cpus()[0].model, repetitions,
  wasm_sha256: createHash('sha256').update(bytes).digest('hex'), fixture_sha256: createHash('sha256').update(readFileSync(fixturePath)).digest('hex'), rows };
writeFileSync(option('--output', 'validation-data/performance/latest.json'), JSON.stringify(output, null, 2) + '\n');
