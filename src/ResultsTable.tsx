import { ScientificLabel } from './ScientificLabel';
import type { FitSummary } from './session';
import { colors, keys, type Evaluation, type Project } from './types';
import { formatFraction, formatResult, formatStd, intensityFractions, parameterValue, uncertainty } from './results';

export function ResultsTable({ project, evaluation, result, selected, onSelect }: { project: Project; evaluation: Evaluation | null; result: FitSummary | null; selected: number; onSelect: (index: number) => void }) {
  const fractions = intensityFractions(project,evaluation,result);
  return <table className="parameter-results" aria-label="Site parameters"><thead title="Values and approximate 1 std; — means unavailable, fixed means the parameter was held fixed"><tr><th>Site</th><th>Type</th><th title="Site intensity fraction: 100 × site intensity / total site intensity; absorber-intensity fraction in full-transmission mode">Intensity <small>%</small></th><th>CS <small>mm/s</small></th><th>FWHM <small>mm/s</small></th><th title="Raw MossA intensity parameter, before percentage normalization">Intensity <small>raw</small></th><th>QS <small>mm/s</small></th><th>BHF <small>T</small></th><th>A12</th><th>A13</th><th title="Pseudo-Voigt Lorentzian mixing fraction (0–1); not the site intensity percentage">Lorentz mix</th></tr></thead>
    <tbody>{!project.sites.length && <tr><td colSpan={11} className="empty-results">{project.spectrum.x.length ? 'No sites · background-only model' : 'No spectrum loaded'}</td></tr>}{project.sites.map((site,i) => {
      const fraction = fractions[i];
      const fractionTitle = fraction.value === null ? 'Undefined: total site intensity is zero or invalid.' : !result ? 'Current intensity fraction; fit the current model to estimate its std.' : fraction.error === null ? 'Fraction std unavailable; refit older projects, or inspect bounds and fit identifiability.' : fraction.error === 0 ? 'The fraction is fixed by model settings or exact link ratios (0 std).' : `Approximate 1 std: ${fraction.error} percentage points; includes parameter correlations.`;
      return <tr key={i} className={selected === i ? 'selected-row' : ''} onClick={() => onSelect(i)}><td><span className="table-site"><i style={{ background: colors[i % colors.length] }}/><ScientificLabel name={site.name}/></span></td><td>{site.xvbf?'xVBF':site.kind}</td>{['fraction','cs','fwhm','intensity','qs','bhf','a12','a13','mix'].map(key => {
        if (key === 'fraction') return <td key={key} data-parameter={key} className="fraction-result" title={fractionTitle}><span className="result-value">{formatFraction(fraction.value,fraction.error)}</span><span className="uncertainty" data-state={fraction.error == null ? 'unavailable' : 'estimated'}>± {formatStd(fraction.error)}</span></td>;
        if (!keys(site).includes(key) && !(site.xvbf && ['cs','qs'].includes(key))) return <td key={key} data-parameter={key}>—</td>;
        const value = parameterValue(project,evaluation,i,key), error = uncertainty(project,result,`site:${i}:${key}`);
        return <td key={key} data-parameter={key} title={`${value}\n${error.reason}`}><span className="result-value">{formatResult(value)}{site.params[key].link && <span className="linked-table" title="Linked parameter"> ↗</span>}</span><span className={error.state === 'fixed' ? 'result-fixed' : 'uncertainty'} data-state={error.state}>{error.state === 'fixed' ? 'fixed' : `± ${formatStd(error.error)}`}</span></td>;
      })}</tr>;
    })}</tbody></table>;
}
