import { newSite, parameter, type FitResult, type Project } from './types';
import type { Snapshot } from './session';

export type SourceSettings = { absorberFwhm: number; initialSourceFwhm: number; squared: boolean };
export type SourceReference = {
  name: string; date: string; spectrum: Project['spectrum']; absorberFwhm: number;
  sourceFwhm: number; sourceStd: number; squared: boolean; center: number; intensity: number;
  background: number[]; rms: number; iterations: number; warnings: string[];
};
export type SourceCalibration = { reference: SourceReference; fit: FitResult };
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export function validSourceReference(value: unknown): value is SourceReference {
  const r = value as SourceReference | null, x = r?.spectrum?.x, y = r?.spectrum?.y;
  return !!r && typeof r.name === 'string' && typeof r.date === 'string' && Array.isArray(x) && Array.isArray(y) && x.length >= 8 && x.length <= 20000 && x.length === y.length && x.every((v, i) => finite(v) && v >= -30 && v <= 30 && (i === 0 || v > x[i - 1])) && y.every(v => finite(v) && v > 0) && [r.absorberFwhm, r.sourceFwhm, r.sourceStd, r.center, r.intensity, r.rms].every(finite) && r.absorberFwhm >= 1e-6 && r.sourceFwhm >= .001 && r.sourceFwhm <= 5 && r.sourceStd >= 0 && r.intensity > 0 && r.rms >= 0 && typeof r.squared === 'boolean' && Number.isInteger(r.iterations) && r.iterations >= 0 && Array.isArray(r.background) && r.background.length === 3 && r.background.every(finite) && Array.isArray(r.warnings) && r.warnings.every(w => typeof w === 'string');
}

// MossA.m src_calib_model: one Lorentzian absorber of known width. Source
// width, center, area, I0, and two background coefficients are varied.
export function sourceReferenceProject(spectrum: Project['spectrum'], settings: SourceSettings): Project {
  const { x, y } = spectrum;
  if (x.length < 8 || x.length > 20000 || x.length !== y.length || x.some((v, i) => !finite(v) || v < -30 || v > 30 || (i > 0 && v <= x[i - 1])) || y.some(v => !finite(v) || v <= 0)) throw new Error('Provide 8–20,000 positive reference counts at increasing velocities inside ±30 mm/s.');
  if (!finite(settings.absorberFwhm) || settings.absorberFwhm < 1e-6) throw new Error('Known absorber FWHM must be at least 0.000001 mm/s.');
  if (!finite(settings.initialSourceFwhm) || settings.initialSourceFwhm < .001 || settings.initialSourceFwhm > 5) throw new Error('Initial source width must be 0.001–5 mm/s.');
  const top = Math.max(...y), bottom = Math.min(...y);
  if (top - bottom < top * 1e-6) throw new Error('The reference has no absorption signal.');
  const site = newSite(0, 'Singlet');
  site.name = 'Source standard'; site.params.fwhm = parameter(settings.absorberFwhm, false);
  site.params.cs = parameter(x[y.indexOf(bottom)], true, x[0], x.at(-1)!);
  site.params.intensity = parameter(Math.max(.01, -Math.log(bottom / top) * Math.PI * (settings.absorberFwhm + settings.initialSourceFwhm) / 2), true, 0, null);
  return { spectrum, sites: [site], background: [parameter(top), parameter(0), parameter(0)], mode: 'transmission', source_fwhm: settings.initialSourceFwhm, source_squared: settings.squared, weighting: 'unweighted', max_iterations: 300 };
}
export function sourceReferenceSeeds(spectrum: Project['spectrum'], settings: SourceSettings): Project[] {
  const estimated = sourceReferenceProject(spectrum, settings), matlab = structuredClone(estimated);
  matlab.sites[0].params.intensity.value = 8; // Original MATLAB starting area.
  matlab.sites[0].params.cs.value = Math.max(spectrum.x[0], Math.min(spectrum.x.at(-1)!, 0));
  return [estimated, matlab];
}
export function finishSourceCalibration(name: string, fit: FitResult): SourceCalibration {
  const p = fit.project, std = fit.errors['source:fwhm'];
  if (!fit.converged) throw new Error('Source fit did not converge. Check the reference, velocity scale, and known absorber width.');
  if (fit.rank < fit.free_parameters || std == null || !finite(std) || p.source_fwhm <= .001001 || p.source_fwhm >= 4.999999 || p.sites[0].params.intensity.value <= 0) throw new Error('Source width is not resolved by this reference. Inspect the fit, velocity scale, and known absorber width.');
  const reference: SourceReference = { name, date: new Date().toISOString(), spectrum: structuredClone(p.spectrum), absorberFwhm: p.sites[0].params.fwhm.value, sourceFwhm: p.source_fwhm, sourceStd: std, squared: p.source_squared, center: p.sites[0].params.cs.value, intensity: p.sites[0].params.intensity.value, background: p.background.map(b => b.value), rms: Math.sqrt(fit.evaluation.sse / p.spectrum.x.length), iterations: fit.iterations, warnings: [...fit.warnings] };
  if (!validSourceReference(reference)) throw new Error('Invalid source calibration result.');
  return { reference, fit };
}
export function applySourceCalibration(snapshot: Snapshot, result: SourceCalibration): Snapshot {
  const r = result.reference;
  if (!validSourceReference(r)) throw new Error('Invalid source reference.');
  const changed = snapshot.project.source_fwhm !== r.sourceFwhm || snapshot.project.source_squared !== r.squared;
  return { ...snapshot, cal: { ...snapshot.cal, sourceReference: r }, project: changed ? { ...snapshot.project, source_fwhm: r.sourceFwhm, source_squared: r.squared } : snapshot.project,
    fit: changed && snapshot.project.mode === 'transmission' ? null : snapshot.fit,
    fitElapsed: changed && snapshot.project.mode === 'transmission' ? null : snapshot.fitElapsed };
}
