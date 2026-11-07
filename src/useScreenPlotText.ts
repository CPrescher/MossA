import { useEffect, useRef, useState, type CSSProperties } from 'react';

// SVG viewBox units can shrink on screen. Keep UI labels at the chosen text size
// even when a preview is letterboxed or its panel stays a fixed size.
export function useScreenPlotText(width:number, height:number) {
  const ref = useRef<SVGSVGElement>(null);
  const [labelSize, setLabelSize] = useState(16);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      const scale = Math.min(rect.width / width, rect.height / height);
      if (!(scale > 0)) return;
      const rootSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
      setLabelSize(rootSize * .8125 / scale);
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    window.addEventListener('mossa-appearance-change', measure);
    window.addEventListener('resize', measure);
    measure();
    return () => { observer?.disconnect(); window.removeEventListener('mossa-appearance-change', measure); window.removeEventListener('resize', measure); };
  }, [width, height]);
  return { ref, labelSize, style:{ '--svg-text-size':`${labelSize}px` } as CSSProperties };
}
