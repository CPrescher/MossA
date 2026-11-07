import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const SELECTOR = '.project-spectra-list,.project-sidebar .model-tabs,.left-panel .site-list,.left-panel .site-editor,.left-panel .status-panel,.right-panel .options-content,.right-panel .xvbf-component-scroll,.right-panel .xvbf-correlation-panel';
type Bar = { id: number; target: HTMLElement; left: number; top: number; height: number; thumbHeight: number; thumbTop: number; clipTop: number; clipBottom: number };

// macOS can fade even styled native scrollbars. These persistent controls use
// each area's native scroll position; wheel, trackpad, and keyboard still work.
export function SidebarScrollbars() {
  const [bars, setBars] = useState<Bar[]>([]);
  const ids = useRef(new WeakMap<HTMLElement, number>()), nextId = useRef(0), refresh = useRef<() => void>(() => {});
  const drag = useRef<{ target: HTMLElement; y: number; start: number; scale: number } | null>(null);
  useLayoutEffect(() => {
    let frame = 0;
    const observed = new Set<HTMLElement>();
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    function measure() {
      frame = 0;
      const targets = new Set(Array.from(document.querySelectorAll<HTMLElement>(SELECTOR))), next: Bar[] = [];
      for (const old of observed) if (!targets.has(old)) { resize.unobserve(old); observed.delete(old); }
      for (const target of targets) {
        if (!observed.has(target)) { resize.observe(target); observed.add(target); }
        const rect = target.getBoundingClientRect(), height = target.clientHeight;
        if (rect.width <= 0 || height <= 0 || target.scrollHeight <= height + 1) continue;
        let top = Math.max(0, rect.top), bottom = Math.min(window.innerHeight, rect.top + height);
        let visibleLeft = Math.max(0, rect.left), visibleRight = Math.min(window.innerWidth, rect.right);
        for (let parent = target.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
          if (style.overflowY !== 'visible') { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
          if (style.overflowX !== 'visible') { visibleLeft = Math.max(visibleLeft, bounds.left); visibleRight = Math.min(visibleRight, bounds.right); }
        }
        const left = rect.right - target.clientLeft - 8;
        if (bottom <= top || visibleRight <= left || visibleLeft >= left + 8) continue;
        let id = ids.current.get(target);
        if (id === undefined) { id = ++nextId.current; ids.current.set(target, id); }
        const thumbHeight = Math.min(height, Math.max(24, height * height / target.scrollHeight));
        next.push({ id, target, left, top: rect.top, height, thumbHeight,
          thumbTop: (height - thumbHeight) * target.scrollTop / (target.scrollHeight - height),
          clipTop: Math.max(0, top - rect.top), clipBottom: Math.max(0, rect.top + height - bottom) });
      }
      setBars(previous => previous.length === next.length && previous.every((bar, i) => Object.entries(bar).every(([key, value]) => value === next[i][key as keyof Bar])) ? previous : next);
    }
    refresh.current = schedule;
    const mutation = new MutationObserver(schedule);
    document.querySelectorAll('.project-sidebar,.left-panel,.right-panel').forEach(sidebar => mutation.observe(sidebar, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] }));
    document.addEventListener('scroll', schedule, true); window.addEventListener('resize', schedule);
    measure();
    return () => { if (frame) cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect(); document.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); refresh.current = () => {}; };
  }, []);
  return createPortal(<div className="sidebar-scrollbars" aria-hidden="true">{bars.map(bar => <div key={bar.id} className="sidebar-scroll-track" data-scroll-area={bar.target.className} style={{ left: bar.left, top: bar.top, height: bar.height, clipPath: `inset(${bar.clipTop}px 0 ${bar.clipBottom}px 0)` }}
    onWheel={e => { bar.target.scrollTop += e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? bar.height : 1); refresh.current(); }}
    onPointerDown={e => { if (e.button !== 0 || e.target !== e.currentTarget) return; e.preventDefault(); bar.target.scrollTop += (e.clientY < bar.top + bar.thumbTop ? -1 : 1) * bar.target.clientHeight * .85; refresh.current(); }}>
    <div className="sidebar-scroll-thumb" style={{ height: bar.thumbHeight, top: bar.thumbTop }} onPointerDown={e => {
      if (e.button !== 0) return; e.preventDefault();
      drag.current = { target: bar.target, y: e.clientY, start: bar.target.scrollTop, scale: (bar.target.scrollHeight - bar.height) / Math.max(1, bar.height - bar.thumbHeight) };
      e.currentTarget.setPointerCapture(e.pointerId);
    }} onPointerMove={e => { if (drag.current?.target === bar.target) { bar.target.scrollTop = drag.current.start + (e.clientY - drag.current.y) * drag.current.scale; refresh.current(); } }}
      onPointerUp={e => { drag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}/>
  </div>)}</div>, document.body);
}
