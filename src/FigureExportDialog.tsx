import { useEffect, useMemo, useRef, useState } from 'react';
import type {FitSummary} from './session';
import type { Evaluation, Project } from './types';
import { defaultFigureOptions, figureFilename, figurePng, renderFigure, saveFigureBlob, type FigureOptions } from './figure';
import './figure-export.css';

export function FigureExportDialog({ project, evaluation, fitted, result = null, name, viewRange, onClose }: {
  project: Project; evaluation: Evaluation; fitted: boolean; result?: FitSummary | null; name: string; viewRange: [number, number] | null; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [options, setOptions] = useState(() => defaultFigureOptions(project));
  const [format, setFormat] = useState<'svg' | 'png'>('svg'), [dpi, setDpi] = useState(300), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [filename, setFilename] = useState(() => figureFilename(name));
  useEffect(() => { dialog.current?.showModal(); }, []);
  const preview = useMemo(() => {
    try { return { svg: renderFigure(project, evaluation, options, fitted, result), error: '' }; }
    catch (e) { return { svg: '', error: (e as Error).message }; }
  }, [project, evaluation, options, fitted, result]);
  function change<K extends keyof FigureOptions>(key: K, value: FigureOptions[K]) { setOptions(o => ({ ...o, [key]: value })); setError(''); }
  function move(index: number, direction: number) {
    const sites = options.sites.slice(), next = index + direction;
    [sites[index], sites[next]] = [sites[next], sites[index]];
    setOptions(o => ({ ...o, order: 'custom', sites }));
  }
  async function save() {
    if (!preview.svg || busy) return;
    setBusy(true); setError('');
    try {
      const blob = format === 'svg' ? new Blob([preview.svg], { type: 'image/svg+xml' }) : await figurePng(preview.svg, options.width, options.height, dpi);
      const safeName = filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'mossa-spectrum-figure';
      await saveFigureBlob(blob, `${safeName}.${format}`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="figure-export-dialog" aria-labelledby="figure-export-heading" onClose={onClose} onKeyDown={e => e.stopPropagation()}>
    <header className="figure-export-heading"><div><span className="figure-export-eyebrow">MossA · Figure studio</span><h2 id="figure-export-heading">Export figure</h2><p>{name}{!fitted && ' · Current model is unfitted'}</p></div><button autoFocus aria-label="Close figure export" onClick={() => dialog.current?.close()}>×</button></header>
    <div className="figure-export-body">
      <div className="figure-preview-area"><div className="figure-preview-meta"><span>Live preview</span><span>{options.width || '—'} × {options.height || '—'} mm · White background</span></div>
        <div className="figure-preview-paper">{preview.svg ? <div className="figure-preview-svg" dangerouslySetInnerHTML={{ __html: preview.svg }}/> : <p role="alert">{preview.error}</p>}</div>
        <p className="figure-preview-caption">Colors, labels, and layout apply to this export. Your model and fit stay unchanged.</p>
      </div>
      <div className="figure-export-controls">
        <section><h3>Figure & layout</h3><label className="stack-label">Figure size<select aria-label="Figure size" value={`${options.width}x${options.height}`} onChange={e => { const [width, height] = e.target.value.split('x').map(Number); setOptions(o => ({ ...o, width, height })); }}><option value="180x120">Journal · Double column</option><option value="90x90">Journal · Single column</option><option value="240x135">Presentation · Widescreen</option>{!['180x120', '90x90', '240x135'].includes(`${options.width}x${options.height}`) && <option value={`${options.width}x${options.height}`}>Custom</option>}</select></label>
          <div className="figure-control-pair"><label className="stack-label">Width (mm)<input aria-label="Figure width" type="number" min="70" max="300" value={Number.isNaN(options.width) ? '' : options.width} onChange={e => change('width', e.target.valueAsNumber)}/></label><label className="stack-label">Height (mm)<input aria-label="Figure height" type="number" min="60" max="300" value={Number.isNaN(options.height) ? '' : options.height} onChange={e => change('height', e.target.valueAsNumber)}/></label></div>
          <label className="stack-label">Title (optional)<input aria-label="Figure title" value={options.title} maxLength={100} onChange={e => change('title', e.target.value)}/></label>
          <div className="figure-control-pair"><label className="stack-label">Velocity range<select aria-label="Export velocity range" value={options.range ? 'view' : 'full'} onChange={e => change('range', e.target.value === 'view' ? viewRange : null)}><option value="full">Full spectrum</option><option value="view" disabled={!viewRange}>Current view</option></select></label><label className="stack-label">Legend<select aria-label="Legend position" value={options.legend} onChange={e => change('legend', e.target.value as FigureOptions['legend'])}><option value="auto">Inside · Auto placement</option><option value="top-right">Inside · Upper right</option><option value="top-left">Inside · Upper left</option><option value="bottom-right">Inside · Lower right</option><option value="bottom-left">Inside · Lower left</option><option value="above">Above figure</option><option value="below">Below figure</option><option value="right">To the right</option><option value="none">Hidden</option></select></label></div>
          <label className="check-label"><input type="checkbox" aria-label="Include data and fit in legend" checked={options.legendDataFit} disabled={options.legend === 'none'} onChange={e => change('legendDataFit', e.target.checked)}/>Include data and fit in legend</label>
          <label className="check-label"><input type="checkbox" aria-label="Include site fractions (%)" checked={options.legendFractions} disabled={options.legend === 'none'} onChange={e => change('legendFractions', e.target.checked)}/>Include site fractions (%)</label>
          {options.legendFractions && <p className="figure-control-note">Intensity fractions of all model sites, including hidden sites. Fit std appear in parentheses in the last quoted digits.{project.mode === 'transmission' && ' Absorber intensity fractions, not phase abundances.'}</p>}
          {options.legend === 'auto' && <p className="figure-control-note">Finds open space inside the axes. Moves above the figure if there is no room.</p>}
        </section>
        <section><h3>Residual</h3><div className="figure-segments" role="group" aria-label="Residual position">{(['above', 'below', 'none'] as const).map(value => <button key={value} aria-pressed={options.residual === value} onClick={() => change('residual', value)}>{value === 'none' ? 'Hidden' : value === 'above' ? 'Above' : 'Below'}</button>)}</div>
          <p className="figure-control-note">Inside the spectrum axes, on the same intensity scale. The line marks zero residual.</p>
          <label className="stack-label">Direction<select aria-label="Residual direction" disabled={options.residual === 'none'} value={options.sign} onChange={e => change('sign', e.target.value as FigureOptions['sign'])}><option value="data-model">Data − model</option><option value="model-data">Model − data</option></select></label>
        </section>
        <section><h3>Sites & colors</h3><div className="figure-control-pair"><label className="stack-label">Appearance<select aria-label="Site appearance" value={options.style} onChange={e => change('style', e.target.value as FigureOptions['style'])}><option value="filled">Solid fills</option><option value="lines">Outlines</option></select></label><label className="stack-label">Layer order<select aria-label="Site layer order" value={options.order} onChange={e => change('order', e.target.value as FigureOptions['order'])}><option value="depth">Deepest first</option><option value="custom">List order</option></select></label></div>
          <p className="figure-control-note">First drawn sits behind the others. Names and colors follow each site. Labels support LaTeX, e.g. <code>{'Fe$^{2+}$'}</code> or <code>{'$\\alpha$-Fe'}</code>.</p>
          <div className="figure-site-list">{options.sites.map((s, i) => <div key={s.index} className="figure-site-row">
            <input type="checkbox" aria-label={`Show site ${s.index + 1}`} checked={s.visible} onChange={e => change('sites', options.sites.map(site => site.index === s.index ? { ...site, visible: e.target.checked } : site))}/>
            <input type="color" aria-label={`Site ${s.index + 1} color`} value={s.color} onChange={e => change('sites', options.sites.map(site => site.index === s.index ? { ...site, color: e.target.value } : site))}/>
            <input aria-label={`Site ${s.index + 1} export label`} value={s.name} maxLength={240} onChange={e => change('sites', options.sites.map(site => site.index === s.index ? { ...site, name: e.target.value } : site))}/>
            <button aria-label={`Move site ${s.index + 1} earlier`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button><button aria-label={`Move site ${s.index + 1} later`} disabled={i === options.sites.length - 1} onClick={() => move(i, 1)}>↓</button>
          </div>)}</div>
          {project.mode === 'transmission' && <p className="figure-control-note">Transmission sites are display-scaled absorber profiles. The figure includes this note.</p>}
        </section>
      </div>
    </div>
    <div className="figure-export-footer"><div className="figure-file-controls"><label className="stack-label">Filename<input aria-label="Figure filename" value={filename} onChange={e => setFilename(e.target.value)}/></label><label className="stack-label">Format<select aria-label="Figure format" value={format} onChange={e => setFormat(e.target.value as 'svg' | 'png')}><option value="svg">SVG · Vector</option><option value="png">PNG · Image</option></select></label>{format === 'png' && <label className="stack-label">Resolution<select aria-label="PNG resolution" value={dpi} onChange={e => setDpi(Number(e.target.value))}><option value="300">300 dpi</option><option value="600">600 dpi</option></select></label>}</div>
      <div className="figure-save-actions"><span role="status">{error || (format === 'svg' ? 'Editable vector artwork' : `${Math.round(options.width / 25.4 * dpi)} × ${Math.round(options.height / 25.4 * dpi)} pixels`)}</span><button className="figure-save-button" disabled={busy || !preview.svg} onClick={() => void save()}>{busy ? 'Preparing…' : `Download ${format.toUpperCase()}`}</button></div>
    </div>
  </dialog>;
}
