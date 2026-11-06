import { useEffect, useRef, useState, type ReactNode } from 'react';

export const MIN_RESULTS_HEIGHT = 196;
const DEFAULT_HEIGHT = 200;
export function ResultsPane({ children, height: savedHeight, onHeightChange }: { children: ReactNode; height?: number; onHeightChange?: (height: number) => void }) {
  const [localHeight, setLocalHeight] = useState(DEFAULT_HEIGHT);
  const drag = useRef<{ y: number; height: number } | null>(null);
  const maximum = () => Math.max(MIN_RESULTS_HEIGHT, Math.min(window.innerHeight * .65, window.innerHeight - 380));
  const clamp = (v: number) => Math.max(MIN_RESULTS_HEIGHT, Math.min(maximum(), v));
  const height = clamp(savedHeight ?? localHeight);
  const setHeight = (next: number | ((height: number) => number)) => { const value = typeof next === 'function' ? next(height) : next; if (onHeightChange) onHeightChange(value); else setLocalHeight(value); };
  useEffect(() => { const resize = () => { const next = clamp(height); if (next !== height) setHeight(next); }; window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, [height, onHeightChange]);
  return <>
    <div className="results-splitter" role="separator" aria-orientation="horizontal" aria-label="Resize results pane" aria-valuemin={MIN_RESULTS_HEIGHT} aria-valuemax={maximum()} aria-valuenow={height} tabIndex={0} title="Drag to resize results; double-click to reset"
      onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); drag.current = { y: e.clientY, height }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { if (drag.current) setHeight(clamp(drag.current.height + drag.current.y - e.clientY)); }}
      onPointerUp={e => { drag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
      onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}
      onDoubleClick={() => setHeight(DEFAULT_HEIGHT)}
      onKeyDown={e => { if (['ArrowUp','ArrowDown','Home','End'].includes(e.key)) { e.preventDefault(); setHeight(e.key === 'Home' ? MIN_RESULTS_HEIGHT : e.key === 'End' ? maximum() : clamp(height + (e.key === 'ArrowUp' ? 24 : -24))); } }}><span/></div>
    <section className="results-panel" style={{ height }} aria-label="Site results">{children}</section>
  </>;
}
