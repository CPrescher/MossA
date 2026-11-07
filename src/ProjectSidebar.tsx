import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FitDot } from './ProjectNavigation';
import { activeSpectrum, type Workspace } from './workspace';
import { SidebarIcon } from './SidebarIcon';
import { InlineNameEditor } from './InlineNameEditor';
import { FileActionIcon } from './FileActionIcon';

export const DEFAULT_PROJECT_SPLIT = .55;
export function projectSplitLimits(height: number) {
  const available = Math.max(1, height - 8);
  return { min: Math.max(.2, Math.min(96 / available, .45)), max: Math.min(.8, Math.max(1 - 144 / available, .55)) };
}
export function clampProjectSplit(ratio: number, height: number) {
  const { min, max } = projectSplitLimits(height);
  return Math.max(min, Math.min(max, Number.isFinite(ratio) ? ratio : DEFAULT_PROJECT_SPLIT));
}

export function ProjectSplit({ ratio, onChange, spectra, models }: { ratio: number; onChange: (ratio: number) => void; spectra: ReactNode; models: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null), drag = useRef<{ y: number; ratio: number; height: number } | null>(null);
  const [height, setHeight] = useState(600);
  useEffect(() => {
    const node = ref.current!;
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.height > 0) setHeight(entry.contentRect.height); });
    observer.observe(node); return () => observer.disconnect();
  }, []);
  const value = clampProjectSplit(ratio, height), limits = projectSplitLimits(height);
  return <div ref={ref} className="project-split" style={{ gridTemplateRows: `minmax(0, ${value}fr) 8px minmax(0, ${1 - value}fr)` }}>
    {spectra}
    <div className="project-splitter" role="separator" aria-label="Resize spectra and models" aria-orientation="horizontal" aria-valuemin={Math.round(limits.min * 100)} aria-valuemax={Math.round(limits.max * 100)} aria-valuenow={Math.round(value * 100)} aria-valuetext={`${Math.round(value * 100)}% spectra, ${Math.round((1 - value) * 100)}% models`} tabIndex={0} title="Drag to resize spectra and models; double-click to reset"
      onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); const measured = ref.current!.getBoundingClientRect().height || height; drag.current = { y: e.clientY, ratio: value, height: measured }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { if (drag.current) onChange(clampProjectSplit(drag.current.ratio + (e.clientY - drag.current.y) / Math.max(1, drag.current.height - 8), drag.current.height)); }}
      onPointerUp={e => { drag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
      onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
      onDoubleClick={() => onChange(DEFAULT_PROJECT_SPLIT)} onKeyDown={e => {
        if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) { e.preventDefault(); onChange(e.key === 'Home' ? limits.min : e.key === 'End' ? limits.max : clampProjectSplit(value + (e.key === 'ArrowDown' ? .05 : -.05), height)); }
      }}><span/></div>
    {models}
  </div>;
}

export function ProjectSidebar({ workspace, disabled, collapsed, ratio, onCollapse, onRatio, onSelect, onImport, onNew, onOpen, onSave, saveDisabled, onRename, onRemove, renamingSpectrumId, onCommitName, onCancelName, children }: {
  workspace: Workspace; disabled: boolean; collapsed: boolean; ratio: number; onCollapse: () => void;
  onRatio: (ratio: number) => void; onSelect: (id: string) => void; onImport: () => void;
  onNew?: () => void; onOpen?: () => void; onSave?: () => void; saveDisabled?: boolean;
  onRename: (kind: 'project' | 'spectrum') => void; onRemove: () => void; children: ReactNode;
  renamingSpectrumId?: string; onCommitName?: (name: string) => void; onCancelName?: () => void;
}) {
  const current = activeSpectrum(workspace), [query, setQuery] = useState('');
  const spectra = workspace.spectra.filter(s => s.spectrum.x.length);
  useEffect(() => { if (!spectra.length) setQuery(''); }, [workspace]);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.querySelector('[aria-current=true]')?.scrollIntoView?.({ block: 'nearest' }); }, [workspace.activeSpectrumId, collapsed]);
  const filtered = spectra.map((s, index) => ({ spectrum: s, index })).filter(({ spectrum }) => spectrum.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <aside className={`project-sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="Project browser">
    <div className="project-sidebar-heading"><button className="sidebar-toggle project-collapse" aria-label={collapsed ? 'Expand project sidebar' : 'Collapse project sidebar'} aria-expanded={!collapsed} aria-controls="project-browser-content" onClick={onCollapse} title={collapsed ? 'Expand project sidebar' : 'Collapse project sidebar'}><SidebarIcon side="left" expanded={!collapsed}/></button><button className="project-sidebar-title" disabled={disabled} aria-label="Rename project" title={workspace.name} onClick={() => onRename('project')} hidden={collapsed}><span>PROJECT</span><strong>{workspace.name}</strong></button>
    <nav className="project-file-actions" aria-label="Project files">
      {onNew && <button disabled={disabled} aria-label="New project" title="New project — start fresh; Undo restores the previous project" onClick={onNew}><FileActionIcon action="new"/></button>}
      {onOpen && <button disabled={disabled} aria-label="Open project" title="Open project" onClick={onOpen}><FileActionIcon action="open"/></button>}
      {onSave && <button disabled={disabled || saveDisabled} aria-label="Save project" title="Save project" onClick={onSave}><FileActionIcon action="save"/></button>}
    </nav></div>
    {collapsed && <span className="project-rail-count" title={`${spectra.length} spectra`}>{spectra.length}</span>}
    <div id="project-browser-content" className="project-sidebar-content" hidden={collapsed}>
      <div className="project-search"><input type="search" aria-label="Find spectrum" placeholder="Find a spectrum…" value={query} onChange={e => setQuery(e.target.value)}/></div>
      <ProjectSplit ratio={ratio} onChange={onRatio} spectra={<section className="project-spectra-pane" aria-label="Spectra"><div className="project-list-heading"><h2>Spectra <span className="count">{spectra.length}</span></h2><div className="project-list-actions"><button disabled={disabled} aria-label="Add spectra" title="Add one or more spectra" onClick={onImport}>＋</button><button disabled={disabled || !spectra.length} aria-label="Remove spectrum" title="Remove selected spectrum; Undo restores it" onClick={onRemove}>−</button></div></div>
        <div className="project-spectra-list" ref={list}>{filtered.map(({ spectrum: s, index }) => renamingSpectrumId === s.id ? <div key={s.id} className="spectrum-row name-editing" aria-current={s.id === current.id}><span className="spectrum-row-number">{String(index + 1).padStart(2, '0')}</span><InlineNameEditor name={s.name} label="Spectrum name" rowId={`spectrum-${s.id}`} onCommit={name => onCommitName?.(name)} onCancel={() => onCancelName?.()}/></div> : <button key={s.id} id={`spectrum-${s.id}`} className="spectrum-row" aria-current={s.id === current.id} disabled={disabled} title={`${s.name} · ${s.spectrum.x.length} points · ${s.models.length} models`} onClick={() => onSelect(s.id)} onDoubleClick={() => onRename('spectrum')} onKeyDown={e => {
          const target = e.key === 'ArrowDown' ? Math.min(filtered.length - 1, filtered.findIndex(v => v.spectrum.id === s.id) + 1) : e.key === 'ArrowUp' ? Math.max(0, filtered.findIndex(v => v.spectrum.id === s.id) - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? filtered.length - 1 : null;
          if (target !== null) { e.preventDefault(); onSelect(filtered[target].spectrum.id); (list.current?.children[target] as HTMLButtonElement)?.focus(); }
        }}><span className="spectrum-row-number">{String(index + 1).padStart(2, '0')}</span><strong>{s.name}</strong><FitDot model={s.models.find(m => m.id === s.activeModelId)!}/><span className="spectrum-model-count" aria-label={`${s.models.length} models`}>{s.models.length}</span></button>)}{!filtered.length && <p className="no-spectra">{spectra.length ? 'No matching spectra.' : 'No spectra yet.'}</p>}</div>
      </section>} models={children}/>
      <div className="project-sidebar-footer">{spectra.length} spectra · {spectra.reduce((n, s) => n + s.models.length, 0)} models</div>
    </div>

  </aside>;
}
