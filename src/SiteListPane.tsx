import { useRef, useState, type ReactNode } from 'react';
export function SiteListPane({ children, count, height: savedHeight, onHeightChange }: { children: ReactNode; count: number; height?: number; onHeightChange?: (height: number) => void }) {
  const [localHeight, setLocalHeight] = useState(104);
  const drag = useRef<{ y: number; height: number } | null>(null);
  const maximum = () => Math.max(104, Math.min(300, window.innerHeight * .4));
  const clamp = (v: number) => Math.max(52, Math.min(maximum(), v));
  const height = clamp(savedHeight ?? localHeight);
  const setHeight = (next: number | ((height: number) => number)) => { const value = typeof next === 'function' ? next(height) : next; if (onHeightChange) onHeightChange(value); else setLocalHeight(value); };
  return <><div className="site-list-pane" style={{ height: count ? Math.min(height, count * 36) : 0 }}>{children}</div><div className="site-list-splitter" role="separator" aria-label="Resize site list" aria-orientation="horizontal" aria-valuemin={52} aria-valuemax={maximum()} aria-valuenow={height} tabIndex={0} title="Drag to resize site list; double-click to reset"
    onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); drag.current = { y: e.clientY, height }; e.currentTarget.setPointerCapture(e.pointerId); }}
    onPointerMove={e => { if (drag.current) setHeight(clamp(drag.current.height + e.clientY - drag.current.y)); }}
    onPointerUp={e => { drag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
    onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }} onDoubleClick={() => setHeight(104)}
    onKeyDown={e => { if (['ArrowUp','ArrowDown','Home','End'].includes(e.key)) { e.preventDefault(); setHeight(e.key === 'Home' ? 52 : e.key === 'End' ? maximum() : clamp(height + (e.key === 'ArrowDown' ? 26 : -26))); } }}><span/></div></>;
}
