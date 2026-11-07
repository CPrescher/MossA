import { saveText } from './file-save';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Evaluation, Project } from './types';
import type { SpectrumEntry } from './workspace';
import { acceptableFit, nestingIssue, noiseIssue, type ComparisonOptions, type ComparisonProgress, type ComparisonResult } from './comparison';
import { startComparison, comparisonWorkerCount } from './comparison-client';
import { buildInfo } from './version';
import { niceTicks, formatTick } from './axes.mjs';
import { assessComparison, automaticNoiseSensitivityTriggers } from './comparison-assessment';
import { ComparisonAssessmentPanel, ComparisonVerdict, NoiseSensitivityResults } from './ComparisonAssessment';

const number = (v: number | null | undefined) => v == null ? '—' : Number(v.toPrecision(5)).toLocaleString('en-US', { maximumSignificantDigits: 5 });
type NoiseCheck = { origin:'automatic'|'manual'; status:'running'|'complete'|'canceled'|'failed'|'unavailable'; triggerCodes:string[]; reason?:string };

export function ComparisonPlot({ x, y, curves, names }: { x: number[]; y: number[]; curves: Evaluation[]; names: string[] }) {
  const svg = useRef<SVGSVGElement>(null), [size, setSize] = useState({ width: 810, height: 415 });
  useEffect(() => {
    if (!svg.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width), height = Math.round(entry.contentRect.height);
      if (width > 0 && height > 0) setSize(old => old.width === width && old.height === height ? old : { width, height });
    });
    observer.observe(svg.current); return () => observer.disconnect();
  }, []);
  const { width, height } = size;
  const left = 82, right = width - 24, top = 20, bottom = top + (height - 88) * .68, rtop = bottom + 24, rbottom = height - 44;
  let lo = Infinity, hi = -Infinity, rm = 1;
  y.forEach(v => { lo = Math.min(lo, v); hi = Math.max(hi, v); });
  curves.forEach(c => { c.y.forEach(v => { lo = Math.min(lo, v); hi = Math.max(hi, v); }); c.residual.forEach(v => { rm = Math.max(rm, Math.abs(v)); }); });
  const pad = (hi - lo || Math.abs(hi) * .01 || 1) * .08; lo -= pad; hi += pad;
  const px = (i: number) => left + (x[i] - x[0]) / (x.at(-1)! - x[0]) * (right - left);
  const py = (v: number) => bottom - (v - lo) / (hi - lo) * (bottom - top);
  const pr = (v: number) => (rtop + rbottom) / 2 - v / (rm * 1.1) * (rbottom - rtop) / 2;
  // Keep all model samples, including narrow lines; only observation markers are thinned.
  const path = (values: number[], residual = false) => values.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(2)},${(residual ? pr(v) : py(v)).toFixed(2)}`).join('');
  const colors = ['var(--comparison-simpler)', 'var(--comparison-larger)'];
  const xt = niceTicks(x[0], x.at(-1)!, 6), yt = niceTicks(lo, hi, 5), rt = niceTicks(-rm, rm, 3);
  return <div className="comparison-plot"><svg ref={svg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Observed spectrum and residuals with ${names.join(' and ')}`}>
    <rect className="plot-background" width={width} height={height}/>
    {yt.values.map(v => <g key={v}><line className="grid" x1={left} x2={right} y1={py(v)} y2={py(v)}/><text className="tick" x={left - 8} y={py(v) + 4} textAnchor="end">{formatTick(v, yt.step)}</text></g>)}
    {xt.values.map(v => { const xx = left + (v - x[0]) / (x.at(-1)! - x[0]) * (right - left); return <g key={v}><line className="grid" x1={xx} x2={xx} y1={top} y2={bottom}/><text className="tick" x={xx} y={rbottom + 18} textAnchor="middle">{formatTick(v, xt.step)}</text></g>; })}
    {y.map((v, i) => i % Math.max(1, Math.ceil(y.length / 1500)) === 0 && <circle key={i} cx={px(i)} cy={py(v)} className="observed-point" r="1.6"/>)}
    {curves.map((c, i) => <g key={i} fill="none" stroke={colors[i]} strokeWidth="1.7" strokeDasharray={i ? '7 3' : undefined}><path d={path(c.y)}/><path d={path(c.residual, true)}/></g>)}
    <path className="axis" d={`M${left},${top}V${bottom}H${right}M${left},${rtop}V${rbottom}H${right}`} fill="none"/>
    <line x1={left} x2={right} y1={pr(0)} y2={pr(0)} className="comparison-zero" strokeDasharray="3 3"/>
    {rt.values.map(v => <text className="tick" key={v} x={left - 8} y={pr(v) + 4} textAnchor="end">{formatTick(v, rt.step)}</text>)}
    <text className="axis-label" transform={`translate(16 ${(top + bottom) / 2}) rotate(-90)`} textAnchor="middle">Counts / intensity</text><text className="axis-label" transform={`translate(16 ${(rtop + rbottom) / 2}) rotate(-90)`} textAnchor="middle">Data − model</text><text className="axis-label" x={(left + right) / 2} y={height - 7} textAnchor="middle">Velocity (mm/s)</text>
  </svg><div className="comparison-legend"><span>● Observations</span>{names.map((name, i) => <span key={i} style={{ color: colors[i] }}>{i ? '┄' : '━'} {name}</span>)}</div></div>;
}

export function CompareModelsDialog({ spectrum, activeModelId, evaluate, onClose, run = startComparison }: {
  spectrum: SpectrumEntry; activeModelId: string; evaluate: (p: Project) => Promise<Evaluation>; onClose: () => void; run?: typeof startComparison;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const first = spectrum.models.reduce((a, b) => a.project.sites.length <= b.project.sites.length ? a : b);
  const initialLarger = spectrum.models.find(m => m.id === activeModelId && m.id !== first.id) ?? spectrum.models.find(m => m.id !== first.id)!;
  const [simplerId, setSimplerId] = useState(first.id), [largerId, setLargerId] = useState(initialLarger.id);
  const simple = spectrum.models.find(m => m.id === simplerId)!, large = spectrum.models.find(m => m.id === largerId)!;
  const a = useMemo(() => ({ ...simple.project, spectrum: spectrum.spectrum }), [simple, spectrum]);
  const b = useMemo(() => ({ ...large.project, spectrum: spectrum.spectrum }), [large, spectrum]);
  const [options, setOptions] = useState<ComparisonOptions>({ simulations: 199, seed: 7812,
    noise: spectrum.spectrum.y.every(v => Number.isInteger(v) && v >= 0) ? 'poisson' : 'gaussian',
    doubledFirstChannel: false, workers: 0 });
  const doubledTurnaround = !!spectrum.raw && spectrum.cal.folding && Number.isInteger(spectrum.cal.center);
  const effectiveOptions = { ...options, doubledFirstChannel: options.noise === 'poisson' && doubledTurnaround && !spectrum.velocityReversed,
    ...(spectrum.velocityReversed ? { doubledLastChannel: options.noise === 'poisson' && doubledTurnaround } : {}) };
  const [preview, setPreview] = useState<Evaluation[] | null>(null), [previewError, setPreviewError] = useState('');
  const [result, setResult] = useState<ComparisonResult | null>(null), [error, setError] = useState('');
  const [alternative, setAlternative] = useState<ComparisonResult | null>(null), [checkingNoise,setCheckingNoise] = useState(false), [noiseError,setNoiseError] = useState('');
  const [noiseCheck,setNoiseCheck] = useState<NoiseCheck|null>(null);
  const [progress, setProgress] = useState<ComparisonProgress | null>(null);
  const task = useRef<ReturnType<typeof startComparison> | null>(null), generation = useRef(0);
  useEffect(() => { dialog.current?.showModal(); return () => { generation.current++; task.current?.cancel(); }; }, []);
  useEffect(() => {
    let current = true; setPreview(null); setPreviewError('');
    void Promise.all([evaluate(a), evaluate(b)]).then(values => { if (current) setPreview(values); }).catch(e => { if (current) setPreviewError(String(e)); });
    return () => { current = false; };
  }, [a, b, evaluate]);
  function clearResult() { setResult(null); setAlternative(null); setError(''); setNoiseError(''); setNoiseCheck(null); }
  function changeOptions(patch: Partial<ComparisonOptions>) { setOptions(o => ({ ...o, ...patch })); clearResult(); }
  function selectModel(value: string, simpler: boolean) { (simpler ? setSimplerId : setLargerId)(value); clearResult(); }
  const issue = simplerId === largerId ? 'Choose two different models.' : nestingIssue(a, b) ?? noiseIssue(a, effectiveOptions);
  const validOptions = Number.isInteger(options.seed) && options.seed >= 0 && options.seed <= 4294967295;
  function alternativeOptionsFor(base:ComparisonOptions):ComparisonOptions {
    const noise = base.noise === 'poisson' ? 'gaussian' : 'poisson';
    return { ...base,noise,doubledFirstChannel:noise === 'poisson' && doubledTurnaround && !spectrum.velocityReversed,
      doubledLastChannel:noise === 'poisson' && doubledTurnaround && !!spectrum.velocityReversed };
  }
  const alternativeOptions = alternativeOptionsFor(result?.options ?? effectiveOptions), alternativeNoise = alternativeOptions.noise;
  const alternativeIssue = noiseIssue(a,alternativeOptions);
  const assessment = useMemo(() => result ? assessComparison(result,alternative) : null,[result,alternative]);
  async function simulate(sensitivity = false) {
    if (task.current || issue || !validOptions || (sensitivity && (!result || alternativeIssue))) return;
    const chosenOptions = sensitivity ? alternativeOptions : effectiveOptions;
    const token = ++generation.current;
    let inSensitivity = sensitivity;
    let calculationSequence = 0;
    if (sensitivity) { setAlternative(null); setNoiseError(''); setCheckingNoise(true); setNoiseCheck({origin:'manual',status:'running',triggerCodes:[]}); }
    else clearResult();
    setProgress({ phase: sensitivity ? 'Checking the alternative noise assumption' : 'Starting comparison', completed: 0, total: chosenOptions.simulations });
    async function calculate(calculationOptions:ComparisonOptions) {
      const sequence = ++calculationSequence, secondary = inSensitivity;
      const calculation = run(a,b,calculationOptions,value => {
        if (token === generation.current && sequence === calculationSequence) setProgress({ ...value,phase:secondary ? `${calculationOptions.noise} sensitivity · ${value.phase}` : value.phase });
      });
      task.current = calculation;
      return calculation.promise;
    }
    try {
      const value = await calculate(chosenOptions);
      if (token !== generation.current) return;
      if (sensitivity) { setAlternative(value); setNoiseCheck(check => check ? {...check,status:'complete'} : check); }
      else {
        setResult(value);
        const triggers = automaticNoiseSensitivityTriggers(value);
        if (triggers.length) {
          const gaussianOptions = alternativeOptionsFor(value.options), unavailable = noiseIssue(a,gaussianOptions);
          const automatic:NoiseCheck = {origin:'automatic',status:unavailable ? 'unavailable' : 'running',triggerCodes:triggers.map(flag => flag.code),...(unavailable ? {reason:unavailable} : {})};
          setNoiseCheck(automatic);
          if (unavailable) return;
          inSensitivity = true; setCheckingNoise(true);
          setProgress({phase:'Automatically checking Gaussian noise sensitivity',completed:0,total:gaussianOptions.simulations});
          const checked = await calculate(gaussianOptions);
          if (token === generation.current) { setAlternative(checked); setNoiseCheck({...automatic,status:'complete'}); }
        }
      }
    } catch (e) {
      if (token === generation.current) {
        (inSensitivity ? setNoiseError : setError)(e instanceof Error ? e.message : String(e));
        if (inSensitivity) setNoiseCheck(check => check ? {...check,status:'failed'} : check);
      }
    }
    finally { if (token === generation.current) { task.current = null; setProgress(null); setCheckingNoise(false); } }
  }
  function cancel() { generation.current++; task.current?.cancel(); task.current = null; setProgress(null);
    if (checkingNoise) { setCheckingNoise(false); setAlternative(null); setNoiseCheck(check => check ? {...check,status:'canceled'} : check); setNoiseError('Noise sensitivity check canceled. The original comparison is retained.'); }
    else { setResult(null); setAlternative(null); setError('Simulation canceled. No simulation p-value was computed.'); }
  }
  function exportReport() {
    if (!result) return;
    const report = { application: 'MossA 2', build: buildInfo, createdAt: new Date().toISOString(), spectrum: spectrum.name, models: { simpler: simple.name, larger: large.name },
      preprocessing: { calibration: spectrum.cal, raw: spectrum.raw, velocity_reversed: !!spectrum.velocityReversed, import_info: spectrum.importInfo }, result,
      interpretation:assessment, ...(alternative ? { noiseSensitivity:alternative } : {}), ...(noiseCheck ? { noiseSensitivityStatus:noiseCheck } : {}) };
    void saveText('mossa-model-comparison.json', JSON.stringify(report, null, 2) + '\n', 'application/json').catch(e => setError(String(e)));
  }
  const fits = result ? [result.simpler, result.larger] : null;
  const curves = fits?.map(f => f.evaluation) ?? preview;
  return <dialog ref={dialog} className="comparison-dialog" aria-labelledby="comparison-title" onClose={onClose} onCancel={e => { e.preventDefault(); onClose(); }} onKeyDown={e => e.stopPropagation()}>
    <header className="comparison-heading"><div><h2 id="comparison-title">Compare models</h2><p>{spectrum.name}</p></div><button autoFocus aria-label="Close model comparison" onClick={onClose}>×</button></header>
    <div className="comparison-body">
      <div className="comparison-overview"><fieldset className="comparison-selectors bare" disabled={!!progress}>
        <label className="stack-label">Simpler model<select aria-label="Simpler model" value={simplerId} onChange={e => selectModel(e.target.value, true)}>{spectrum.models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <label className="stack-label">Larger model<select aria-label="Larger model" value={largerId} onChange={e => selectModel(e.target.value, false)}>{spectrum.models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      </fieldset>
      {curves ? <ComparisonPlot x={spectrum.spectrum.x} y={spectrum.spectrum.y} curves={curves} names={[simple.name, large.name]}/> : <p role="status">{previewError || 'Evaluating model curves…'}</p>}
      <div className="comparison-table-scroll"><table className="comparison-table"><caption>{result ? 'Refitted observed models used in the test' : 'Current models · Run simulation test refits both models'}</caption><thead><tr><th>Model</th><th>Sites</th><th>Free parameters</th><th>Residual dof</th><th>{a.weighting === b.weighting && a.weighting === 'counts' ? 'Weighted SSE' : 'Objective'}</th><th>Reduced</th><th>Fit status</th></tr></thead><tbody>{[simple, large].map((m, i) => {
        const fit = fits?.[i] ?? m.fit, objective = curves?.[i].objective;
        return <tr key={i}><th>{m.name}</th><td>{m.project.sites.length}</td><td>{fit?.free_parameters ?? '—'}</td><td>{fit?.dof ?? '—'}</td><td>{number(objective)}</td><td>{number(fit ? objective == null ? fit.reduced_objective : objective / fit.dof : null)}</td><td>{fit ? fit.converged ? 'Converged' : result && acceptableFit(fit) ? 'Stationary · solver stopped' : 'Stopped' : 'Not fitted'}</td></tr>;
      })}</tbody></table></div>
      {a.weighting !== b.weighting && <p className="comparison-note">Objectives use different weightings and cannot be compared numerically.</p>}
      {fits?.map((fit, i) => fit.warnings.length > 0 && <details key={i}><summary>{i ? large.name : simple.name}: observed fit warnings</summary>{fit.warnings.map((w, j) => <p key={j}>{w}</p>)}</details>)}
      </div><div className="comparison-controls"><section className="comparison-test"><h3>Does the additional component improve the fit beyond noise?</h3>
        <p className="comparison-help"><a href="./manual/foundations/model-comparison/" target="_blank" rel="noreferrer">F-test explained, with an interactive example ↗</a></p>
        <p>Simulate spectra from the fitted simpler model, refit both models to every spectrum, and compare their improvement with the measured improvement. Bounds, links, and fixed values are preserved. Stalled fits automatically retry on the same spectrum with a simpler-model start and additional iterations.</p>
        <fieldset className="comparison-settings bare" disabled={!!progress}>
          <label className="stack-label">Measurement noise<select aria-label="Measurement noise" value={options.noise} onChange={e => changeOptions({ noise: e.target.value as ComparisonOptions['noise'] })}><option value="poisson">Poisson · raw counting statistics</option><option value="gaussian">Gaussian · common residual std</option></select></label>
          <label className="stack-label">Simulated spectra<select aria-label="Simulated spectra" value={options.simulations} onChange={e => changeOptions({ simulations: Number(e.target.value) })}>{[99, 199, 999, 4999].map(n => <option key={n} value={n}>{n.toLocaleString('en-US')}</option>)}</select></label>
          <label className="stack-label">Random seed<input type="number" aria-label="Random seed" min="0" max="4294967295" step="1" value={Number.isNaN(options.seed) ? '' : options.seed} onChange={e => changeOptions({ seed: e.target.value === '' ? NaN : Number(e.target.value) })}/></label>
          <label className="stack-label comparison-workers">CPU workers<select aria-label="CPU workers" value={options.workers ?? 0} onChange={e => changeOptions({ workers: Number(e.target.value) })}><option value="0">Auto · {comparisonWorkerCount()} worker{comparisonWorkerCount() === 1 ? '' : 's'}</option>{[1, 2, 4, 8, 16].filter(n => n <= Math.max(1, (typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency || 2) - 1)).map(n => <option key={n} value={n}>{n === 1 ? '1 · Single worker' : `${n} · Parallel workers`}</option>)}</select></label>
        </fieldset>
        <p className="comparison-note">{options.noise === 'poisson' ? 'Use actual, unnormalized integer counts. Counts are sampled from the simpler fitted curve, then each synthetic spectrum supplies its own count weights.' : 'Assumes independent Gaussian noise with a common std estimated from the simpler fit as √(SSE / residual dof). Use unweighted fitting.'}{doubledTurnaround && options.noise === 'poisson' ? ' The doubled self-paired turnaround channel is simulated as twice a Poisson count.' : ''} Calibration and source settings are held fixed; their uncertainty and correlated noise are not simulated.</p>
        {options.noise === 'poisson' && <p className="comparison-note">If the completed Poisson fit flags excess scatter or correlated residuals, an eligible Gaussian sensitivity check starts automatically with the same simulation count and seed. You can cancel it and keep the Poisson result.</p>}
        {issue && <p className="comparison-notice" role="status">Simulation unavailable: {issue}</p>}
        {!validOptions && <p role="alert">Enter an integer random seed between 0 and 4,294,967,295.</p>}
        <div className="comparison-run"><button className="primary" disabled={!!issue || !validOptions || !!progress || !!previewError} onClick={() => void simulate()}>Run simulation test</button>{progress && <button onClick={cancel}>Cancel simulation</button>}</div>
        {progress && <div role="status" aria-live="polite"><p>{progress.phase} · {progress.completed}/{progress.total} spectra</p><progress aria-label="Simulation progress" max={progress.total} value={progress.completed}/></div>}
        {error && <p className="comparison-notice" role="alert">{error}</p>}
        {result && assessment && <div className="comparison-result" role="status" data-caution={assessment.flags.length > 0}><ComparisonVerdict assessment={assessment}/>
          <p>{result.simpler.evaluation.objective > 0 && `The extra ${b.sites.length - a.sites.length === 1 ? 'site reduced' : 'sites reduced'} the squared fitting error by ${(100 * result.improvement / result.simpler.evaluation.objective).toFixed(1)}%. `}{result.exceedances === 0 ? `None of the ${result.options.simulations} noise-only spectra showed an improvement this large.` : `${result.exceedances} of ${result.options.simulations} noise-only spectra showed an improvement at least this large.`}</p>
          <div className="comparison-sensitivity-action"><button disabled={!!progress || !!alternativeIssue} onClick={() => void simulate(true)}>Check {alternativeNoise === 'gaussian' ? 'Gaussian' : 'Poisson'} noise sensitivity</button>
            {noiseCheck?.origin === 'automatic' && <p role="status" className="comparison-auto-noise">{noiseCheck.status === 'running' ? 'Poisson residual checks raised caution. Gaussian noise sensitivity is running automatically; the Poisson result is retained.' : noiseCheck.status === 'complete' ? 'Gaussian noise sensitivity ran automatically because Poisson residual checks raised caution. Both results are retained below.' : noiseCheck.status === 'unavailable' ? `Poisson residual checks raised caution, but automatic Gaussian sensitivity is unavailable: ${noiseCheck.reason} The Poisson result is retained.` : noiseCheck.status === 'canceled' ? 'The automatic Gaussian check was canceled. The Poisson result is retained; you can retry the check.' : 'The automatic Gaussian check failed. The Poisson result is retained; no second p-value was produced.'}</p>}
            {checkingNoise && <><p role="status">Checking {alternativeNoise} noise · {progress?.completed ?? 0}/{result.options.simulations} spectra. The original result is retained.</p><button onClick={cancel}>Cancel noise check</button></>}
            {alternativeIssue && <p className="comparison-note">Alternative noise check unavailable: {alternativeIssue}</p>}
            {noiseError && <p role="alert">{noiseError}</p>}
            <p className="comparison-note">Runs the same number of simulations and seed with the other noise assumption. Both results are retained; this check does not identify which noise model is correct.</p>
          </div>
          {alternative && <NoiseSensitivityResults result={result} alternative={alternative}/>}
          <dl className="comparison-key-statistics">
            <div><dt>Simulation p-value</dt><dd>{number(result.pValue)}<span className="comparison-stat-explanation">{result.pValue < .05 ? `An improvement this large would be unusual if ${a.sites.length} sites and the selected noise model were sufficient.` : `An improvement this large is not unusual enough to rule out ${a.sites.length} sites plus the selected noise.`} This is not the probability that either model is correct.</span></dd></div>
            <div><dt>95% Monte Carlo interval</dt><dd>{number(result.monteCarloInterval[0])}–{number(result.monteCarloInterval[1])}<span className="comparison-stat-explanation">Uncertainty from using only {result.options.simulations} simulated spectra. {result.monteCarloInterval[1] < .05 ? 'The whole interval is below the 0.05 reference threshold. This does not establish parameter identifiability or validate the noise assumptions.' : result.monteCarloInterval[0] > .05 ? 'The interval is above 0.05, so statistical support for improvement is not clear.' : 'The interval crosses 0.05. More simulations refine this uncertainty; they cannot resolve model or noise inadequacy.'}</span></dd></div>
            <div><dt>Observed objective improvement</dt><dd>{number(result.improvement)}<span className="comparison-stat-explanation">Decrease in {a.weighting === 'counts' ? 'weighted ' : ''}squared fitting error. {result.simpler.evaluation.objective > 0 && `This is a ${(100 * result.improvement / result.simpler.evaluation.objective).toFixed(1)}% reduction compared with the ${a.sites.length}-site fit.`} The simulations test whether the extra flexibility earns this improvement.</span></dd></div>
            <div><dt>Simulated improvements ≥ observed</dt><dd>{result.exceedances} / {result.options.simulations}<span className="comparison-stat-explanation">Spectra generated from the {a.sites.length}-site model whose improvement matched or exceeded the measured improvement. Zero matches does not mean zero chance.</span></dd></div>
            <div><dt>F statistic · descriptive only</dt><dd>{number(result.fStatistic)}<span className="comparison-stat-explanation">Fit improvement per extra free parameter, relative to the remaining fitting error. Shown for reference; interpret the simulated evidence alongside noise adequacy and parameter uncertainties.</span></dd></div>
          </dl>
          <ComparisonAssessmentPanel result={result} assessment={assessment} alternative={alternative} checkingNoise={checkingNoise}/>
          <details className="comparison-statistical-details"><summary>Calculation and recovery details</summary>
          {result.noiseStd !== null && <p>Simulated Gaussian std: {number(result.noiseStd)} in the spectrum’s intensity units.</p>}
          <p>The p-value is (exceedances + 1) / (simulations + 1), so it is never reported as zero. The interval describes simulation sampling uncertainty. A p-value is not the probability that a component is real. No conventional F-distribution p-value is used for added components.</p>
          {result.execution && <p>Calculated with {result.execution.workers} CPU worker{result.execution.workers === 1 ? '' : 's'}.</p>}{result.warnings.map((w, i) => <p key={i}>{w}</p>)}</details><button disabled={!!progress} onClick={exportReport}>Export comparison report</button><p className="comparison-note">Export to keep the result, uncertainties, diagnostic rules, and both completed noise checks. The project’s models are unchanged.</p>
        </div>}
      </section>
      <details><summary>Statistical method</summary><p>This is a plug-in parametric bootstrap of the decrease in the fitting objective. Added component intensities can vanish, so the ordinary F-test reference distribution is unreliable. Recovery tries a simpler-model start, an added-component start based on unexplained residual peaks, and bounded Levenberg–Marquardt continuation, and can try existing width bounds as free starting values and an expanded deterministic search when needed. Each start uses at most 2,000 iterations; recovery settings and every search are recorded. Every attempt is included in the report. All requested simulations must complete successfully; pairs that fail convergence and the independent bound-projected gradient check invalidate the run. This pairwise test does not correct for trying many different model alternatives.</p><p><a href="https://arxiv.org/abs/astro-ph/0201547" target="_blank" rel="noreferrer">Protassov et al. (2002), Statistics, Handle with Care</a></p></details>
    </div></div>
  </dialog>;
}
