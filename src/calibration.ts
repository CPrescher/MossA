import { calibrateCounts } from './io.mjs';
import { newSite, parameter, type FitResult, type Project } from './types';
import type { Snapshot } from './session';

export type CalibrationSettings = { max: number; field: number; sinusoidal: boolean; folding: boolean; center: number; autoCenter?: boolean };
export type CalibrationReference = { name: string; counts: number[]; settings: CalibrationSettings; fittedField: number; rms: number; date: string };
export type VelocityCalibration = { max: number; shift: number; reference: CalibrationReference; preview: Project; fit: FitResult };

export function validCalibrationReference(value: unknown): value is CalibrationReference {
  const r = value as CalibrationReference | null;
  return !!r && typeof r.name === 'string' && typeof r.date === 'string' && Array.isArray(r.counts) && r.counts.length >= 16 && r.counts.length <= 20000 && r.counts.every(v => Number.isFinite(v) && v >= 0) && !!r.settings && [r.settings.max, r.settings.field, r.settings.center, r.fittedField, r.rms].every(Number.isFinite) && r.settings.max > 0 && r.settings.field > 0 && r.fittedField > 0 && r.rms >= 0 && typeof r.settings.sinusoidal === 'boolean' && typeof r.settings.folding === 'boolean';
}

// calib.m: normalize to 100 and fit a Lorentzian sextet with QS fixed at zero.
export function referenceProject(counts: number[], settings: CalibrationSettings): Project {
  if (counts.length < 16 || counts.length > 20000 || counts.some(v => !Number.isFinite(v) || v < 0)) throw new Error('Provide 16–20,000 finite, nonnegative reference counts.');
  if (!Number.isFinite(settings.field) || settings.field <= 0) throw new Error('Reference field must be positive.');
  const spectrum = calibrateCounts(counts, settings.max, 0, settings.sinusoidal, settings.folding ? settings.center : null);
  const highest = Math.max(...spectrum.y), lowest = Math.min(...spectrum.y);
  if (!(highest > 0) || highest - lowest < highest * 1e-8) throw new Error('The reference has no absorption signal.');
  spectrum.y = spectrum.y.map(v => v * 100 / highest);
  const site = newSite(0, 'Sextet');
  site.name = 'α-Fe reference';
  site.params.cs = parameter(0, true, -settings.max / 2, settings.max / 2);
  site.params.qs = parameter(0, false);
  site.params.fwhm = parameter(.19, true, .001, null);
  site.params.intensity = parameter(5, true, 0, null);
  site.params.bhf = parameter(settings.field, true, .001, null);
  site.params.a12 = parameter(1.5, true, .05, 20);
  site.params.a13 = parameter(3, true, .05, 20);
  return { spectrum, sites: [site], background: [parameter(100, true, 90, 110), parameter(0, true, -5, 5)], mode: 'thin', weighting: 'unweighted', source_fwhm: .097, source_squared: false, max_iterations: 300 };
}

// The outer iron lines provide a second starting estimate when the initial
// velocity range differs substantially from the true one. This is only a seed;
// the final calibration always comes from the six-line least-squares fit.
export function referenceSeeds(counts: number[], settings: CalibrationSettings): Project[] {
  const project = referenceProject(counts, settings), { x, y } = project.spectrum;
  const minima: number[] = [];
  for (const side of [-1, 1]) {
    let best = -1, depth = Infinity;
    for (let i = 2; i < y.length - 2; i++) {
      if (x[i] * side <= settings.max * .1 || x[i] * side >= settings.max * .95) continue;
      const mean = (y[i - 2] + y[i - 1] + y[i] + y[i + 1] + y[i + 2]) / 5;
      if (mean < depth) { depth = mean; best = i; }
    }
    if (best >= 0) minima.push(best);
  }
  if (minima.length !== 2) return [project];
  const guessed = structuredClone(project), site = guessed.sites[0];
  site.params.cs.value = (x[minima[0]] + x[minima[1]]) / 2;
  site.params.bhf.value = (x[minima[1]] - x[minima[0]]) / (2 * .1613);
  site.params.fwhm.value = .25 * site.params.bhf.value / settings.field;
  site.params.intensity.value = Math.max(.1, (100 - Math.min(...y)) * Math.PI * site.params.fwhm.value * 2);
  return [guessed, project];
}

export function finishCalibration(counts: number[], settings: CalibrationSettings, name: string, fit: FitResult): VelocityCalibration {
  const site = fit.project.sites[0], field = site.params.bhf.value;
  // A scan may show only part of the iron pattern, as in calib.m. Keep solver
  // warnings visible instead of requiring every line or nuisance parameter.
  if (!fit.converged || !Number.isFinite(field) || field <= 0 || site.params.intensity.value <= 0) throw new Error('Reference fit did not converge. Check the spectrum, folding, and initial velocity range.');
  const x = fit.project.spectrum.x, center = site.params.cs.value;
  const scale = settings.field / field, max = settings.max * scale, shift = center * scale;
  // Uniform rescaling is exact for this model: scale CS, FWHM, field, and area,
  // and divide the linear-background slope by the same factor. This replaces
  // calib.m's ten refit/rescale cycles without changing its final convention.
  const preview = structuredClone(fit.project);
  preview.spectrum.x = x.map(v => v * scale);
  for (const key of ['cs', 'fwhm', 'intensity', 'bhf']) {
    const p = preview.sites[0].params[key];
    p.value *= scale;
    if (p.min !== null) p.min *= scale;
    if (p.max !== null) p.max *= scale;
  }
  preview.background[1].value /= scale;
  preview.background[1].min = null; preview.background[1].max = null;
  return { max, shift, preview, fit, reference: { name, counts: [...counts], settings: { ...settings }, fittedField: field, rms: Math.sqrt(fit.evaluation.sse / x.length), date: new Date().toISOString() } };
}

export function applyVelocityCalibration(snapshot: Snapshot, result: VelocityCalibration): Snapshot {
  const cal = { ...snapshot.cal, max: result.max, shift: result.shift, sinusoidal: result.reference.settings.sinusoidal, reference: result.reference };
  if (!snapshot.raw) return { ...snapshot, cal }; // Existing velocity columns retain their scale and fit.
  if (snapshot.raw.length === result.reference.counts.length && snapshot.raw.every((v, i) => v === result.reference.counts[i])) {
    cal.center = result.reference.settings.center; cal.folding = result.reference.settings.folding;
  }
  const spectrum = calibrateCounts(snapshot.raw, cal.max, cal.shift, cal.sinusoidal, cal.folding ? cal.center : null);
  return { ...snapshot, cal, project: { ...snapshot.project, spectrum }, fit: null, fitElapsed: null };
}
