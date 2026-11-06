import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { niceTicks, formatTick } from './axes.mjs';
import { foldCenterScan, foldingGaussianScore, foldingPairs, type FoldEstimate } from './folding';

function useSize() {
  const ref = useRef<SVGSVGElement>(null), [size, setSize] = useState({ w: 600, h: 180 });
  useEffect(() => { if (!ref.current) return; const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0 && entry.contentRect.height > 0) setSize({ w: entry.contentRect.width, h: entry.contentRect.height }); }); observer.observe(ref.current); return () => observer.disconnect(); }, []);
  return { ref, ...size };
}
function limits(values: number[]) {
  const lo = Math.min(...values), hi = Math.max(...values), pad = Math.max((hi - lo) * .12, Math.abs(hi) * 1e-5, .001);
  return [lo - pad, hi + pad];
}
function TraceChart({ title, series, xLabel, marker, difference }: { title: string; series: { values: number[]; color: string; label: string }[]; xLabel: string; marker?: number; difference?: number[] }) {
  const { ref, w, h } = useSize(), uid = useId().replaceAll(':', '');
  const yt = limits(series.flatMap(s => s.values)), yTicks = niceTicks(yt[0], yt[1], Math.max(2, Math.floor(h / (difference ? 100 : 50))));
  const left = Math.max(62, Math.max(...yTicks.values.map(v => formatTick(v, yTicks.step).length)) * 6 + 30), right = w - 12, top = 10, bottom = difference ? Math.max(45, (h - 65) * .64) : h - 43;
  const residualTop = bottom + 21, residualBottom = h - 43, maxX = Math.max(2, series[0].values.length), xt = niceTicks(1, maxX, Math.max(2, Math.floor(w / 100)));
  const x = (v: number) => left + (v - 1) / (maxX - 1) * (right - left), y = (v: number) => bottom - (v - yt[0]) / (yt[1] - yt[0]) * (bottom - top);
  const rm = Math.max(.001, ...(difference ?? []).map(Math.abs)) * 1.1, ry = (v: number) => (residualTop + residualBottom) / 2 - v / rm * (residualBottom - residualTop) / 2;
  const differenceTicks = niceTicks(-rm, rm, 3);
  const sampled = (values: number[]) => values.map((v, i) => ({ v, i })).filter((_, i) => i % Math.max(1, Math.ceil(values.length / 1500)) === 0);
  return <section className="fold-chart"><div className="fold-chart-heading"><h3>{title}</h3><div className="fold-legend">{series.map(s => <span key={s.label}><i style={{ background: s.color }}/>{s.label}</span>)}</div></div>
    <svg ref={ref} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={title}>
      <defs><clipPath id={`fold-trace-${uid}`}><rect x={left} y={top} width={Math.max(1, right - left)} height={Math.max(1, bottom - top)}/></clipPath></defs>
      {yTicks.values.map(v => <g key={v}><line x1={left} x2={right} y1={y(v)} y2={y(v)} className="grid"/><text x={left - 7} y={y(v) + 3} textAnchor="end">{formatTick(v, yTicks.step)}</text></g>)}
      {xt.values.map(v => <g key={v}><line x1={x(v)} x2={x(v)} y1={top} y2={difference ? residualBottom : bottom} className="grid"/><text x={x(v)} y={h - 26} textAnchor="middle">{formatTick(v, xt.step)}</text></g>)}
      <g clipPath={`url(#fold-trace-${uid})`}>{series.map(s => <path key={s.label} d={sampled(s.values).map(({ v, i }, k) => `${k ? 'L' : 'M'}${x(i + 1)},${y(v)}`).join('')} fill="none" stroke={s.color} strokeWidth="1.2"/>)}
        {marker !== undefined && <line data-testid="raw-fold-marker" x1={x(marker)} x2={x(marker)} y1={top} y2={bottom} stroke="#217c79" strokeDasharray="4 3"/>}
      </g>
      <line x1={left} x2={right} y1={bottom} y2={bottom} className="axis"/>
      {marker !== undefined && <text x={Math.max(left + 22, Math.min(right - 22, x(marker)))} y={top + 10} textAnchor="middle" fill="#217c79">{marker}</text>}
      {difference && <><line x1={left} x2={right} y1={ry(0)} y2={ry(0)} stroke="#a9b6bd" strokeDasharray="4 3"/><text x={left} y={residualTop - 6}>Left − right (counts)</text>{differenceTicks.values.map(v => <text key={v} x={left - 7} y={ry(v) + 3} textAnchor="end">{formatTick(v, differenceTicks.step)}</text>)}{sampled(difference).map(({ v, i }) => <circle key={i} data-testid="fold-difference" cx={x(i + 1)} cy={ry(v)} r="1.25" fill="#697f8c"/>)}<line x1={left} x2={right} y1={residualBottom} y2={residualBottom} className="axis"/></>}
      <text transform={`translate(12 ${(top + bottom) / 2}) rotate(-90)`} textAnchor="middle">Counts</text><text x={(left + right) / 2} y={h - 7} textAnchor="middle">{xLabel}</text>
    </svg>
  </section>;
}

function SymmetryChart({ scan, estimate, center, disabled, onCenter }: { scan: ReturnType<typeof foldCenterScan>; estimate: FoldEstimate | null; center: number; disabled: boolean; onCenter: (center: number) => void }) {
  const { ref, w, h } = useSize(), uid = useId().replaceAll(':', '');
  const left = 54, right = w - 12, top = 12, bottom = h - 44, lo = scan.centers[0] - .35, hi = scan.centers.at(-1)! + .35;
  const px = (v: number) => left + v / 100 * (right - left), py = (v: number) => bottom - (v - lo) / (hi - lo) * (bottom - top), max = Math.max(...scan.mismatch), ticks = niceTicks(lo, hi, Math.max(2, Math.floor(h / 45)));
  const curve = estimate?.refined ? Array.from({ length: 180 }, (_, i) => { const v = lo + (hi - lo) * i / 179; return `${i ? 'L' : 'M'}${px(foldingGaussianScore(estimate, v)!)},${py(v)}`; }).join('') : null;
  return <section className="fold-chart fold-score"><div className="fold-chart-heading"><h3>Folding symmetry</h3>{curve && <span className="fold-fit-key">Gaussian</span>}</div>
    <svg ref={ref} viewBox={`0 0 ${w} ${h}`} role="group" aria-label="Relative symmetry score versus fold center">
      <title>Relative score: 100 minus paired mismatch divided by the largest scanned mismatch, times 100. Higher means closer symmetry; this is not a probability.</title>
      <defs><clipPath id={`fold-score-${uid}`}><rect x={left} y={top} width={Math.max(1, right - left)} height={Math.max(1, bottom - top)}/></clipPath></defs>
      {[0, 50, 100].map(v => <g key={v}><line x1={px(v)} x2={px(v)} y1={top} y2={bottom} className="grid"/><text x={px(v)} y={h - 27} textAnchor="middle">{v}</text></g>)}
      {ticks.values.map(v => <text key={v} x={left - 7} y={py(v) + 3} textAnchor="end">{formatTick(v, ticks.step)}</text>)}
      {scan.centers.map((v, i) => <g key={v} role="button" aria-label={`Use fold center ${v}`} aria-pressed={center === v} aria-disabled={disabled} tabIndex={disabled ? -1 : 0} onClick={() => { if (!disabled) onCenter(v); }} onKeyDown={e => { if (!disabled && ['Enter', ' '].includes(e.key)) { e.preventDefault(); onCenter(v); } }}>
        <rect x={left} y={py(v) - (bottom - top) / (hi - lo) * .22} width={right - left} height={(bottom - top) / (hi - lo) * .44} fill="transparent"/>
        <rect x={left} y={py(v) - 2} width={Math.max(1, px(100 - scan.mismatch[i] / max * 100) - left)} height="4" fill={center === v ? '#217c79' : '#b6cbc9'} pointerEvents="none"/>
      </g>)}
      <g clipPath={`url(#fold-score-${uid})`} pointerEvents="none">{curve && <path data-testid="fold-gaussian" d={curve} fill="none" stroke="#b15b53" strokeWidth="1.6"/>}<line data-testid="selected-fold-marker" x1={left} x2={right} y1={py(center)} y2={py(center)} stroke="#217c79" strokeDasharray="4 3"/></g>
      <text transform={`translate(12 ${(top + bottom) / 2}) rotate(-90)`} textAnchor="middle">Fold center (channel)</text><text x={(left + right) / 2} y={h - 7} textAnchor="middle">Relative symmetry (%)</text>
    </svg>
  </section>;
}

export function FoldingDiagnostics({ counts, center, estimate = null, disabled = false, onCenter }: { counts: number[]; center: number; estimate?: FoldEstimate | null; disabled?: boolean; onCenter: (center: number) => void }) {
  const data = useMemo(() => {
    try { return { pairs: foldingPairs(counts, center), scan: estimate?.scan ?? foldCenterScan(counts), error: '' }; }
    catch (e) { return { pairs: null, scan: null, error: String(e) }; }
  }, [counts, center, estimate]);
  const format = (value: number) => Number(value.toPrecision(4)).toLocaleString('en-US');
  let comparison: ReactNode = <p className="fold-diagnostic-error">{data.error}</p>;
  if (data.pairs && data.scan) comparison = <>
    <div className="fold-diagnostic-stats"><span>Selected center <strong>{center}</strong></span><span title="RMS of left minus right counts across independent pairs; self-paired turn points are excluded.">Pair RMS <strong>{format(data.pairs.rms)}</strong> counts{data.pairs.relativeRms !== null && ` (${format(data.pairs.relativeRms)}%)`}</span>{estimate && <span>{estimate.refined ? `Gaussian center ${estimate.fit.project.sites[0].params.cs.value.toFixed(3)} → ${estimate.center}` : `Discrete estimate ${estimate.center}`}</span>}</div>
    <div className="fold-diagnostic-grid"><div className="fold-raw"><TraceChart title="Raw spectrum" series={[{ values: counts, color: '#6a7f8a', label: 'Observed' }]} marker={center} xLabel="Original channel (1-based)"/></div>
      <TraceChart title="Paired halves" series={[{ values: data.pairs.left, color: '#218c85', label: 'Left, reversed' }, { values: data.pairs.right, color: '#bf8546', label: 'Right' }]} difference={data.pairs.difference} xLabel="Folded point"/>
      <SymmetryChart scan={data.scan} estimate={estimate} center={center} disabled={disabled} onCenter={onCenter}/>
    </div>
    <p className="fold-diagnostic-note">Click a symmetry bar to compare centers. Noise and drift also contribute to the difference between halves.</p>
  </>;
  return <div className="fold-diagnostics" aria-label="Folding diagnostics">{comparison}</div>;
}
