import { saveBlob } from './file-save';
import { colors, type Project, type Evaluation } from './types';
import { formatTick } from './axes.mjs';
import { layoutLabel, svgLabelLine } from './scientific-label';
import { figureTicks, legendSpace, type FigureRect } from './figure-layout';

export type FigureSite = { index: number; name: string; color: string; visible: boolean };
export type FigureOptions = {
  width: number; height: number; title: string; style: 'filled' | 'lines';
  order: 'depth' | 'custom'; residual: 'above' | 'below' | 'none';
  sign: 'data-model' | 'model-data'; legend: 'auto' | 'above' | 'below' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none';
  legendDataFit: boolean;
  range: [number, number] | null; sites: FigureSite[];
};
export function defaultFigureOptions(project: Project): FigureOptions {
  return { width: 180, height: 120, title: '', style: 'filled', order: 'depth', residual: 'below', sign: 'data-model', legend: 'auto', legendDataFit: false, range: null,
    sites: project.sites.map((s, index) => ({ index, name: s.name, color: colors[index % colors.length], visible: true })) };
}
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
const n = (v: number) => Number(v.toFixed(3));
function wrap(text: string, width: number): string[] {
  const limit = Math.max(8, Math.floor(width / 6.5)), lines: string[] = [];
  // Split long unbroken names too; keep every character in the exported label.
  for (const word of text.split(/\s+/)) {
    let rest = word;
    if (lines.length && lines.at(-1)!.length + word.length + 1 <= limit) { lines[lines.length - 1] += ` ${word}`; continue; }
    while (rest.length > limit) { lines.push(rest.slice(0, limit)); rest = rest.slice(limit); }
    if (rest) lines.push(rest);
  }
  return lines.length ? lines : [''];
}

/** A standalone, white-page figure. Preview and downloads use these exact SVG bytes. */
export function renderFigure(project: Project, evaluation: Evaluation, options: FigureOptions, fitted: boolean): string {
  if (!Number.isFinite(options.width) || !Number.isFinite(options.height) || options.width < 70 || options.width > 300 || options.height < 60 || options.height > 300) throw new Error('Use a width of 70–300 mm and a height of 60–300 mm.');
  const W = options.width * 4, H = options.height * 4, xs = project.spectrum.x, ys = project.spectrum.y;
  const range = options.range ?? [xs[0], xs.at(-1)!];
  if (!range.every(Number.isFinite) || range[1] <= range[0]) throw new Error('Choose an increasing velocity range.');
  const indices = xs.map((x, i) => x >= range[0] && x <= range[1] ? i : -1).filter(i => i >= 0);
  if (indices.length < 2) throw new Error('The selected range needs at least two data points.');
  let scale = 1;
  if (project.mode === 'transmission') {
    let maximum = 0, minimum = Infinity;
    for (let i = 0; i < xs.length; i++) { maximum = Math.max(maximum, evaluation.components.reduce((sum, c) => sum + c[i], 0)); minimum = Math.min(minimum, ys[i]); }
    scale = maximum > 0 ? .8 * Math.max(0, project.background[0].value - minimum) / maximum : 0;
  }
  const sites = options.sites.filter(s => s.visible && evaluation.components[s.index]).map(s => {
    const curve = evaluation.components[s.index].map((v, i) => evaluation.background[i] - v * scale);
    let depth = 0; for (const i of indices) depth = Math.max(depth, evaluation.background[i] - curve[i]);
    return { ...s, curve, depth };
  });
  if (options.order === 'depth') sites.sort((a, b) => b.depth - a.depth || a.index - b.index);
  const legendItems = [ ...(options.legendDataFit ? [{ name: 'Data', color: '#222222', type: 'data' }, { name: fitted ? 'Fit' : 'Model (unfitted)', color: '#202124', type: 'model' }] : []), ...sites.map(s => ({ name: s.name, color: s.color, type: 'site' })) ];
  const inside = options.legend === 'auto' || /^(top|bottom)-(left|right)$/.test(options.legend);
  const horizontalLegend = options.legend === 'above' || options.legend === 'below';
  const legendWidth = options.legend === 'right' ? Math.min(180, W * .29) : 0;
  const insideWidth = Math.max(100, Math.min(220, (W - 100) * .4));
  const columns = W >= 600 ? 3 : 2, cellWidth = (W - 36 - (columns - 1) * 24) / columns;
  const legendLines = legendItems.map(item => layoutLabel(item.name, (inside ? insideWidth : options.legend === 'right' ? legendWidth : cellWidth) - 32));
  const legendHeights = legendLines.map(lines => lines.reduce((height, line) => height + Math.max(15, line.ascent + line.descent + 3), 0));
  const rowHeights: number[] = [];
  if (horizontalLegend) for (let i = 0; i < legendItems.length; i += columns) {
    const ascent = Math.max(...legendLines.slice(i, i + columns).map(lines => lines[0].ascent));
    rowHeights.push(Math.max(...legendHeights.slice(i, i + columns).map((height, j) => height + ascent - legendLines[i + j][0].ascent)) + 9);
  }
  const legendHeight = rowHeights.reduce((sum, h) => sum + h, 0);
  const noteLines = project.mode === 'transmission' && sites.length ? wrap('Sites: display-scaled absorber profiles; not additive transmission components.', W - 36) : [];
  const noteHeight = noteLines.length ? noteLines.length * 12 + 16 : 0;
  const titleLines = options.title ? wrap(options.title, W - 130 - legendWidth) : [];
  const titleBottom = titleLines.length ? 26 + titleLines.length * 18 : 20;
  const top = titleBottom + (options.legend === 'above' && legendItems.length ? legendHeight + 10 : 0), bottom = H - 52 - (options.legend === 'below' && legendItems.length ? legendHeight + 12 : 0) - noteHeight;
  const mainTop = top, mainBottom = bottom;
  if (mainBottom - mainTop < 90) throw new Error('Increase the figure height or move the legend to the right to leave room for the spectrum.');
  if (options.legend === 'right' && legendHeights.reduce((sum, height) => sum + height + 9, 0) > bottom - top) throw new Error('Increase the figure height or place the legend below to fit all site names.');
  let lo = Infinity, hi = -Infinity, residualMin = 0, residualMax = 0;
  const residualSign = options.sign === 'data-model' ? 1 : -1;
  for (const i of indices) {
    for (const v of [ys[i], evaluation.y[i], evaluation.background[i], ...sites.map(s => s.curve[i])]) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const residual = evaluation.residual[i] * residualSign;
    residualMin = Math.min(residualMin, residual); residualMax = Math.max(residualMax, residual);
  }
  // Translate residuals into free space in the SAME axes without rescaling them.
  // Include the zero line and all signed residuals when choosing the joint limits.
  const gap = Math.max((hi - lo) * .08, Math.abs(hi) * 1e-6, 1e-6);
  const residualOffset = options.residual === 'above' ? hi + gap - residualMin : lo - gap - residualMax;
  if (options.residual !== 'none') { lo = Math.min(lo, residualOffset + residualMin); hi = Math.max(hi, residualOffset + residualMax); }
  const pad = Math.max((hi - lo) * .1, Math.abs(hi) * 1e-6, 1e-6); lo -= pad; hi += pad;
  const yt = figureTicks(lo, hi, mainBottom - mainTop, false);
  const labelLength = Math.max(...yt.values.map(v => formatTick(v, yt.step).length));
  const L = Math.max(68, 28 + labelLength * 7), R = W - 18 - legendWidth;
  if (R - L < 130) throw new Error('Increase the figure width or place the legend below to leave room for the spectrum.');
  const legendColumns = Math.min(columns, legendItems.length);
  const columnWidths = Array.from({ length: legendColumns }, (_, column) => 23 + Math.max(0, ...legendLines.flatMap((lines, i) => i % columns === column ? lines.map(l => l.width) : [])));
  const horizontalWidth = columnWidths.reduce((sum, w) => sum + w, 0) + Math.max(0, legendColumns - 1) * 24;
  const horizontalStart = Math.max(18, Math.min(W - 18 - horizontalWidth, (L + R - horizontalWidth) / 2));
  const px = (v: number) => L + (v - range[0]) / (range[1] - range[0]) * (R - L);
  const py = (v: number) => mainBottom - (v - lo) / (hi - lo) * (mainBottom - mainTop);
  const pr = (v: number) => py(residualOffset + v);
  // Include neighboring samples so curves reach the clip boundaries in a zoomed export.
  const first = Math.max(0, indices[0] - 1), last = Math.min(xs.length - 1, indices.at(-1)! + 1);
  const curveIndices = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const path = (curve: number[]) => curveIndices.map((i, k) => `${k ? 'L' : 'M'}${n(px(xs[i]))},${n(py(curve[i]))}`).join('');
  const area = (curve: number[]) => path(curve) + curveIndices.slice().reverse().map(i => `L${n(px(xs[i]))},${n(py(evaluation.background[i]))}`).join('') + 'Z';
  const text = (x: number, y: number, value: string, extra = '') => `<text x="${n(x)}" y="${n(y)}" ${extra}>${escape(value)}</text>`;
  const line = (x1: number, y1: number, x2: number, y2: number, extra = '') => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ${extra}/>`;
  const xt = figureTicks(range[0], range[1], R - L);
  let legendRect: FigureRect | null = null;
  if (inside && legendItems.length) {
    const width = 23 + Math.max(...legendLines.flatMap(lines => lines.map(l => l.width))) + 8;
    const height = legendHeights.reduce((sum, h) => sum + h + 9, 0) - 9;
    const plot = { x: L, y: mainTop, width: R - L, height: mainBottom - mainTop };
    if (options.legend === 'auto') {
      const occupied: FigureRect[] = [];
      const segment = (x1: number, y1: number, x2: number, y2: number, margin = 4) => {
        occupied.push({ x: Math.min(x1, x2) - margin, y: Math.min(y1, y2) - margin, width: Math.abs(x2 - x1) + 2 * margin, height: Math.abs(y2 - y1) + 2 * margin });
      };
      for (const i of indices) {
        segment(px(xs[i]), py(ys[i]), px(xs[i]), py(ys[i]));
        if (options.residual !== 'none') segment(px(xs[i]), pr(evaluation.residual[i] * residualSign), px(xs[i]), pr(evaluation.residual[i] * residualSign));
      }
      const curves = [evaluation.y, evaluation.background, ...sites.map(s => s.curve)];
      for (let k = 1; k < curveIndices.length; k++) {
        const a = curveIndices[k - 1], b = curveIndices[k], x1 = px(xs[a]), x2 = px(xs[b]);
        for (const curve of curves) segment(x1, py(curve[a]), x2, py(curve[b]));
        if (options.style === 'filled') for (const site of sites) {
          const y1 = Math.min(py(site.curve[a]), py(site.curve[b]), py(evaluation.background[a]), py(evaluation.background[b]));
          const y2 = Math.max(py(site.curve[a]), py(site.curve[b]), py(evaluation.background[a]), py(evaluation.background[b]));
          segment(x1, y1, x2, y2);
        }
      }
      if (options.residual !== 'none') segment(L, pr(0), R, pr(0));
      legendRect = legendSpace(plot, width, height, occupied);
      // Never cover scientific content when no free interior rectangle exists.
      if (!legendRect) return renderFigure(project, evaluation, { ...options, legend: 'above' }, fitted);
    } else {
      if (width > plot.width - 24 || height > plot.height - 24) throw new Error('Place the legend above or below, or increase the figure size to fit these labels.');
      legendRect = { x: options.legend.endsWith('right') ? R - width - 12 : L + 12, y: options.legend.startsWith('top') ? mainTop + 12 : mainBottom - height - 12, width, height };
    }
  }
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}mm" height="${options.height}mm" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="figure-title figure-description"><title id="figure-title">${escape(options.title || 'Mössbauer spectrum')}</title><desc id="figure-description">${escape(`${fitted ? 'Fitted spectrum' : 'Unfitted model'}. ${options.residual === 'none' ? 'Residual hidden.' : `Residual: ${options.sign === 'data-model' ? 'data minus model' : 'model minus data'}, offset ${options.residual} the spectrum on the same intensity scale. The reference line marks zero residual.`} ${project.mode === 'transmission' ? 'Site overlays are display-scaled absorber profiles, not additive transmission components.' : 'Sites filled to the evaluated background.'}`)}</desc><metadata>${escape(JSON.stringify({ application: 'MossA 2', fitted, mode: project.mode, componentScale: scale, residualOffset: options.residual === 'none' ? null : residualOffset, options }))}</metadata><rect width="${W}" height="${H}" fill="white"/><g font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#30343a" color="#30343a" stroke-linejoin="round"><defs><clipPath id="figure-main"><rect x="${L}" y="${mainTop}" width="${R - L}" height="${mainBottom - mainTop}"/></clipPath></defs>`;
  titleLines.forEach((title, i) => { svg += text((L + R) / 2, 23 + i * 18, title, 'data-figure-title="true" text-anchor="middle" font-size="14" font-weight="600"'); });
  svg += `<g clip-path="url(#figure-main)">`;
  for (const s of sites) {
    const color = /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : '#168a87';
    svg += `<path data-site-index="${s.index}" d="${options.style === 'filled' ? area(s.curve) : path(s.curve)}" fill="${options.style === 'filled' ? color : 'none'}" stroke="${color}" stroke-width="1.1"/>`;
  }
  svg += `<path d="${path(evaluation.background)}" fill="none" stroke="#aab1b7" stroke-dasharray="4 4" stroke-width=".7"/><path data-curve="model" d="${path(evaluation.y)}" fill="none" stroke="#202124" stroke-width="1.5"/>`;
  for (const i of indices) svg += `<circle data-point="observed" cx="${n(px(xs[i]))}" cy="${n(py(ys[i]))}" r="1.1" fill="#222222"/>`;
  svg += '</g>';
  svg += `<rect data-axes-box="true" x="${L}" y="${mainTop}" width="${R - L}" height="${mainBottom - mainTop}" fill="none" stroke="#444" stroke-width=".8"/>`;
  for (const v of yt.values) svg += line(L, py(v), L + 5, py(v), 'data-tick="y-major" stroke="#444"') + line(R - 5, py(v), R, py(v), 'stroke="#444"') + text(L - 9, py(v) + 4, formatTick(v, yt.step), 'text-anchor="end"');
  for (const v of yt.minor) svg += line(L, py(v), L + 2.5, py(v), 'data-tick="y-minor" stroke="#666" stroke-width=".65"') + line(R - 2.5, py(v), R, py(v), 'stroke="#666" stroke-width=".65"');
  svg += `<text transform="translate(15 ${(mainTop + mainBottom) / 2}) rotate(-90)" text-anchor="middle">Counts / intensity</text>`;
  if (options.residual !== 'none') {
    svg += `<g data-curve="residual" clip-path="url(#figure-main)">`;
    svg += line(L, pr(0), R, pr(0), 'data-curve="residual-zero" stroke="#9aa2a9" stroke-width=".8"');
    for (const i of indices) svg += `<circle data-point="residual" cx="${n(px(xs[i]))}" cy="${n(pr(evaluation.residual[i] * residualSign))}" r="1" fill="#566b78"/>`;
    svg += '</g>';
  }
  for (const v of xt.values) {
    svg += line(px(v), mainBottom - 5, px(v), mainBottom, 'data-tick="x-major" stroke="#444"') + line(px(v), mainTop, px(v), mainTop + 5, 'stroke="#444"');
    svg += text(px(v), bottom + 19, formatTick(v, xt.step), 'data-tick-label="x" text-anchor="middle"');
  }
  for (const v of xt.minor) svg += line(px(v), mainBottom - 2.5, px(v), mainBottom, 'data-tick="x-minor" stroke="#666" stroke-width=".65"') + line(px(v), mainTop, px(v), mainTop + 2.5, 'stroke="#666" stroke-width=".65"');
  svg += text((L + R) / 2, bottom + 39, 'Velocity (mm/s)', 'text-anchor="middle"');
  if (options.legend !== 'none' && legendItems.length) {
    svg += `<g data-figure-legend="${options.legend}"${legendRect ? ` data-x="${legendRect.x}" data-y="${legendRect.y}" data-width="${legendRect.width}" data-height="${legendRect.height}"` : ''}>`;
    let y = legendRect?.y ?? (options.legend === 'right' ? top : options.legend === 'above' ? titleBottom : bottom + 54);
    legendItems.forEach((item, i) => {
      const x = legendRect?.x ?? (options.legend === 'right' ? R + 22 : horizontalStart + columnWidths.slice(0, i % columns).reduce((sum, w) => sum + w + 24, 0));
      const color = /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : '#168a87';
      const vertical = inside || options.legend === 'right';
      const rowStart = vertical ? i : Math.floor(i / columns) * columns;
      const ascent = Math.max(...legendLines.slice(rowStart, vertical ? i + 1 : rowStart + columns).map(lines => lines[0].ascent));
      const baseline = y + ascent;
      svg += item.type === 'data' ? `<circle cx="${x + 7}" cy="${baseline - 4}" r="1.6" fill="${color}"/>` : item.type === 'site' && options.style === 'filled' ? `<rect x="${x}" y="${baseline - 11}" width="15" height="10" fill="${color}"/>` : line(x, baseline - 4, x + 15, baseline - 4, `stroke="${color}" stroke-width="1.7"`);
      let lineY = baseline;
      svg += `<g data-scientific-label="true" role="img" aria-label="${escape(item.name)}">`;
      legendLines[i].forEach((label, j) => {
        if (j) lineY += Math.max(15, legendLines[i][j - 1].descent + label.ascent + 3);
        svg += svgLabelLine(label, x + 23, lineY);
      });
      svg += '</g>';
      if (vertical) y += legendHeights[i] + 9;
      else if (i % columns === columns - 1) y += rowHeights[Math.floor(i / columns)];
    });
    svg += '</g>';
  }
  noteLines.forEach((note, i) => { svg += text(18, H - noteHeight + 12 + i * 12, note, 'font-size="9" fill="#64717a"'); });
  return svg + '</g></svg>';
}

export function figureFilename(name: string): string { return (name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\.(dat|txt|csv|mossa|json)$/i, '').trim() || 'mossa-spectrum') + '-figure'; }
export const saveFigureBlob = saveBlob;

/** Canvas defaults to 96 dpi. Write the selected physical resolution into PNG metadata. */
export async function pngResolution(blob: Blob, dpi: number): Promise<Blob> {
  const source = new Uint8Array(await blob.arrayBuffer()), view = new DataView(source.buffer);
  const chunk = new Uint8Array(21), data = new DataView(chunk.buffer);
  data.setUint32(0, 9); chunk.set([112, 72, 89, 115], 4); // pHYs
  const perMeter = Math.round(dpi / .0254);
  data.setUint32(8, perMeter); data.setUint32(12, perMeter); chunk[16] = 1;
  let crc = 0xffffffff;
  for (const byte of chunk.slice(4, 17)) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  data.setUint32(17, (crc ^ 0xffffffff) >>> 0);
  const parts: BlobPart[] = [source.slice(0, 8)];
  for (let offset = 8; offset + 12 <= source.length;) {
    const length = view.getUint32(offset), type = String.fromCharCode(...source.slice(offset + 4, offset + 8));
    if (type !== 'pHYs') parts.push(source.slice(offset, offset + length + 12));
    if (type === 'IHDR') parts.push(chunk);
    offset += length + 12;
  }
  return new Blob(parts, { type: 'image/png' });
}
export async function figurePng(svg: string, widthMm: number, heightMm: number, dpi: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = Math.round(widthMm / 25.4 * dpi); canvas.height = Math.round(heightMm / 25.4 * dpi);
    const context = canvas.getContext('2d'); if (!context) throw new Error('PNG export is unavailable in this browser.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the PNG.')), 'image/png'));
    return await pngResolution(blob, dpi);
  } finally { URL.revokeObjectURL(url); }
}
