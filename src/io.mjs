// File parsing is deliberately separate from the fitting engine; no browser APIs here.
export function parseSpectrum(text) {
  if (/^\s*(?:@A(?:\s|$)|#@(?:MCA|CHANN)\b)/m.test(text)) return parseSpecMca(text);
  const rows = []; let width;
  for (const [i, original] of text.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    const line = original.trim();
    if (!line || /^(#|%|;|\/\/)/.test(line)) continue;
    // Allow one conventional column-name header, but never silently discard numeric rows.
    if (!rows.length && /^(velocity|channel|x|counts)(\b|[,;\t])/i.test(line)) continue;
    const cells = line.split(/[\s,;]+/).filter(Boolean);
    if (![1, 2, 5].includes(cells.length)) throw new Error(`Line ${i + 1}: expected one count column, two velocity/count columns, or a recognized five-column SMS reference.`);
    const values = cells.map(Number);
    if (values.some(v => !Number.isFinite(v))) throw new Error(`Line ${i + 1}: invalid number. Use a dot as the decimal separator.`);
    width ??= cells.length;
    if (width !== cells.length) throw new Error(`Line ${i + 1}: inconsistent column count.`);
    rows.push(values);
  }
  if (rows.length < 8 || rows.length > 20000) throw new Error('Provide 8–20,000 data rows.');
  if (width === 1) return { raw: rows.map(r => r[0]) };
  if (width === 5 && !rows.every(r => r[1] >= 0 && r[3] >= 0 && r[4] >= 0
    && Math.abs(r[1] - r[3] - r[4]) <= 1e-6 * Math.max(1, r[1])
    && Math.abs(r[2] - r[3] + r[4]) <= 1e-6 * Math.max(1, r[1]))) {
    throw new Error('Unrecognized five-column table. SMS references must be velocity, total counts, forward-minus-reverse, forward counts, reverse counts. Export explicit velocity/count columns for other tables.');
  }
  rows.sort((a, b) => a[0] - b[0]);
  if (rows.some((r, i) => i && r[0] === rows[i - 1][0])) throw new Error('Duplicate velocities are not supported.');
  return { spectrum: { x: rows.map(r => r[0]), y: rows.map(r => r[1]) },
    ...(width === 5 ? { importInfo: { format: 'sms-five-column', channels: rows.length, columns: [1, 2] }, notice: 'SMS reference: using column 1 (velocity) and column 2 (total counts). Difference and directional-count columns are not fitted.' } : {}) };
}

function parseSpecMca(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const starts = lines.flatMap((line, i) => /^\s*@A(?:\s|$)/.test(line) ? [i] : []);
  if (starts.length !== 1) throw new Error('SPEC MCA import requires exactly one @A count block; split multiple spectra into separate files.');
  const start = starts[0], headers = lines.slice(0, start).filter(l => l.trim());
  if (headers.length > 200 || headers.some(l => l.length > 5000)) throw new Error('SPEC MCA metadata is too large (maximum 200 header lines of 5,000 characters).');
  if (headers.some(l => !l.trim().startsWith('#'))) throw new Error('Unexpected data before the SPEC MCA count block.');
  const declarations = headers.filter(l => /^\s*#@CHANN\s/.test(l));
  if (declarations.length !== 1) throw new Error('SPEC MCA requires one #@CHANN channel-count declaration.');
  const channel = declarations[0].trim().match(/^#@CHANN\s+(\d+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s*$/);
  if (!channel) throw new Error('Invalid SPEC MCA channel declaration.');
  const [count, first, last, step] = channel.slice(1).map(Number);
  if (!Number.isInteger(count) || count < 8 || count > 20000 || ![first,last,step].every(Number.isFinite) || step <= 0 || Math.abs((last-first)/step+1-count) > 1e-8) throw new Error('Inconsistent SPEC MCA channel declaration (8–20,000 channels required).');
  const raw = [];
  for (let i = start; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;
    if (i === start) line = line.replace(/^@A\s*/, '');
    line = line.replace(/\\+\s*$/, '').trim();
    if (!line) continue;
    for (const token of line.split(/\s+/)) {
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token)) throw new Error(`Invalid SPEC MCA count at line ${i+1}.`);
      const value = Number(token);
      if (!Number.isFinite(value) || value < 0) throw new Error(`SPEC MCA counts must be finite and nonnegative (line ${i+1}).`);
      raw.push(value);
      if (raw.length > count) throw new Error('SPEC MCA has more counts than declared.');
    }
  }
  if (raw.length !== count) throw new Error(`SPEC MCA declares ${count} channels but contains ${raw.length} counts.`);
  return { raw, importInfo: { format: 'spec-mca', channels: count, headers }, notice: `SPEC MCA: ${count} raw count channels in acquisition order. Header calibration is retained as metadata, not used as a velocity scale.` };
}

export function validImportInfo(info) {
  return !!info && ['spec-mca','sms-five-column'].includes(info.format) && Number.isInteger(info.channels) && info.channels >= 8 && info.channels <= 20000
    && (info.filename === undefined || (typeof info.filename === 'string' && info.filename.length <= 1000))
    && (info.columns === undefined || (Array.isArray(info.columns) && info.columns.length === 2 && info.columns[0] === 1 && info.columns[1] === 2))
    && (info.headers === undefined || (Array.isArray(info.headers) && info.headers.length <= 200 && info.headers.every(h => typeof h === 'string' && h.length <= 5000)));
}

// Preserve observations as pairs while maintaining the increasing-x invariant.
export function reverseSpectrum(spectrum) {
  return { x: spectrum.x.map(v => -v).reverse(), y: [...spectrum.y].reverse() };
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
export function calibrateCounts(data, maxVelocity, shift, sinusoidal, foldCenter = null, reversed = false) {
  if (!Number.isFinite(maxVelocity) || maxVelocity <= 0 || !Number.isFinite(shift)) throw new Error('Enter a positive maximum velocity and finite center shift.');
  const y = foldCenter === null ? [...data] : foldCounts(data, foldCenter);
  const spectrum = { x: y.map((_, i) => (sinusoidal ? -Math.cos(i / (y.length - 1) * Math.PI) : -1 + 2 * i / (y.length - 1)) * maxVelocity - shift), y };
  return reversed ? reverseSpectrum(spectrum) : spectrum;
}
export function validateProjectFile(doc) {
  if (doc?.format !== 'mossa-project' || ![1,2,3].includes(doc.version) || !doc.project || (doc.required_features !== undefined && (!Array.isArray(doc.required_features) || !doc.required_features.length || doc.required_features.some(feature => feature !== 'xvbf-v1' && !(doc.version === 3 && feature === 'velocity-reversal-v1'))))) throw new Error('This is not a supported MossA browser project version or it requires a newer app. MATLAB .map files need conversion.');
  const p = doc.project;
  if (!Array.isArray(p.spectrum?.x) || !Array.isArray(p.spectrum?.y) || !Array.isArray(p.sites) || !Array.isArray(p.background) || p.sites.length > 16 || p.spectrum.x.length > 20000) throw new Error('Invalid project structure or size.');
  return p;
}
export function csvSpectrum(project, evaluation) {
  return ['velocity_mm_s,observed,model,residual,background', ...project.spectrum.x.map((x, i) => [x, project.spectrum.y[i], evaluation.y[i], evaluation.residual[i], evaluation.background[i]].join(','))].join('\n') + '\n';
}
