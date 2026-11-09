// node --import tsx scripts/benchmark-selective-multistart.mjs --backend native --starts 4,12 --repeats 3
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { cpus } from 'node:os';
import init, { fit_json, evaluate_json } from '../src/wasm/mossa_core.js';
import { fitMultiStartAsync, searchCandidate, explorationPolicy } from '../src/multistart.mjs';
import { NativeFixture } from '../tests/native-transport.ts';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const backend = option('--backend', 'native');
assert.ok(['native', 'wasm', 'both'].includes(backend));
const starts = option('--starts', '4,12').split(',').map(Number);
const repeats = Number(option('--repeats', '3'));
const wasmValidationRepeats = Number(option('--wasm-validation-repeats', String(repeats)));
assert.ok(Number.isInteger(repeats) && repeats >= 1);
assert.ok(Number.isInteger(wasmValidationRepeats) && wasmValidationRepeats >= 1);
assert.ok(starts.every(n => Number.isInteger(n) && n >= 2 && n <= 32));
const output = resolve(option('--output', 'validation-data/performance/selective-multistart.json'));
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const load = file => JSON.parse(readFileSync(file));
const measured = load('tests/fixtures/transmission-measured-performance.json').cases;
const controls = load('tests/fixtures/transmission-performance.json').cases.filter(c => !c.calibration);
const archived = load('validation-data/benchmark/wasm-results.json').runs;
const difficult = ['MS_Fe2O3-Fe3O4_30-70', 'MS-Fe2O3-Fe3O4_70-30', 'MS_Fe2O3-Fe3O4_50-50', 'MS_MexicanMagnetite'].map(id => ({ id: `${id}_coarse`, project: archived.find(c => c.id === id && c.variant === 'coarse-start').initial_project }));
// Extra starts fixed before qualification. These are not independent new data.
const holdouts = [...measured, ...difficult.slice(0, 2)].map((c, i) => ({ id: `${c.id}_perturbed`, project: searchCandidate(c.project, 101 + i * 17) }));
const cases = [...measured, ...difficult, ...controls, ...holdouts].filter(c => !args.includes('--case') || c.id.includes(option('--case', '')));
const timedWasmCases = new Set([...measured, difficult[0]].map(c => c.id));
const report = { date: new Date().toISOString(), backend, policy: explorationPolicy, starts, requested_repeats: repeats, wasm_validation_repeats: wasmValidationRepeats,
  objective_gate: { relative: 1e-8, absolute: 1e-6 },
  method: 'One unrecorded warmup per backend; paired full/selective searches with alternating execution order. Native JSON transport and final diagnostics included; UI excluded. Each backend is compared with its own full-search reference.',
  environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model, logical_cpus: cpus().length, rustc: execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim() },
  input_sha256: hash(cases), source_sha256: Object.fromEntries(['src/multistart.mjs', 'rust-core/src/lib.rs', 'rust-core/src/parallel.rs'].map(path => [path, hash(readFileSync(path))])), runs: [] };
assert.ok(cases.length, 'No matching benchmark cases');
if (args.includes('--resume') && existsSync(output)) {
  const previous = load(output);
  for (const key of ['backend', 'policy', 'starts', 'input_sha256', 'source_sha256', 'environment']) assert.deepEqual(previous[key], report[key], `Cannot resume with changed ${key}`);
  report.date = previous.date; report.runs = previous.runs;
  report.resume_history = [...(previous.resume_history ?? []), { date: new Date().toISOString(), requested_repeats: repeats }];
  for (const row of report.runs) row.repeats = row.samples_ms.full.length;
}
mkdirSync(dirname(output), { recursive: true });
const save = () => writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
let native;
try {
  if (backend !== 'wasm') {
    execFileSync('cargo', ['build', '--locked', '--release', '--manifest-path', 'rust-core/Cargo.toml', '--example', 'native_fixture'], { stdio: 'inherit' });
    report.native_sha256 = hash(readFileSync('rust-core/target/release/examples/native_fixture'));
    native = new NativeFixture();
    await native.transport.invoke('native_compute_start', { session: 'selective-benchmark' });
  }
  if (backend !== 'native') {
    const wasm = readFileSync('src/wasm/mossa_core_bg.wasm'); report.wasm_sha256 = hash(wasm);
    await init({ module_or_path: wasm });
  }
  for (const engine of backend === 'both' ? ['native', 'wasm'] : [backend]) {
    const compute = engine === 'native'
      ? async (operation, project) => (await native.transport.invoke('native_compute', { session: 'selective-benchmark', operation, project })).result
      : async (operation, project) => JSON.parse((operation === 'fit' ? fit_json : evaluate_json)(JSON.stringify(project)));
    await compute('fit', controls[0].project);
    for (const c of cases) for (const count of starts) {
      const caseRepeats = engine === 'wasm' && !timedWasmCases.has(c.id) ? wasmValidationRepeats : repeats;
      const recorded = report.runs.findIndex(r => r.backend === engine && r.id === c.id && r.starts === count);
      if (recorded >= 0 && report.runs[recorded].samples_ms.full.length >= caseRepeats) continue;
      const samples = { full: [], selective: [] }, results = {}, traces = {};
      for (let repeat = 0; repeat < caseRepeats; repeat++) {
        for (const strategy of repeat % 2 ? ['selective', 'full'] : ['full', 'selective']) {
          const trace = [], t = performance.now();
          const result = await fitMultiStartAsync({ ...structuredClone(c.project), search_starts: count, search_strategy: strategy }, async p => {
            const begin = performance.now(), fit = await compute('fit', p);
            trace.push({ input_sha256: hash(p), iterations: fit.iterations, objective: fit.evaluation.objective, termination: fit.termination, elapsed_ms: performance.now() - begin });
            return fit;
          }, p => compute('evaluate', p));
          samples[strategy].push(performance.now() - t);
          if (results[strategy]) assert.deepEqual(result, results[strategy], `${engine}/${c.id}/${count}/${strategy}: nondeterministic fit`);
          results[strategy] = result; traces[strategy] = trace;
        }
      }
      const a = results.full, b = results.selective, tolerance = Math.max(1e-6, 1e-8 * a.evaluation.objective);
      const row = { backend: engine, id: c.id, starts: count, repeats: caseRepeats, samples_ms: samples,
        full_ms: median(samples.full), selective_ms: median(samples.selective),
        speedup: median(samples.full) / median(samples.selective),
        objective_relative_change: (b.evaluation.objective - a.evaluation.objective) / Math.max(1, a.evaluation.objective),
        same_or_better: b.evaluation.objective <= a.evaluation.objective + tolerance,
        convergence_retained: !a.converged || b.converged, rank_retained: b.rank >= a.rank,
        exact_selected_numerics: isDeepStrictEqual({ ...a, project: undefined, search: undefined, warnings: undefined }, { ...b, project: undefined, search: undefined, warnings: undefined }),
        pruned_starts: b.search.pruned_starts, traces, results };
      if (recorded >= 0) report.runs[recorded] = row; else report.runs.push(row);
      save();
      console.log(`${engine} ${c.id} ${count}: ${row.full_ms.toFixed(0)} -> ${row.selective_ms.toFixed(0)} ms (${row.speedup.toFixed(2)}x); objective ${row.objective_relative_change.toExponential(2)}; pruned ${row.pruned_starts}; ${row.same_or_better && row.convergence_retained && row.rank_retained ? 'PASS' : 'FAIL'}`);
    }
  }
  report.repeat_counts = [...new Set(report.runs.map(r => r.repeats))].sort();
  report.passed = report.runs.length === cases.length * starts.length * (backend === 'both' ? 2 : 1)
    && report.runs.every(r => r.same_or_better && r.convergence_retained && r.rank_retained); save();
  if (!report.passed && !args.includes('--diagnostic')) process.exitCode = 1;
} finally { if (native) await native.close(); }
