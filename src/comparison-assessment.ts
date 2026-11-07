import type { ComparisonResult } from './comparison';
import { intensityFractions, uncertainty } from './results';
import { keys, labels, type FitResult, type Parameter } from './types';

// These are screening heuristics, not additional hypothesis tests. Keep their
// definitions in the exported interpretation so the advice is auditable.
export const assessmentRules = { relativeStd: .5, profileOverlap: .98, retainedFractionDrop: .5, residualScreenStd: 2, nearBoundTolerance:1e-5, minimumWidthChannels:2 };
export type ComparisonFlag = { code: string; title: string; detail: string };
export type ParameterAssessment = { id: string; label: string; value: number; error: number | null; state: string; unit: string };
export type NoiseAssessment = { poissonDispersion: number | null; poissonScreenLimit: number | null; lagOneCorrelation: number | null; correlationScreenLimit: number | null };
const finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
const percent = (v: number) => `${v.toFixed(1)}%`;
export function statisticalEvidence(result: ComparisonResult) {
  if (result.monteCarloInterval[0] <= .05 && result.monteCarloInterval[1] >= .05) return 'borderline' as const;
  return result.pValue < .05 ? 'improvement' as const : 'not-clear' as const;
}

export function residualAssessment(fit: FitResult, result: ComparisonResult): NoiseAssessment {
  const residual = fit.evaluation.residual, means = fit.evaluation.y;
  let standardized: number[] | null = null, poissonDispersion: number | null = null;
  if (residual.length === means.length && residual.every(Number.isFinite)) {
    if (result.options.noise === 'poisson' && means.every(mu => Number.isFinite(mu) && mu > 0)) {
      standardized = residual.map((v,i) => v / Math.sqrt(means[i] * (((i === 0 && result.options.doubledFirstChannel) || (i === means.length-1 && result.options.doubledLastChannel)) ? 2 : 1)));
      if (fit.dof > 0) poissonDispersion = standardized.reduce((sum,v) => sum+v*v,0)/fit.dof;
    } else if (result.options.noise === 'gaussian' && finite(result.noiseStd) && result.noiseStd > 0) {
      standardized = residual.map(v => v/result.noiseStd!);
    }
  }
  let lagOneCorrelation: number | null = null;
  if (standardized && standardized.length >= 20) {
    const mean = standardized.reduce((sum,v) => sum+v,0)/standardized.length;
    const centered = standardized.map(v => v-mean), denominator = centered.reduce((sum,v) => sum+v*v,0);
    if (denominator > 0) lagOneCorrelation = centered.slice(1).reduce((sum,v,i) => sum+v*centered[i],0)/denominator;
  }
  return { poissonDispersion, poissonScreenLimit: fit.dof > 0 ? 1+assessmentRules.residualScreenStd*Math.sqrt(2/fit.dof) : null,
    lagOneCorrelation, correlationScreenLimit: standardized && standardized.length >= 20 ? assessmentRules.residualScreenStd/Math.sqrt(standardized.length) : null };
}
function overlap(a: number[] | undefined, b: number[] | undefined) {
  if (!a || !b || a.length !== b.length || !a.every(Number.isFinite) || !b.every(Number.isFinite)) return null;
  const aa = a.reduce((sum,v) => sum+v*v,0), bb = b.reduce((sum,v) => sum+v*v,0);
  return aa > 0 && bb > 0 ? Math.max(0,Math.min(1,a.reduce((sum,v,i) => sum+v*b[i],0)/Math.sqrt(aa*bb))) : null;
}
function parameters(fit: FitResult, index: number): ParameterAssessment[] {
  const site = fit.project.sites[index];
  const entries: { key: string; label: string; parameter: Parameter; unit: string }[] = keys(site).map(key => ({ key, label: labels[key], parameter: site.params[key], unit: ['cs','qs','fwhm'].includes(key) ? 'mm/s' : key === 'bhf' ? 'T' : '' }));
  if (site.xvbf) {
    entries.push({ key:'delta',label:'Lorentz width',parameter:site.xvbf.delta,unit:'mm/s' });
    for (const [kind,distribution] of [['csd',site.xvbf.cs],['qsd',site.xvbf.qs]] as const) for (const [i,component] of distribution.entries()) {
      for (const key of ['center','width','weight'] as const) entries.push({key:`${kind}:${i}:${key}`,label:`${kind === 'csd' ? 'CS' : 'QS'} distribution ${i+1} ${key}`,parameter:component[key],unit:key === 'weight' ? '' : 'mm/s'});
    }
  }
  return entries.map(({key,label,parameter,unit}) => {
    const id = `site:${index}:${key}`, estimated = uncertainty(fit.project,fit,id);
    return { id,label,value:fit.evaluation.parameters[id] ?? parameter.value,error:estimated.error,state:estimated.state,unit };
  });
}

export function assessComparison(result: ComparisonResult, alternative?: ComparisonResult | null) {
  const flags: ComparisonFlag[] = [], { simpler,larger } = result;
  const before = intensityFractions(simpler.project,simpler.evaluation,simpler), after = intensityFractions(larger.project,larger.evaluation,larger);
  const addedSites = larger.project.sites.slice(simpler.project.sites.length).map((site,offset) => {
    const index = simpler.project.sites.length+offset, name = site.name || `Site ${index+1}`, fraction = after[index], rows = parameters(larger,index);
    const intensity = rows.find(p => p.id === `site:${index}:intensity`);
    if (fraction && finite(fraction.value) && finite(fraction.error) && (fraction.value <= 0 || fraction.error >= assessmentRules.relativeStd*Math.abs(fraction.value))) {
      flags.push({code:`weak-area-${index}`,title:`${name}: relative intensity is poorly determined`,detail:`${percent(fraction.value)} ± ${fraction.error.toFixed(1)} percentage points (approximate local std). The uncertainty is at least half the estimate; this is a caution flag, not a separate detection test.`});
    } else if (intensity && finite(intensity.error) && (intensity.value <= 0 || intensity.error >= assessmentRules.relativeStd*Math.abs(intensity.value))) {
      flags.push({code:`weak-area-${index}`,title:`${name}: intensity is poorly determined`,detail:'The local intensity std is at least half the fitted intensity. Inspect uncertainty and parameter trade-offs before interpreting an extra site.'});
    }
    const missing = rows.filter(p => p.state === 'unavailable');
    if (!finite(fraction?.value) || !finite(fraction?.error) || missing.length) flags.push({code:`missing-uncertainty-${index}`,title:`${name}: some uncertainties are unavailable`,detail:`${missing.length ? missing.map(p => p.label).join(', ') : 'Relative intensity'}: inspect rank deficiency and parameter bounds. Missing uncertainty does not mean zero uncertainty.`});
    const width = rows.find(p => p.id === `site:${index}:fwhm` || p.id === `site:${index}:delta`);
    if (width && finite(width.error) && width.error >= assessmentRules.relativeStd*Math.abs(width.value)) flags.push({code:`weak-width-${index}`,title:`${name}: width is poorly determined`,detail:'Its approximate local std is at least half the fitted width. The shape of the added contribution is uncertain.'});
    const atBounds = keys(site).filter(key => {
      const p = site.params[key], row = rows.find(r => r.id === `site:${index}:${key}`);
      if (!row || row.state === 'fixed') return false;
      const lower = p.min ?? (key === 'intensity' ? 0 : key === 'fwhm' ? 1e-6 : null);
      return [lower,p.max].some(bound => finite(bound) && Math.abs(row.value-bound) <= assessmentRules.nearBoundTolerance*Math.max(1,Math.abs(row.value),Math.abs(bound)));
    });
    if (atBounds.length) flags.push({code:`bound-${index}`,title:`${name}: parameters are near a bound`,detail:`Parameters at or near an existing limit: ${atBounds.map(key=>labels[key]).join(', ')}. Inspect whether the bound is physically justified; symmetric local uncertainties can be misleading there.`});
    const steps = larger.project.spectrum.x.slice(1).map((x,i)=>Math.abs(x-larger.project.spectrum.x[i])).filter(v=>v>0).sort((a,b)=>a-b), step = steps[Math.floor(steps.length/2)];
    if (width && finite(step) && width.value < assessmentRules.minimumWidthChannels*step) flags.push({code:`narrow-${index}`,title:`${name}: a very narrow profile is poorly sampled`,detail:'The fitted width spans fewer than two median velocity-channel spacings. This is a sampling warning, not a measurement of instrumental resolution; inspect stability and the physical width constraints.'});
    let closest: { index:number; overlap:number } | null = null;
    simpler.project.sites.forEach((_,i) => { const value = overlap(simpler.evaluation.components[i],larger.evaluation.components[index]); if (value != null && (!closest || value > closest.overlap)) closest = {index:i,overlap:value}; });
    // Shape similarity is not evidence of common physical identity. A large
    // redistribution makes the ambiguity worth surfacing in the headline.
    const match = closest as { index:number; overlap:number } | null;
    if (match && match.overlap >= assessmentRules.profileOverlap) {
      const old = before[match.index]?.value, retained = after[match.index]?.value;
      const redistributed = finite(old) && old > 0 && finite(retained) && retained <= (1-assessmentRules.retainedFractionDrop)*old;
      flags.push({code:`overlap-${index}`,title:redistributed ? `${name}: an existing contribution is being split` : `${name}: strong overlap with an existing contribution`,detail:`The added profile has normalized shape overlap ${match.overlap.toFixed(3)} with ${simpler.project.sites[match.index].name || `site ${match.index+1}`} in the simpler fit (1 means identical sampled shapes).${redistributed ? ` That retained contribution changes from ${percent(old!)} to ${percent(retained!)}.` : ''} This heuristic flags an ambiguous decomposition; overlapping sites can still be physically real.`});
    }
    return { index,name,fraction,parameters:rows };
  });
  if (larger.rank < larger.free_parameters) flags.push({code:'rank-deficient',title:'The larger fit is rank deficient',detail:'Some fitted parameters cannot be independently determined by this fit. Local symmetric uncertainties may be unavailable or unreliable.'});
  const noise = {simpler:residualAssessment(simpler,result),larger:residualAssessment(larger,result)};
  const n = noise.larger;
  if (result.options.noise === 'poisson' && finite(n.poissonDispersion) && finite(n.poissonScreenLimit) && n.poissonDispersion > n.poissonScreenLimit) flags.push({code:'excess-scatter',title:'Residual scatter exceeds the Poisson expectation',detail:`Even the larger fit has residual variance about ${n.poissonDispersion.toFixed(2)}× the Poisson expectation after accounting for residual degrees of freedom. This approximate screen cannot distinguish excess measurement noise, systematic errors, or an inadequate line-shape model. The p-value is conditional on pure counting noise.`});
  if (result.options.noise === 'poisson' && !finite(n.poissonDispersion)) flags.push({code:'noise-unchecked',title:'The Poisson residual check is unavailable',detail:'A positive finite fitted count mean and valid residual degrees of freedom are needed at every channel. Noise adequacy has not been established.'});
  if (finite(n.lagOneCorrelation) && finite(n.correlationScreenLimit) && Math.abs(n.lagOneCorrelation) > n.correlationScreenLimit) flags.push({code:'correlated-residuals',title:'Neighboring residuals may be correlated',detail:`Lag-one correlation is ${n.lagOneCorrelation.toFixed(2)}. Both noise options simulate independent observations; correlated noise or unresolved structure can affect the interpretation. This is an approximate screen, not a formal test.`});
  const evidence = statisticalEvidence(result), alternativeEvidence = alternative ? statisticalEvidence(alternative) : null;
  if (alternativeEvidence && alternativeEvidence !== evidence) flags.push({code:'noise-sensitive',title:'The statistical conclusion depends on the noise assumption',detail:'The two noise checks have different classifications at the 5% reference threshold, including Monte Carlo uncertainty. Neither noise model is automatically more correct; check acquisition, preprocessing, and residual structure.'});
  const rms = (fit:FitResult) => fit.evaluation.residual.length ? Math.sqrt(fit.evaluation.sse/fit.evaluation.residual.length) : null;
  const rmsBefore = rms(simpler), rmsAfter = rms(larger);
  return { version:1,rules:assessmentRules,ruleDescriptions:{
    relativeStd:'Flag local intensity/fraction or width std at least half the absolute fitted value; this is not a detection test.',
    overlap:'Normalized dot product of sampled component profiles, without mean subtraction, at least 0.98. A retained fraction drop of at least half flags redistribution. In transmission mode, these are absorber profiles before source convolution.',
    poissonScatter:'Flag the larger fit if sum(residual² / expected count variance) / residual dof exceeds 1 + 2 sqrt(2 / dof). Doubled turnaround variance is included. This approximate screen is not a calibrated goodness-of-fit p-value.',
    correlation:'Flag absolute lag-one correlation of standardized larger-model residuals above 2 / sqrt(number of channels), using at least 20 channels. Approximate screen only.',
    bounds:'Flag a non-fixed parameter within 1e-5 × max(1, absolute value, absolute bound) of a declared bound, or intrinsic intensity/width lower bound.',
    narrow:'Flag widths below two median velocity-channel spacings. This does not estimate instrumental resolution.'
  },evidence,flags,addedSites,noise,rmsBefore,rmsAfter,
    rmsReductionPercent:rmsBefore != null && rmsBefore > 0 && rmsAfter != null ? 100*(1-rmsAfter/rmsBefore) : null,
    title:evidence === 'not-clear' ? 'No clear statistical support for the extra component' : flags.length ? 'Extra component needs caution' : evidence === 'borderline' ? 'Statistical evidence is borderline' : 'Statistical improvement detected',
    explanation:evidence === 'improvement' ? 'The simulated improvement favors the larger line-shape model under the selected noise assumptions. This is not an automatic recommendation to add a physical site. Review the uncertainties and checks below.' : evidence === 'borderline' ? 'Monte Carlo uncertainty spans the 5% reference threshold. More simulations can refine the p-value, but cannot resolve questionable noise assumptions or poorly determined components.' : 'The simulation does not clearly establish improvement beyond the selected noise. Retain the simpler model as a baseline; this does not prove that a weak additional component is absent.' };
}
export type ComparisonAssessment = ReturnType<typeof assessComparison>;

// Trigger only on assessed noise concerns, not on p-values, overlapping sites,
// or uncertain component parameters. The alternative still needs eligibility
// checks and must never change the models' residual weighting.
export function automaticNoiseSensitivityTriggers(result: ComparisonResult) {
  if (result.options.noise !== 'poisson') return [];
  return assessComparison(result).flags.filter(flag => ['excess-scatter','correlated-residuals'].includes(flag.code));
}
