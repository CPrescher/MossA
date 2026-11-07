import { niceTicks, formatTick } from './axes.mjs';

/** Choose rounded labels with enough density, while reserving room for their text. */
export function figureTicks(lo: number, hi: number, pixels: number, horizontal = true) {
  let count = Math.max(4, Math.floor(pixels / (horizontal ? 48 : 45)));
  let ticks = niceTicks(lo, hi, count);
  while (horizontal && count > 2) {
    const labelWidth = Math.max(...ticks.values.map(v => formatTick(v, ticks.step).length)) * 7 + 16;
    if (ticks.step / (hi - lo) * pixels >= labelWidth) break;
    ticks = niceTicks(lo, hi, --count);
  }
  const subdivisions = Math.abs(ticks.step / 10 ** Math.floor(Math.log10(ticks.step)) - 2) < 1e-8 ? 4 : 5;
  const minorStep = ticks.step / subdivisions, minor: number[] = [];
  for (let i = Math.ceil(lo / minorStep - 1e-9); i <= Math.floor(hi / minorStep + 1e-9) && minor.length < 500; i++) {
    const value = Number((i * minorStep).toPrecision(14));
    if (Math.abs(value / ticks.step - Math.round(value / ticks.step)) > 1e-8) minor.push(value);
  }
  return { ...ticks, minor };
}

export type FigureRect = { x: number; y: number; width: number; height: number };
export function intersects(a: FigureRect, b: FigureRect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
/** Try corners first, then open positions along the edges and across the interior. */
export function legendSpace(plot: FigureRect, width: number, height: number, occupied: FigureRect[]): FigureRect | null {
  const left = plot.x + 12, top = plot.y + 12, dx = plot.width - width - 24, dy = plot.height - height - 24;
  if (dx < 0 || dy < 0) return null;
  for (const fy of [0, 1, .25, .5, .75]) for (const fx of [1, 0, .5, .25, .75]) {
    const candidate = { x: left + fx * dx, y: top + fy * dy, width, height };
    if (!occupied.some(rect => intersects(candidate, rect))) return candidate;
  }
  return null;
}
