import {figurePdf} from './figure-pdf';
import { useEffect, useMemo, useRef, useState } from 'react';
import {captureDialogFocus} from './focus-control';
import {safeFilenamePart} from './export-filename';
import {isTauri} from '@tauri-apps/api/core';
import type { Evaluation, Project } from './types';
import { defaultFigureOptions, figureFilename, figurePng, renderFigure, saveFigureBlob, type FigureOptions } from './figure';
import './figure-export.css';
import {useActionNotice} from './useActionNotice';
import {defaultFigureSettings,type FigureSettings} from './figure-settings';

export function FigureExportDialog({ project, evaluation, fitted, name, viewRange, initial, sitesRefreshed, onSettingsChange, onClose }: {
  project: Project; evaluation: Evaluation; fitted: boolean; name: string; viewRange: [number, number] | null; initial?:FigureSettings; sitesRefreshed?:boolean; onSettingsChange?: (settings:FigureSettings)=>void; onClose: (settings:FigureSettings) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [options, setOptions] = useState(() => initial?.options??defaultFigureOptions(project));
  const [format, setFormat] = useState<FigureSettings['format']>(initial?.format??'svg'), [dpi, setDpi] = useState(initial?.dpi??300), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [previewZoom, setPreviewZoom] = useState(false);
  const [filename, setFilename] = useState(() => initial?.filename??figureFilename(name));
  const notice=useActionNotice(sitesRefreshed?'Sites changed; export site options refreshed.':'');
  useEffect(() => { dialog.current?.showModal(); }, []);
  function reset() {const defaults=defaultFigureSettings(project,name);setOptions(defaults.options);setFormat(defaults.format);setDpi(defaults.dpi);setFilename(defaults.filename);setPreviewZoom(false);setError('');notice.show('Figure settings reset.');}
  const preview = useMemo(() => {
    try { return { svg: renderFigure(project, evaluation, options, fitted), error: '' }; }
    catch (e) { return { svg: '', error: (e as Error).message }; }
  }, [project, evaluation, options, fitted]);
  const lastValidOptions=useRef(options);
  useEffect(()=>{if(preview.svg)lastValidOptions.current=options;},[preview.svg,options]);
  const publish=useRef(onSettingsChange);publish.current=onSettingsChange;
  useEffect(()=>{if(preview.svg)publish.current?.({options,format,dpi,filename});},[preview.svg,options,format,dpi,filename]);
  const native=isTauri();
  const rangeText=(range:[number,number])=>`${Number(range[0].toPrecision(4))} to ${Number(range[1].toPrecision(4))} mm/s`;
  const savedRange=options.range&&(!viewRange||options.range.some((v,i)=>v!==viewRange[i]));
  function change<K extends keyof FigureOptions>(key: K, value: FigureOptions[K]) { setOptions(o => ({ ...o, [key]: value })); setError('');notice.clear(); }
  function move(index: number, direction: number) {
    const sites = options.sites.slice(), next = index + direction;
    [sites[index], sites[next]] = [sites[next], sites[index]];
    setOptions(o => ({ ...o, order: 'custom', sites }));notice.clear();
  }
  async function save() {
    if (!preview.svg || busy) return;
    const returnFocus=captureDialogFocus();
    setBusy(true); setError('');notice.clear();
    try {
      const blob = format === 'svg' ? new Blob([preview.svg], { type: 'image/svg+xml' }) : format==='eps'?await (await import('./figure-eps')).figureEps(preview.svg,options.width,options.height):format==='pdf'?await figurePdf(preview.svg,options.width,options.height):await figurePng(preview.svg, options.width, options.height, dpi);
      const safeName = safeFilenamePart(filename) || 'mossa-spectrum-figure';
      const saved=await saveFigureBlob(blob, `${safeName}.${format}`,returnFocus);
      notice.show(saved?(native?'Figure saved.':`Downloaded ${safeName}.${format}`):'Save canceled; figure settings kept.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="figure-export-dialog" aria-labelledby="figure-export-heading" onClose={()=>onClose({options:preview.svg?options:lastValidOptions.current,format,dpi,filename})} onKeyDown={e => e.stopPropagation()}>
    <header className="figure-export-heading"><div className="figure-export-title"><h2 id="figure-export-heading">Export figure</h2><p title={name}>{name}{!fitted && ' · Unfitted'}</p></div><button autoFocus aria-label="Close figure export" onClick={() => dialog.current?.close()}>×</button></header>
    <div className="figure-export-body">
      <div className="figure-preview-area"><div className="figure-preview-meta"><span>Live preview</span><button type="button" aria-pressed={previewZoom} onClick={() => setPreviewZoom(v => !v)}>Magnify preview</button><span>{options.width || '—'} × {options.height || '—'} mm · White background</span></div>
        <div role="region" aria-label={previewZoom ? 'Magnified figure preview; scroll to inspect' : 'Figure preview'} tabIndex={previewZoom ? 0 : undefined} className={`figure-preview-paper ${previewZoom ? 'figure-preview-magnified' : ''}`}>{preview.svg ? <div className="figure-preview-svg" dangerouslySetInnerHTML={{ __html: preview.svg }}/> : <p role="alert">{preview.error}</p>}</div>
        <p className="figure-preview-caption">Figure choices are saved with this model and restored when MossA restarts.</p>
      </div>
      <div className="figure-export-controls"><nav className="figure-section-nav" aria-label="Figure options sections"><span>Jump to</span>{[['figure-layout','Layout'],['figure-residual','Residual'],['figure-sites','Sites']].map(([id,label]) => <a key={id} href={`#${id}`} onClick={e => {e.preventDefault();document.getElementById(id)?.scrollIntoView({ block:'start' });}}>{label}</a>)}</nav>
        <section id="figure-layout"><div className="figure-section-heading"><h3>Figure & layout</h3><button type="button" onClick={reset} aria-label="Reset figure settings" title="Reset this model’s figure settings">Reset</button></div><label className="stack-label">Figure size<select aria-label="Figure size" value={`${options.width}x${options.height}`} onChange={e => { const [width, height] = e.target.value.split('x').map(Number); setOptions(o => ({ ...o, width, height }));notice.clear(); }}><option value="180x120">Journal · Double column</option><option value="90x90">Journal · Single column</option><option value="240x135">Presentation · Widescreen</option>{!['180x120', '90x90', '240x135'].includes(`${options.width}x${options.height}`) && <option value={`${options.width}x${options.height}`}>Custom</option>}</select></label>
          <div className="figure-control-pair"><label className="stack-label">Width (mm)<input aria-label="Figure width" type="number" min="70" max="300" value={Number.isNaN(options.width) ? '' : options.width} onChange={e => change('width', e.target.valueAsNumber)}/></label><label className="stack-label">Height (mm)<input aria-label="Figure height" type="number" min="60" max="300" value={Number.isNaN(options.height) ? '' : options.height} onChange={e => change('height', e.target.valueAsNumber)}/></label></div>
          <label className="stack-label">Title (optional)<input aria-label="Figure title" value={options.title} maxLength={100} onChange={e => change('title', e.target.value)}/></label>
          <div className="figure-control-pair"><label className="stack-label">Velocity range<select aria-label="Export velocity range" value={options.range ? savedRange?'saved':'view' : 'full'} onChange={e => change('range', e.target.value === 'view' ? viewRange : e.target.value==='saved'?options.range:null)}><option value="full">Full spectrum</option>{savedRange&&options.range&&<option value="saved">Saved range · {rangeText(options.range)}</option>}<option value="view" disabled={!viewRange}>{viewRange?`Current velocity range · ${Number(viewRange[0].toPrecision(4))} to ${Number(viewRange[1].toPrecision(4))} mm/s`:'Current velocity range'}</option></select></label><label className="stack-label">Legend<select aria-label="Legend position" value={options.legend} onChange={e => change('legend', e.target.value as FigureOptions['legend'])}><option value="auto">Inside · Auto placement</option><option value="top-right">Inside · Upper right</option><option value="top-left">Inside · Upper left</option><option value="bottom-right">Inside · Lower right</option><option value="bottom-left">Inside · Lower left</option><option value="above">Above figure</option><option value="below">Below figure</option><option value="right">To the right</option><option value="none">Hidden</option></select></label></div>
          <label className="check-label"><input type="checkbox" aria-label="Include data and fit in legend" checked={options.legendDataFit} disabled={options.legend === 'none'} onChange={e => change('legendDataFit', e.target.checked)}/>Include data and fit in legend</label>
          <label className="check-label"><input type="checkbox" aria-label="Include site fractions (%)" checked={options.legendFractions} disabled={options.legend === 'none'} onChange={e => change('legendFractions', e.target.checked)}/>Include site fractions (%)</label>
          {options.legendFractions && <p className="figure-control-note">Intensity fractions of all model sites, including hidden sites.{project.mode === 'transmission' && ' Absorber intensity fractions, not phase abundances.'}</p>}
          {options.legend === 'auto' && <p className="figure-control-note">Finds open space inside the axes. Moves above the figure if there is no room.</p>}
        </section>
        <section id="figure-residual"><h3>Residual</h3><div className="figure-segments" role="group" aria-label="Residual position">{(['above', 'below', 'none'] as const).map(value => <button key={value} aria-pressed={options.residual === value} onClick={() => change('residual', value)}>{value === 'none' ? 'Hidden' : value === 'above' ? 'Above' : 'Below'}</button>)}</div>
          <p className="figure-control-note">Inside the spectrum axes, on the same intensity scale. The line marks zero residual.</p>
          <label className="stack-label">Direction<select aria-label="Residual direction" disabled={options.residual === 'none'} value={options.sign} onChange={e => change('sign', e.target.value as FigureOptions['sign'])}><option value="data-model">Data − model</option><option value="model-data">Model − data</option></select></label>
        </section>
        <section id="figure-sites"><h3>Sites & colors</h3><div className="figure-control-pair"><label className="stack-label">Appearance<select aria-label="Site appearance" value={options.style} onChange={e => change('style', e.target.value as FigureOptions['style'])}><option value="filled">Solid fills + outlines</option><option value="transparent">Transparent fills + outlines</option><option value="lines">Outlines</option></select></label><label className="stack-label">Layer order<select aria-label="Site layer order" value={options.order} onChange={e => change('order', e.target.value as FigureOptions['order'])}><option value="depth">Deepest first</option><option value="custom">List order</option></select></label></div>
          {options.style==='transparent'&&<label className="stack-label">Transparency (%)<input aria-label="Site fill transparency (%)" type="number" min="0" max="100" step="1" value={Number.isNaN(options.fillOpacity)?'':Number(((1-options.fillOpacity)*100).toFixed(6))} onChange={e=>change('fillOpacity',1-e.target.valueAsNumber/100)}/><span className="figure-control-note">0% is solid; 100% leaves outlines only.</span></label>}
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
    <div className="figure-export-footer"><div className={`figure-file-controls ${native?'figure-native-file-controls':''}`} >{!native&&<label className="stack-label">Filename<input aria-label="Figure filename" value={filename} onChange={e => {setFilename(e.target.value);notice.clear();}}/></label>}<label className="stack-label">Format<select aria-label="Figure format" value={format} onChange={e => {setFormat(e.target.value as FigureSettings['format']);notice.clear();}}><option value="svg">SVG · Vector</option><option value="png">PNG · Image</option><option value="eps">EPS · Vector</option><option value="pdf">PDF · Vector</option></select></label>{format === 'png' && <label className="stack-label">Resolution<select aria-label="PNG resolution" value={dpi} onChange={e => {setDpi(Number(e.target.value));notice.clear();}}><option value="300">300 dpi</option><option value="600">600 dpi</option></select></label>}</div>
      <div className="figure-save-actions"><span role="status">{error || notice.text || (format === 'svg' ? 'Editable vector artwork' : format==='eps'?'Vector EPS · Outlined labels':format==='pdf'?'Vector PDF · Print & share': `${Math.round(options.width / 25.4 * dpi)} × ${Math.round(options.height / 25.4 * dpi)} pixels`)}</span><button className="figure-save-button" disabled={busy || !preview.svg} onClick={() => void save()} title={isTauri()?`Save ${format.toUpperCase()} figure to a folder`:undefined}>{busy ? 'Preparing…' : isTauri() ? 'Save figure…' : `Download ${format.toUpperCase()}`}</button></div>
    </div>
  </dialog>;
}
