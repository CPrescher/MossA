import { useEffect, useRef } from 'react';
import { colors, type Site } from './types';

export function SiteList({ sites, selected, disabled, onSelect, onDelete }: { sites: Site[]; selected: number; disabled: boolean; onSelect: (index: number) => void; onDelete: (index: number) => void }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.querySelector('.selected')?.scrollIntoView?.({ block: 'nearest' }); }, [selected, sites.length]);
  return <div ref={list} className="site-list" aria-label="Sites">
    {sites.map((site, index) => <div className={`site-row ${selected === index ? 'selected' : ''}`} key={index} style={{ borderLeftColor: colors[index % colors.length] }}>
      <button className="site-select" disabled={disabled} aria-pressed={selected === index} onClick={() => onSelect(index)} title={site.name}>
        <span className="site-number" style={{ color: colors[index % colors.length] }}>{index + 1}</span>
        <span className="site-text"><strong>{site.name}</strong><small>{site.xvbf?'xVBF':`${site.kind} · ${site.profile}`}</small></span>
      </button>
      <button className="site-trash" aria-label={`Delete site ${index + 1}: ${site.name}`} title={`Delete ${site.name}`} disabled={disabled} onClick={() => onDelete(index)}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>
      </button>
    </div>)}
  </div>;
}
