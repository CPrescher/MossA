import type { ComparisonResult } from './comparison';
import { statisticalEvidence, type ComparisonAssessment } from './comparison-assessment';
import { formatResult, formatStd } from './results';

export function ComparisonVerdict({ assessment }: { assessment:ComparisonAssessment }) {
  return <>
    <h3>{assessment.title}</h3><p className="comparison-verdict">{assessment.explanation}</p>
    {assessment.rmsReductionPercent != null && <p><strong>Residual RMS improves by {assessment.rmsReductionPercent.toFixed(1)}%</strong> ({formatResult(assessment.rmsBefore)} → {formatResult(assessment.rmsAfter)}). This describes the size of the change; a statistically detectable change can be visually small.</p>}
    {!!assessment.flags.length && <ul className="comparison-caution-summary">{assessment.flags.map(flag => <li key={flag.code}>{flag.title}</li>)}</ul>}
  </>;
}
export function ComparisonAssessmentPanel({ result, assessment, alternative, checkingNoise }: { result:ComparisonResult; assessment:ComparisonAssessment; alternative?:ComparisonResult|null; checkingNoise?:boolean }) {
  return <>
    <section className="comparison-checks" aria-label="Interpretation checks"><h4>Checks before interpreting another site</h4>
      {assessment.flags.length ? <ul>{assessment.flags.map(flag => <li key={flag.code}><strong>{flag.title}</strong><p>{flag.detail}</p></li>)}</ul> : <p>No caution flags were raised by the available checks. This does not validate the physical identity of a site, prove the noise model, or guarantee a global optimum.</p>}
      <p className="comparison-note">These are diagnostic screens, not additional hypothesis tests. Their thresholds are explained in the report. Physical plausibility still needs your judgment.</p>
    </section>
    <section className="comparison-noise-assumptions" aria-label="Noise assumptions"><h4>What the noise model assumes</h4>
      {result.options.noise === 'poisson' ? <><p><strong>Poisson counting noise:</strong> independent raw counts, with variance equal to the fitted mean. Normalization, background subtraction, smoothing, and detector effects can change that relationship. Integer-valued data alone do not establish Poisson noise.</p>
        {(result.options.doubledFirstChannel || result.options.doubledLastChannel) && <p>The doubled {result.options.doubledLastChannel ? 'last' : 'first'} turnaround channel uses twice the usual count variance.</p>}
        <p>Residual variance / Poisson expectation: <strong>{formatResult(assessment.noise.simpler.poissonDispersion,3)}×</strong> (simpler), <strong>{formatResult(assessment.noise.larger.poissonDispersion,3)}×</strong> (larger). Values near 1 are compatible with counting scatter; model mismatch can also raise them.</p></> : <><p><strong>Gaussian residual noise:</strong> independent observations with one common std of <strong>{formatResult(result.noiseStd)}</strong>, estimated from the simpler fit as √(SSE / residual dof).</p><p>This treats unexplained residual scatter as noise, including any weak real signal or model mismatch. It assumes equal variance across all channels, including folded turnaround channels. It is an alternative assumption, not automatically a better description of raw counts.</p></>}
      <p>Calibration and source settings are fixed. Their uncertainties and correlated noise are not simulated. {alternative ? 'Both noise checks are shown together above; do not select a noise model solely because its p-value supports the preferred answer.' : checkingNoise ? 'The noise sensitivity check is in progress; the original comparison remains valid under its selected assumptions.' : 'Noise sensitivity has not been checked by a second completed simulation yet.'}</p>
    </section>
    <section className="comparison-added-parameters" aria-label="Added component uncertainties"><h4>How well is the added component determined?</h4>
      {assessment.addedSites.map(site => <div key={site.index} className="comparison-added-site"><h5>{site.name}</h5>
        <p><strong>Relative intensity: {formatResult(site.fraction?.value,3)}% ± {formatStd(site.fraction?.error)} percentage points</strong></p>
        <table aria-label={`${site.name} parameter uncertainties`}><thead><tr><th>Parameter</th><th>Value</th><th>Approx. std</th></tr></thead><tbody>{site.parameters.map(p => <tr key={p.id}><th>{p.label}{p.unit && <small> {p.unit}</small>}</th><td>{formatResult(p.value)}</td><td>{p.state === 'fixed' ? 'fixed' : formatStd(p.error)}</td></tr>)}</tbody></table>
      </div>)}
      <p className="comparison-note">Approximate local 1 std estimates include fitted-parameter correlations where available. They are not confidence bounds or a separate component-detection test; boundaries and nonlinear trade-offs can make them unreliable. “—” means unavailable, not zero. Intensity fractions do not by themselves identify atomic populations.</p>
    </section>
  </>;
}

export function NoiseSensitivityResults({result,alternative}:{result:ComparisonResult;alternative:ComparisonResult}) {
  return <section className="comparison-noise-sensitivity" aria-label="Noise sensitivity results"><h4>Noise sensitivity · both results retained</h4><table><thead><tr><th>Noise</th><th>p-value</th><th>95% MC interval</th></tr></thead><tbody>{[result,alternative].map(r => <tr key={r.options.noise}><th>{r.options.noise === 'poisson' ? 'Poisson' : 'Gaussian'}</th><td>{formatResult(r.pValue,3)}</td><td>{formatResult(r.monteCarloInterval[0],3)}–{formatResult(r.monteCarloInterval[1],3)}<small className="comparison-noise-classification">{statisticalEvidence(r) === 'borderline' ? 'MC interval crosses 0.05' : statisticalEvidence(r) === 'improvement' ? 'Statistical improvement' : 'No clear improvement'}</small></td></tr>)}</tbody></table><p>These classifications describe statistical evidence, not physical site identity. Each check used {result.options.simulations} spectra, seed {result.options.seed}, and the same model constraints. The two noise processes generate different synthetic spectra.</p></section>;
}
