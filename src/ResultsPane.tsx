import { createPortal } from 'react-dom';
import { revealSelectedResult } from './result-scroll';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export const MIN_RESULTS_HEIGHT = 152;
const DEFAULT_HEIGHT = 160;
export function ResultsPane({ children, height: savedHeight, onHeightChange, onExpandedChange, active=true, summary, controlsId }: { controlsId?:string; active?:boolean; summary?:string; children: ReactNode; height?: number; onHeightChange?: (height: number) => void; onExpandedChange?:(expanded:boolean)=>void }) {
  const pane = useRef<HTMLElement>(null);
  const [analysisHeight,setAnalysisHeight]=useState<number|null>(null);
  useEffect(()=>{
    const parent=pane.current?.parentElement;
    if(!parent)return;
    const measure=()=>{const height=parent.getBoundingClientRect().height;if(height>0)setAnalysisHeight(height);};
    measure();
    if(typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(measure);observer.observe(parent);return()=>observer.disconnect();
  },[]);
  const [controls, setControls] = useState<HTMLElement|null>(null);
  useEffect(() => { setControls(controlsId ? document.getElementById(controlsId) : null); }, [controlsId]);
  const [localHeight, setLocalHeight] = useState(DEFAULT_HEIGHT);
  const [textScale, setTextScale] = useState(() => (Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16) / 16);
  useEffect(() => { const update = () => setTextScale((Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16) / 16); window.addEventListener('mossa-appearance-change', update); window.addEventListener('resize', update); return () => { window.removeEventListener('mossa-appearance-change', update); window.removeEventListener('resize', update); }; }, []);
  const minimum = Math.ceil(MIN_RESULTS_HEIGHT * textScale);
  const [windowHeight, setWindowHeight] = useState(() => window.innerHeight);
  const [expanded, setExpanded] = useState<boolean|null>(null);
  const collapsed = expanded === null ? windowHeight < 850 * textScale : !expanded;
  useEffect(() => { const resize = () => setWindowHeight(window.innerHeight); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  useEffect(()=>{if(!collapsed)revealSelectedResult(document.getElementById('site-results-content')?.querySelector('table')??null);},[collapsed]);
  const drag = useRef<{ y: number; height: number } | null>(null);
  const maximum = () => {
    const available=analysisHeight??Math.max(0,window.innerHeight-100*textScale);
    return Math.max(minimum,Math.floor(Math.min(available*.65,available-300*textScale)));
  };
  const clamp = (v: number) => Math.max(minimum, Math.min(maximum(), v));
  const height = clamp(savedHeight === 200 ? DEFAULT_HEIGHT : savedHeight ?? localHeight);
  const setHeight = (next: number | ((height: number) => number)) => { const value = typeof next === 'function' ? next(height) : next; if (onHeightChange) onHeightChange(value); else setLocalHeight(value); };
  useEffect(() => { const resize = () => { const next = clamp(height); if (next !== height) setHeight(next); }; window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, [height, onHeightChange]);
  const controlCollapsed=collapsed||!active;
  const toggle = <button className="results-collapse-toggle" type="button" aria-label={controlCollapsed ? 'Show results' : 'Hide results'} aria-expanded={!controlCollapsed} aria-controls="site-results-content" onClick={() => {setExpanded(controlCollapsed);onExpandedChange?.(controlCollapsed);}} title={`${summary ? summary + '. ' : ''}${controlCollapsed ? 'Show fitted values and approximate 1 std' : 'Hide the table to give the graph more room'}`}>{controls ? `${controlCollapsed ? '▸' : '▾'} Results` : controlCollapsed ? '▸ Show results' : '▾ Hide results'}{!controls && controlCollapsed && summary && <span className="collapsed-results-summary">{summary} · Values and 1 std</span>}</button>;
  return <>
    <div className="results-splitter" hidden={collapsed} role="separator" aria-orientation="horizontal" aria-label="Resize results pane" aria-valuemin={minimum} aria-valuemax={maximum()} aria-valuenow={height} tabIndex={collapsed ? -1 : 0} title="Drag to resize results; double-click to reset"
      onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); drag.current = { y: e.clientY, height }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { if (drag.current) setHeight(clamp(drag.current.height + drag.current.y - e.clientY)); }}
      onPointerUp={e => { drag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
      onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}
      onDoubleClick={() => setHeight(DEFAULT_HEIGHT)}
      onKeyDown={e => { if (['ArrowUp','ArrowDown','Home','End'].includes(e.key)) { e.preventDefault(); setHeight(e.key === 'Home' ? minimum : e.key === 'End' ? maximum() : clamp(height + (e.key === 'ArrowUp' ? 24 : -24))); } }}><span/></div>
    <section ref={pane} className={`results-panel ${controls ? 'results-external-control' : ''} ${collapsed ? 'results-collapsed' : ''}`} style={{ height:collapsed ? undefined : height }} aria-label="Site results">
      {controls ? createPortal(toggle, controls) : toggle}
      <div id="site-results-content" className="results-content" hidden={collapsed}>{children}</div>
    </section>
  </>;
}
