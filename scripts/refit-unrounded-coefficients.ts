// Paired refits from archived optima isolate coefficient rounding from model
// changes and starting-basin selection. Original benchmark files stay untouched.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { newNuclearConstants, nuclearConstants } from '../src/nuclear-constants.mjs';
import { createProjectFile, openProjectFile } from '../src/projectFile';
import { summarizeFit, type Snapshot } from '../src/session';
import type { FitResult, Project } from '../src/types';

const root = new URL('../validation-data/benchmark/', import.meta.url);
const out = new URL('unrounded-refit/', root);
mkdirSync(new URL('runtime/', out), { recursive: true });
mkdirSync(new URL('projects/', out), { recursive: true });
for (const name of ['mossa_core.js', 'mossa_core_bg.wasm', 'LICENSE']) copyFileSync(new URL(`../src/wasm/${name}`, import.meta.url), new URL(`runtime/${name}`, out));
writeFileSync(new URL('runtime/package.json', out), '{"type":"module"}\n');
const runtime = await import(new URL('runtime/mossa_core.js', out).href);
await runtime.default({ module_or_path: readFileSync(new URL('runtime/mossa_core_bg.wasm', out)) });
const read = (name: string) => JSON.parse(readFileSync(new URL(name, root), 'utf8'));
const hash = (url: URL) => createHash('sha256').update(readFileSync(url)).digest('hex');
const cases = read('cases.json'), selected = read('selected-fits.json');
const metadata = {
  date: new Date().toISOString(),
  description: 'Paired local refits of archived physical models on unchanged supplied velocity axes. No recalibration, free line ratios, empirical per-line widths, or new global-search claim.',
  modern: newNuclearConstants(), legacy: nuclearConstants(),
  wasm_sha256: hash(new URL('runtime/mossa_core_bg.wasm', out)),
  binding_sha256: hash(new URL('runtime/mossa_core.js', out)),
  registry_sha256: hash(new URL('../src/nuclear-constants.json', import.meta.url)),
  selected_fits_sha256: hash(new URL('selected-fits.json', root)),
  cases_sha256: hash(new URL('cases.json', root)),
};
const records: any[] = [];
const evaluate = (p: Project) => JSON.parse(runtime.evaluate_json(JSON.stringify(p)));
for (const c of cases) for (const label of ['reference_constraints', 'thin', 'transmission']) {
  const archived = selected[c.id][label];
  if (!archived) continue;
  const previous = archived.result as FitResult;
  if (previous.project.nuclear_constants !== undefined) throw new Error('Expected an untagged legacy archive.');
  const before = evaluate(previous.project);
  const predictionRelativeDifference = Math.max(...before.y.map((v: number, i: number) => Math.abs(v - previous.evaluation.y[i]))) / Math.max(...previous.project.spectrum.y.map(Math.abs));
  if (predictionRelativeDifference > 1e-12) throw new Error(`Legacy runtime changed materially: ${c.id}/${label}`);
  const record: any = { id: c.id, model: label, archived_variant: archived.variant, previous, legacy_prediction_relative_difference: predictionRelativeDifference };
  for (const convention of ['legacy', 'modern'] as const) {
    const initial = structuredClone(previous.project);
    if (convention === 'modern') initial.nuclear_constants = newNuclearConstants();
    const start = performance.now();
    const result: FitResult = JSON.parse(runtime.fit_json(JSON.stringify(initial)));
    record[convention] = { result, elapsed_ms: performance.now() - start };
    const { spectrum: _spectrum, nuclear_constants: _constants, ...expected } = initial;
    if (JSON.stringify(result.project.spectrum) !== JSON.stringify(initial.spectrum)) throw new Error('Refit changed the supplied axis/counts.');
    if (JSON.stringify(result.project.nuclear_constants) !== JSON.stringify(initial.nuclear_constants)) throw new Error('Refit changed the convention.');
    // Parameter values may vary; structural constraints must not.
    const structure = (p: Omit<Project, 'spectrum'>) => JSON.stringify(p, (key, value) => key === 'value' ? undefined : value);
    const { spectrum: _rs, nuclear_constants: _rc, ...actual } = result.project;
    if (structure(expected as any) !== structure(actual as any)) throw new Error('Refit changed model constraints.');
    console.log(`${c.id} ${label} ${convention}: SSE=${result.evaluation.sse.toPrecision(9)}, ${result.termination}, ${result.iterations} iterations`);
  }
  record.fields = previous.project.sites.flatMap((s, i) => {
    if (s.kind !== 'Sextet') return [];
    const old = s.params.bhf.value;
    const control = record.legacy.result.project.sites[i].params.bhf.value;
    const current = record.modern.result.project.sites[i].params.bhf.value;
    const source = c.inferred_reference[i];
    // Unconstrained components can exchange character or migrate to another
    // feature. Their old slot names do not establish source-site identity.
    const sourceField = source?.source_table?.field ?? null;
    const reference = label === 'reference_constraints' ? sourceField : null;
    return [{ site_index: i, site: s.name, previous_mossa_T: old, legacy_control_T: control, new_mossa_T: current,
      delta_previous_T: current-old, delta_previous_percent: 100*(current/old-1), delta_paired_control_T: current-control,
      legacy_control_drift_T: control-old, new_approx_1std_T: record.modern.result.errors[`site:${i}:bhf`] ?? null,
      confit_reference_T: reference, previous_minus_confit_T: reference === null ? null : old-reference,
      new_minus_confit_T: reference === null ? null : current-reference,
      new_minus_confit_percent: reference === null ? null : 100*(current/reference-1),
      reference_model_matched: label === 'reference_constraints',
      unmatched_source_table_same_slot_T: reference === null ? sourceField : null,
      curve_reconstructed_initial_slot_T: sourceField === null ? source?.parameters?.bhf?.value ?? null : null,
    }];
  });
  records.push(record);
  writeFileSync(new URL('results.json', out), JSON.stringify({ metadata, records }, null, 2)+'\n');
  const project = record.modern.result.project;
  const savedCal = { max: 12, shift: 0, sinusoidal: false, folding: false, center: 256.5, autoFold: false };
  const snapshot: Snapshot = { project, raw: null, cal: savedCal, filename: `${c.id} — ${label} — unrounded`, selected: 0, fit: summarizeFit(record.modern.result), fitElapsed: record.modern.elapsed_ms };
  const doc = await createProjectFile(snapshot, { audit: metadata.description, source: c.source, archived_model: label, archived_variant: archived.variant, original_project: `validation-data/benchmark/projects/${c.id}_${label}.mossa.json`, wasm_sha256: metadata.wasm_sha256, velocity_calibration: 'Supplied velocity columns preserved; not recalibrated in this comparison.' });
  const file = new URL(`projects/${c.id}_${label}.mossa.json`, out);
  writeFileSync(file, JSON.stringify(doc, null, 2)+'\n');
  const reopened = await openProjectFile(JSON.parse(readFileSync(file, 'utf8')), savedCal, 'verify', async p => evaluate(p));
  if (!reopened.snapshot.fit || reopened.notice) throw new Error(`Project did not round-trip: ${file}`);
}
if (records.length !== 22 || records.some(r => !r.modern.result.converged || !r.legacy.result.converged)) throw new Error('Incomplete or unconverged paired refits. Inspect results.');
console.log(`Completed ${records.length*2} paired fits and verified ${records.length} modern project round-trips.`);
