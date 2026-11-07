// Node 26: node --import tsx scripts/prepare-syncmoss-tutorial.ts
// Reads the pinned, byte-identical public inputs already in the manual. This
// generates NEW MossA teaching fits, not the original author's fitted models.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import init, { fit_json, evaluate_json } from '../src/wasm/mossa_core.js';
import { parseSpectrum } from '../src/io.mjs';
import { newNuclearConstants } from '../src/nuclear-constants.mjs';
import { centeredGaussians } from '../src/source-profile';
import { newSite, parameter, type Project, type FitResult } from '../src/types';
import { summarizeFit, type Calibration, type Snapshot } from '../src/session';
import { workspaceFromSnapshot, activeSpectrum, type ModelEntry, type SpectrumEntry } from '../src/workspace';
import { createProjectFile } from '../src/projectFile';
import { createWorkspaceFile, openWorkspaceFile } from '../src/workspaceFile';

const commit = 'b712fbc1521004a47409b964b9ab012fe5c5e255';
const repository = 'https://github.com/sergey-yaroslavtsev/syncmoss';
const output = resolve('manual/public/tutorial-data/syncmoss');
const hashes: Record<string, string> = {
  'Standard_CMS.dat': '70e37f5654ff43dd09fd8fd46a93dafb5f49bd70',
  'Standard_SMS.dat': '7e1b8d1bd0b0fbc4447e2e3a6b8adfaf24c0eafd',
  'Calibration.dat': 'f08940a1a7dd786cb3abf61734da35ad997bd9fc',
  'UPSTREAM_LICENSE.txt': '9e889419862ce22f4af68a3a24606d2a9cf2d186',
};
const files = [];
const inputs = new Map<string, Project['spectrum']>();
for (const [name, expected] of Object.entries(hashes)) {
  const bytes = await readFile(join(output, name));
  const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (blob !== expected) throw new Error(`Pinned input changed: ${name}`);
  const path = name === 'UPSTREAM_LICENSE.txt' ? 'LICENSE' : `syncmoss/parameters/${name}`;
  const headers = bytes.toString('utf8').split(/\r?\n/).filter(line => line.startsWith('#'));
  const spectrum = name.endsWith('.dat') ? parseSpectrum(bytes.toString('utf8')).spectrum : undefined;
  if (spectrum) inputs.set(name, spectrum);
  files.push({ name, source: `${repository}/blob/${commit}/${path}`, upstreamPath: path, gitBlob: blob,
    sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
    ...(spectrum ? { points: spectrum.x.length, range: [spectrum.x[0], spectrum.x.at(-1)], headers } : {}) });
}
if (JSON.stringify(inputs.get('Calibration.dat')) !== JSON.stringify(inputs.get('Standard_CMS.dat'))) {
  throw new Error('The calibration/CMS duplicate observation check changed.');
}
const smsText = await readFile(join(output, 'Standard_SMS.dat'), 'utf8');
const triples = smsText.split('\n').find(s => s.startsWith('#@INSexp '))!.slice(9).trim().split(/\s+/).map(Number);
const insint = smsText.split('\n').find(s => s.startsWith('#@INSint '))!.slice(9).trim().split(/\s+/).map(Number);
const gaussians = Array.from({ length: triples.length / 3 }, (_, i) => ({
  center: -triples[3 * i + 1], fwhm: 2 * Math.sqrt(2 * Math.log(2)) * (triples[3 * i] ** 2 + .098 / 2), weight: triples[3 * i + 2] ** 2,
}));
const attribution = { author: 'Sergey Yaroslavtsev / ESRF', copyright: 'Copyright (c) European Synchrotron Radiation Facility (ESRF)',
  repository, upstreamCommit: commit, license: 'MIT', licenseText: await readFile(join(output, 'UPSTREAM_LICENSE.txt'), 'utf8'),
  reference: 'Yaroslavtsev (2023), J. Synchrotron Rad. 30, 596–604; doi:10.1107/S1600577523001686' };
const source = { ...attribution, rawINSexp: triples, rawINSint: insint, naturalWidthUsedByUpstream: .098,
  mossaAnchorComponents: gaussians, mossaCenteredComponents: centeredGaussians(gaussians),
  rawSourceCentroid: -gaussians.reduce((s, g) => s + g.center * g.weight, 0) / gaussians.reduce((s, g) => s + g.weight, 0),
  conversion: 'sigma=a^2+0.098/2; FWHM=2 sqrt(2 ln 2) sigma; area=c^2; response center=-mu, then normalize weights and remove their weighted centroid.',
  status: 'Supplied source, not estimated from these iron spectra. INSint is retained as metadata and is not a MossA velocity calibration.' };
await init({ module_or_path: await readFile(new URL('../src/wasm/mossa_core_bg.wasm', import.meta.url)) });
const constants = newNuclearConstants();
const cal: Calibration = { max: 12, shift: 0, sinusoidal: false, folding: false, center: 256.5, nuclear_constants: constants };
const evaluate = async (p: Project) => JSON.parse(evaluate_json(JSON.stringify(p)));
const results: { dataset: string; model: string; result: FitResult }[] = [];
function run(dataset: string, model: string, project: Project) {
  const result: FitResult = JSON.parse(fit_json(JSON.stringify(project)));
  if (!result.converged || result.warnings.length) throw new Error(`${model}: ${result.termination}: ${result.warnings.join('; ')}`);
  results.push({ dataset, model, result });
  console.log(JSON.stringify({ dataset, model, iterations: result.iterations, free: result.free_parameters, reduced: result.reduced_objective, params: result.project.sites[0].params }));
  return result;
}
function sextet(width: number, area: number) {
  const site = newSite(0, 'Sextet'); site.name = 'alpha-Fe · powder model';
  site.params.cs = parameter(0, true, -.5, .5); site.params.bhf = parameter(32.94, true, 25, 36);
  site.params.fwhm = parameter(width, true, .05, 1); site.params.intensity = parameter(area, true, 0);
  site.params.qs = parameter(0, false, -1, 1);
  return site;
}
const cmsStart: Project = { nuclear_constants: constants, spectrum: inputs.get('Standard_CMS.dat')!,
  sites: [sextet(.3, 60000)], background: [parameter(271000, true, 200000, 350000)],
  mode: 'thin', source_fwhm: .098, source_squared: false, weighting: 'counts', max_iterations: 1000, search_starts: 1 };
const cms = run('Standard_CMS.dat', 'CMS · Lorentzian, empirical', cmsStart);
const cmsPV = structuredClone(cms.project); cmsPV.sites[0].profile = 'PseudoVoigt'; cmsPV.sites[0].params.mix = parameter(.7, true, 0, 1);
run('Standard_CMS.dat', 'CMS · pseudo-Voigt, empirical', cmsPV);
const smsStart: Project = { nuclear_constants: constants, spectrum: inputs.get('Standard_SMS.dat')!,
  sites: [sextet(.098, 1.1)], background: [parameter(6000, true, 5000, 7000)],
  mode: 'transmission', source_fwhm: gaussians[0].fwhm, source_squared: false,
  source_gaussians: gaussians, weighting: 'counts', max_iterations: 1000, search_starts: 1 };
smsStart.sites[0].params.fwhm.fit = false;
const sms = run('Standard_SMS.dat', 'SMS · supplied 3-Gaussian source', smsStart);
const { source_gaussians: _gs, ...simple } = structuredClone(sms.project);
simple.source_squared = true; simple.source_fwhm = .2;
run('Standard_SMS.dat', 'SMS · squared source 0.200, control', simple);
const provenance = { ...attribution, purpose: 'New MossA worked teaching fits; not SYNCmoss author fits or reproductions of published figure models',
  source, inputTreatment: 'Original bytes and all velocity/count rows retained. No folding, velocity reversal, resampling, count normalization, or header-based velocity recalibration.',
  limitations: ['CMS fits are empirical thin-model line-shape comparisons, not a reproduction of the supplied GCMS source/geometry model.',
    'SMS uses a single isotropic scalar powder sextet and fixed intrinsic width; polarization, texture, relaxation, and source/velocity uncertainty are not modeled.',
    'The squared-source control fixes width 0.200 mm/s in the legacy parameter convention; it is not an optimized source calibration or a model-selection test.',
    'Calibration.dat repeats exactly the CMS velocity/count observations and is not an independent validation dataset.'] };
const snapshot = (p: Project, filename: string, fit: FitResult | null): Snapshot => ({ project: p, filename, raw: null, cal, selected: 0, fit: fit ? summarizeFit(fit) : null, fitElapsed: null });
for (const [filename, p] of [['cms-start.mossa', cmsStart], ['sms-start.mossa', smsStart]] as const) {
  await writeFile(join(output, filename), JSON.stringify(await createProjectFile(snapshot(p, filename.startsWith('cms') ? 'Standard_CMS.dat' : 'Standard_SMS.dat', null), provenance), null, 2) + '\n');
}
const spectra: SpectrumEntry[] = [];
for (const dataset of ['Standard_CMS.dat', 'Standard_SMS.dat']) {
  const group = results.filter(r => r.dataset === dataset);
  const workspace = workspaceFromSnapshot(snapshot(group[0].result.project, dataset, group[0].result));
  const entry = activeSpectrum(workspace);
  entry.models = group.map(({ model, result }, i): ModelEntry => {
    const { spectrum: _spectrum, ...project } = result.project;
    return { id: `sync-${dataset.includes('CMS') ? 'cms' : 'sms'}-${i}`, name: model, project, selected: 0, fit: summarizeFit(result), fitElapsed: null };
  });
  entry.activeModelId = entry.models[0].id; spectra.push(entry);
}
const workspace = workspaceFromSnapshot(snapshot(sms.project, 'Standard_SMS.dat', sms));
workspace.name = 'SYNCmoss · measured CMS and SMS standards'; workspace.spectra = spectra; workspace.activeSpectrumId = spectra[1].id;
const document = await createWorkspaceFile(workspace, provenance);
const reopened = await openWorkspaceFile(document, cal, 'syncmoss-worked.mossa', evaluate);
if (reopened.notice || reopened.workspace.spectra.some(s => s.models.some(m => !m.fit))) throw new Error(`Saved fit lost: ${reopened.notice}`);
await mkdir(output, { recursive: true });
await writeFile(join(output, 'syncmoss-worked.mossa'), JSON.stringify(document, null, 2) + '\n');
await writeFile(join(output, 'source-profile.json'), JSON.stringify(source, null, 2) + '\n');
await writeFile(join(output, 'provenance.json'), JSON.stringify({ ...provenance, files, wasmSHA256: createHash('sha256').update(await readFile(new URL('../src/wasm/mossa_core_bg.wasm', import.meta.url))).digest('hex') }, null, 2) + '\n');
await writeFile(join(output, 'fit-results.json'), JSON.stringify({ attribution, fits: results }, null, 2) + '\n');
