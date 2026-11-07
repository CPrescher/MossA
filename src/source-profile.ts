import type { SourceGaussian } from './types';

export function validGaussianSource(value: unknown): value is SourceGaussian[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= 3 && value.every(g =>
    g && Number.isFinite(g.center) && Math.abs(g.center) <= 5 &&
    Number.isFinite(g.fwhm) && g.fwhm >= .03 && g.fwhm <= 5 &&
    Number.isFinite(g.weight) && g.weight >= .001 && g.weight <= 100);
}

// Velocity-response kernel, convolved as S(v-u) T(u). The physical kernel
// has unit area and zero centroid; anchor coordinates remain in provenance.
export function centeredGaussians(gs: SourceGaussian[]): SourceGaussian[] {
  const total = gs.reduce((sum, g) => sum + g.weight, 0);
  const center = gs.reduce((sum, g) => sum + g.center * g.weight, 0) / total;
  return gs.map(g => ({ center: g.center - center, fwhm: g.fwhm, weight: g.weight / total }));
}
export function gaussianDensity(v: number, gs: SourceGaussian[]): number {
  return gs.reduce((sum, g) => sum + g.weight * Math.sqrt(4 * Math.log(2) / Math.PI) / g.fwhm * Math.exp(-4 * Math.log(2) * ((v - g.center) / g.fwhm) ** 2), 0);
}
