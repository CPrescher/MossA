// File parsing is deliberately separate from the fitting engine; no browser APIs here.
export function parseSpectrum(text) {
  const rows = []; let width;
  for (const [i, original] of text.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    const line = original.trim();
    if (!line || /^(#|%|;|\/\/)/.test(line)) continue;
    // Allow one conventional column-name header, but never silently discard numeric rows.
    if (!rows.length && /^(velocity|channel|x|counts)(\b|[,;\t])/i.test(line)) continue;
    const cells = line.split(/[\s,;]+/).filter(Boolean);
    if (cells.length !== 1 && cells.length !== 2) throw new Error(`Line ${i + 1}: expected one count column or two velocity/count columns.`);
    const values = cells.map(Number);
    if (values.some(v => !Number.isFinite(v))) throw new Error(`Line ${i + 1}: invalid number. Use a dot as the decimal separator.`);
    width ??= cells.length;
    if (width !== cells.length) throw new Error(`Line ${i + 1}: inconsistent column count.`);
    rows.push(values);
  }
  if (rows.length < 8 || rows.length > 20000) throw new Error('Provide 8–20,000 data rows.');
  if (width === 1) return { raw: rows.map(r => r[0]) };
  rows.sort((a, b) => a[0] - b[0]);
  if (rows.some((r, i) => i && r[0] === rows[i - 1][0])) throw new Error('Duplicate velocities are not supported.');
  return { spectrum: { x: rows.map(r => r[0]), y: rows.map(r => r[1]) } };
}
// Direct port of fold.m's 1-based integer/half-integer folding conventions.
export function foldCounts(data, center) {
  const n = data.length;
  if (n < 16) throw new Error('Folding requires at least 16 data points.');
  if (!Number.isFinite(center) || center < 1 || center > n || Math.abs(center * 2 - Math.round(center * 2)) > 1e-9) throw new Error('Fold center must be an integer or half-integer channel inside the spectrum (1-based).');
  const at = i => data[((i - 1) % n + n) % n];
  if (center % 1) return Array.from({ length: n / 2 }, (_, k) => at(Math.floor(center) - k) + at(Math.floor(center) + k + 1));
  return [at(center) * 2, ...Array.from({ length: n / 2 - 1 }, (_, k) => at(center - k - 1) + at(center + k + 1))];
}
export function calibrateCounts(data, maxVelocity, shift, sinusoidal, foldCenter = null) {
  if (!Number.isFinite(maxVelocity) || maxVelocity <= 0 || !Number.isFinite(shift)) throw new Error('Enter a positive maximum velocity and finite center shift.');
  const y = foldCenter === null ? [...data] : foldCounts(data, foldCenter);
  return { x: y.map((_, i) => (sinusoidal ? -Math.cos(i / (y.length - 1) * Math.PI) : -1 + 2 * i / (y.length - 1)) * maxVelocity - shift), y };
}
export function validateProjectFile(doc) {
  if (doc?.format !== 'mossa-project' || doc.version !== 1 || !doc.project) throw new Error('This is not a supported MossA browser project (version 1). MATLAB .map files need conversion.');
  const p = doc.project;
  if (!Array.isArray(p.spectrum?.x) || !Array.isArray(p.spectrum?.y) || !Array.isArray(p.sites) || !Array.isArray(p.background) || p.sites.length > 16 || p.spectrum.x.length > 20000) throw new Error('Invalid project structure or size.');
  return p;
}
export function csvSpectrum(project, evaluation) {
  return ['velocity_mm_s,observed,model,residual,background', ...project.spectrum.x.map((x, i) => [x, project.spectrum.y[i], evaluation.y[i], evaluation.residual[i], evaluation.background[i]].join(','))].join('\n') + '\n';
}
