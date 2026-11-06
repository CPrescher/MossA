export function niceTicks(lo, hi, count = 5) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return { values: [], step: 1 };
  const raw = (hi - lo) / Math.max(1, count), power = 10 ** Math.floor(Math.log10(raw));
  const factor = [1, 2, 2.5, 5, 10].find(v => v >= raw / power - 1e-12) ?? 10;
  const step = factor * power, start = Math.ceil(lo / step - 1e-10), end = Math.floor(hi / step + 1e-10), values = [];
  for (let i = start; i <= end && values.length < 100; i++) { const v = Number((i * step).toPrecision(14)); values.push(Math.abs(v) < step * 1e-10 ? 0 : v); }
  return { values, step };
}
export function formatTick(value, step) {
  if (Math.abs(value) < Math.abs(step) * 1e-10) value = 0;
  const magnitude = Math.abs(value);
  if (magnitude >= 1e7 || (magnitude > 0 && magnitude < .001)) { const precision = Math.max(0, Math.min(6, Math.floor(Math.log10(magnitude)) - Math.floor(Math.log10(Math.abs(step))) + (Math.abs(Math.abs(step) / 10 ** Math.floor(Math.log10(Math.abs(step))) - 2.5) < 1e-8 ? 1 : 0))); return value.toExponential(precision).replace(/e\+?(-?)0*(\d+)/, 'e$1$2'); }
  const exponent = Math.floor(Math.log10(Math.abs(step))), fractional = Math.abs(step / 10 ** exponent - 2.5) < 1e-8 ? 1 : 0;
  const digits = Math.min(10, Math.max(0, -exponent + fractional));
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
