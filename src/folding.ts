import { newSite, parameter, type FitResult, type Project } from './types';

export type FoldScan = { centers: number[]; mismatch: number[]; project: Project; best: number };
export type FoldEstimate = { center: number; refined: boolean; scan: FoldScan };

// getfp.m: 24 half-channel candidates around the middle, with circular pairing.
export function foldCenterScan(data: number[]): FoldScan {
  if (data.length < 16 || data.length > 20000 || data.some(v => !Number.isFinite(v))) throw new Error('Fold-center search requires 16–20,000 finite counts.');
  const n = data.length, half = Math.floor(n / 2), centers: number[] = [], mismatch: number[] = [];
  const at = (i: number) => data[((i - 1) % n + n) % n];
  for (let trial = 1; trial <= 24; trial++) {
    const center = n / 2 - 6 + trial * .5;
    let sse = 0;
    if (center % 1) {
      const first = Math.floor(center);
      for (let k = 1; k <= half; k++) sse += (at(first + k) - at(first + 1 - k)) ** 2;
    } else {
      for (let k = 1; k < half; k++) sse += (at(center - k) - at(center + k)) ** 2;
    }
    centers.push(center); mismatch.push(sse);
  }
  const maximum = Math.max(...mismatch);
  if (!(maximum > 0)) throw new Error('The counts contain no identifiable folding-center signal. Set the center manually.');
  const best = centers[mismatch.indexOf(Math.min(...mismatch))];
  const site = newSite(0, 'Singlet'); site.profile = 'Gaussian'; site.name = 'Folding symmetry';
  site.params.cs = parameter(best, true, Math.max(1, best - 10), Math.min(n, best + 10));
  site.params.fwhm = parameter(8, true, .001, null);
  // Fit the inverted Gaussian peak: 100 - (bkg + gaussian). This is identical
  // to getfp.m's positive Gaussian model but uses the core's absorption sign.
  site.params.intensity = parameter((100 - Math.min(...mismatch) / maximum * 100) * Math.PI * 4, true, 0, null);
  const project: Project = { spectrum: { x: centers, y: mismatch.map(v => v / maximum * 100) }, sites: [site], background: [parameter(100)], mode: 'thin', weighting: 'unweighted', source_fwhm: .097, source_squared: false, max_iterations: 300 };
  return { centers, mismatch, project, best };
}

export async function estimateFoldCenter(data: number[], fit: (project: Project) => Promise<FitResult>): Promise<FoldEstimate> {
  const scan = foldCenterScan(data);
  const result = await fit(scan.project);
  const value = result.project.sites[0].params.cs.value;
  const refined = result.converged && Number.isFinite(value) && value >= 1 && value <= data.length;
  return { center: Math.round((refined ? value : scan.best) * 2) / 2, refined, scan };
}
