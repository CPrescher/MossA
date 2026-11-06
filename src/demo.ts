import { newSite, parameter, type Project } from './types';
// Synthetic, seeded teaching example. These are not measured or MATLAB-fitted data.
export function demo(): Project {
  const a = newSite(0, 'Sextet'); a.name = 'α-Fe · sextet';
  Object.assign(a.params.cs, { value: .02 }); Object.assign(a.params.fwhm, { value: .38 }); Object.assign(a.params.intensity, { value: 2050 }); Object.assign(a.params.bhf, { value: 32.6 }); Object.assign(a.params.qs, { value: 0, fit: false });
  const b = newSite(1); b.name = 'Fe²⁺ · doublet'; b.params.cs.value = 1.; b.params.qs.value = 2.; b.params.fwhm.value = .4; b.params.intensity.value = 600;
  const x = Array.from({ length: 512 }, (_, i) => -10 + 20 * i / 511);
  const l = (v: number, c: number, w: number, area: number) => area / (Math.PI * w / 2 * (1 + ((v - c) / (w / 2)) ** 2));
  let seed = 7812;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed + 1) / 4294967297; };
  const y = x.map(v => {
    const centers = [-.1613, -.0934, -.0255, .0255, .0934, .1613].map(k => .12 + k * 33.1);
    const weights = [3, 2, 1, 1, 2, 3];
    const sextet = centers.reduce((s, c, i) => s + l(v, c, .29, 2400 * weights[i] / 12), 0);
    const doublet = l(v, 1.18 - 2.25 / 2, .31, 360) + l(v, 1.18 + 2.25 / 2, .31, 360);
    return 100000 - sextet - doublet + 9 * Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
  });
  return { spectrum: { x, y }, sites: [a, b], background: [parameter(100000)], mode: 'thin', source_fwhm: .097, source_squared: false, weighting: 'unweighted', max_iterations: 200 };
}
