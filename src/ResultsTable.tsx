import { plainScientificLabel } from './plain-label';
import { revealSelectedResult } from './result-scroll';
import { useEffect, useRef } from 'react';
import { ScientificLabel } from './ScientificLabel';
import type { FitSummary } from './session';
import { siteColor, colors, keys, type Evaluation, type Project } from './types';
import { formatParenthetical, resultCellLabel, intensityFractions, parameterValue, uncertainty } from './results';

export function ResultsTable({ project, evaluation, result, selected, onSelect }: { project: Project; evaluation: Evaluation | null; result: FitSummary | null; selected: number; onSelect: (index: number) => void }) {
  const table=useRef<HTMLTableElement>(null);
  useEffect(()=>{revealSelectedResult(table.current);},[selected,project.sites.length]);
  const fractions = intensityFractions(project,evaluation,result);
  const columns = [
    {key:'fraction',label:'Fraction',unit:'%',title:'Site intensity fraction: 100 × site intensity / total site intensity; absorber-intensity fraction in full-transmission mode'},
    {key:'cs',label:'CS',unit:'mm/s'}, {key:'fwhm',label:'FWHM',unit:'mm/s'},
    {key:'intensity',label:'Intensity',unit:'raw',title:'Raw MossA intensity parameter, before percentage normalization'},
    {key:'qs',label:'QS',unit:'mm/s'}, {key:'bhf',label:'BHF',unit:'T'}, {key:'a12',label:'A12'}, {key:'a13',label:'A13'},
    {key:'mix',label:'Lorentz mix',title:'Pseudo-Voigt Lorentzian mixing fraction (L fraction in the editor, 0–1); not the site intensity percentage'},
  ].filter(column => column.key === 'fraction' || project.sites.some(site => keys(site).includes(column.key) || !!site.xvbf && ['cs','qs'].includes(column.key)));

  return <table ref={table} className="parameter-results" aria-label="Site parameters"><caption className="visually-hidden">Values with approximate 1 std in parentheses in the last quoted digits; fixed means held fixed. A dash in parentheses means std unavailable after fitting. Linked parameters follow their source.</caption><thead title="Values with approximate 1 std in parentheses, in the last quoted digits; (—) means std unavailable, fixed means the parameter was held fixed"><tr><th scope="col">Site</th><th scope="col">Type</th>{columns.map(column => <th scope="col" key={column.key} title={column.title}>{column.label}{column.unit && <> <small>{column.unit}</small></>}</th>)}</tr></thead>
    <tbody>{!project.sites.length && <tr><td colSpan={columns.length+2} className="empty-results">{project.spectrum.x.length ? 'No sites · background-only model' : 'No spectrum loaded'}</td></tr>}{project.sites.map((site,i) => {
      const fraction = fractions[i];
      const fractionTitle = fraction.value === null ? 'Undefined: total site intensity is zero or invalid.' : !result ? 'Current intensity fraction; fit the current model to estimate its std.' : fraction.error === null ? 'Fraction std unavailable; refit older projects, or inspect bounds and fit identifiability.' : fraction.error === 0 ? 'The fraction is fixed by model settings or exact link ratios (0 std).' : `Approximate 1 std: ${fraction.error} percentage points; includes parameter correlations.`;
      return <tr key={i} className={selected === i ? 'selected-row' : ''} tabIndex={selected === i ? 0 : -1} aria-current={selected === i ? 'true' : undefined} onClick={() => onSelect(i)} onKeyDown={event => { if (['Enter',' '].includes(event.key)) { event.preventDefault(); onSelect(i); } if (['ArrowUp','ArrowDown','Home','End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? project.sites.length - 1 : Math.max(0, Math.min(project.sites.length - 1, i + (event.key === 'ArrowDown' ? 1 : -1))); onSelect(next); event.currentTarget.parentElement?.querySelectorAll<HTMLTableRowElement>('tr')[next]?.focus({preventScroll:true}); } }}><th scope="row" title={`${i+1} · ${plainScientificLabel(site.name)}`}><span className="table-site"><span className="table-site-number" aria-hidden="true">{i+1}</span><i style={{ background: siteColor(site,i) }}/><span className="table-site-name"><ScientificLabel name={site.name}/></span></span></th><td>{site.xvbf?'xVBF':site.kind}</td>{columns.map(({key}) => {
        if (key === 'fraction') { const formatted = formatParenthetical(fraction.value,fraction.error); return <td key={key} data-parameter={key} className="fraction-result" title={fractionTitle} aria-label={resultCellLabel(fraction.value,fraction.error,fractionTitle)}><span className="result-value">{formatted.value}</span><span className="uncertainty" data-state={!result?'needs-fit':fraction.error == null ? 'unavailable' : 'estimated'}>{!result?'':fraction.error == null ? ' (—)' : formatted.suffix}</span></td>; }
        if (!keys(site).includes(key) && !(site.xvbf && ['cs','qs'].includes(key))) return <td key={key} data-parameter={key}>—</td>;
        const value = parameterValue(project,evaluation,i,key), error = uncertainty(project,result,`site:${i}:${key}`), formatted = formatParenthetical(value,error.error);
        return <td key={key} data-parameter={key} title={`${value}\n${error.reason}`} aria-label={`${resultCellLabel(value,error.error,error.reason)}${site.params[key].link?'. Linked parameter.':''}`}><span className="result-value">{formatted.value}{site.params[key].link && <span className="linked-table" title="Linked parameter"> ↗</span>}</span><span className={error.state === 'fixed' ? 'result-fixed' : 'uncertainty'} data-state={error.state}>{error.state === 'fixed' ? ' fixed' : error.state==='needs-fit'?'':error.error == null ? ' (—)' : formatted.suffix}</span></td>;
      })}</tr>;
    })}</tbody></table>;
}
