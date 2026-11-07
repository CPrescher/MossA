import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export function FitDetails({ children, warningCount = 0 }: { children: ReactNode; warningCount?: number }) {
  const root = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null);
  const [automatic, setAutomatic] = useState(false), [manual, setManual] = useState(false);
  const open = automatic || manual;
  useLayoutEffect(() => {
    const panel = root.current?.closest('.left-panel') ?? root.current?.closest('.workspace')?.querySelector('.left-panel'), editor = panel?.querySelector('.site-editor');
    if (!panel || !editor || !body.current) return;
    const measure = () => {
      const content = editor.firstElementChild;
      const spare = editor.clientHeight - (content?.getBoundingClientRect().height ?? 0);
      const allocated = body.current!.getBoundingClientRect().height;
      const available = spare + allocated + (allocated > 0 ? 6 : 0);
      setAutomatic(available >= body.current!.scrollHeight + 6 + 16);
    };
    const observer = new ResizeObserver(measure);
    [panel,editor,editor.firstElementChild,panel.querySelector('.site-list-pane'),body.current].forEach(node => { if (node) observer.observe(node); });
    measure();
    return () => observer.disconnect();
  }, [children]);
  const label = `Fit details${warningCount ? ` · ${warningCount} warning${warningCount > 1 ? 's' : ''}` : ''}`;
  return <div ref={root} className={`fit-details ${open ? 'is-open' : ''}`}>
    {automatic ? <div className="fit-details-heading">{label}</div> : <button type="button" className="fit-details-toggle" aria-expanded={open} onClick={() => setManual(!open)}><span aria-hidden="true">{open ? '▾' : '▸'}</span> {label}</button>}
    <div ref={body} className="fit-details-body" aria-hidden={!open} inert={!open}>{children}</div>
  </div>;
}
