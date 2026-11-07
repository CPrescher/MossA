import { newNuclearConstants, nuclearConstants } from './nuclear-constants.mjs';
import { validCalibration, type Calibration } from './session';
import type { VelocityCalibration } from './calibration';

export type CalibrationPreset = { id: string; name: string; cal: Calibration };
export type CalibrationPresets = { calibrationPresets: CalibrationPreset[]; importCalibrationPresetId: string };
const id = () => globalThis.crypto?.randomUUID?.() ?? `calibration-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

// Source profiles belong to models. Applied names are provenance, not links.
export function velocityControls(cal: Calibration): Calibration {
  const { sourceReference: _source, preset: _preset, ...controls } = cal;
  return structuredClone(controls);
}
export function makeCalibrationPreset(name: string, cal: Calibration): CalibrationPreset {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 160) throw new Error('Enter a preset name (1–160 characters).');
  if (!validCalibration(cal)) throw new Error('Enter a positive maximum velocity and valid calibration settings.');
  if (cal.folding && (cal.center < 1 || !Number.isInteger(cal.center * 2))) throw new Error('Fold center must be a positive integer or half-integer channel.');
  return { id: id(), name: trimmed, cal: velocityControls(cal) };
}
export function initialCalibrationPresets(cal: Calibration): CalibrationPresets {
  const current = makeCalibrationPreset(cal.preset?.name ?? (cal.reference ? 'Reference calibration' : `${Number(cal.max.toPrecision(6))} mm/s`), cal);
  const calibrationPresets = [current];
  for (const max of [5, 10]) {
    if (!cal.reference && cal.max === max && cal.shift === 0) continue;
    calibrationPresets.push(makeCalibrationPreset(`${max} mm/s`, { max, shift: 0, sinusoidal: false, folding: cal.folding, autoFold: true, center: 256.5, nuclear_constants: newNuclearConstants() }));
  }
  return { calibrationPresets, importCalibrationPresetId: current.id };
}
export function decodeCalibrationPresets(value: Partial<CalibrationPresets>, fallback: Calibration): CalibrationPresets {
  if (value.calibrationPresets === undefined && value.importCalibrationPresetId === undefined) return initialCalibrationPresets(fallback);
  const presets = value.calibrationPresets;
  if (!Array.isArray(presets) || !presets.length || presets.length > 100) throw new Error('Invalid calibration presets.');
  const ids = new Set<string>();
  const calibrationPresets = presets.map(p => {
    if (!p || typeof p.id !== 'string' || !p.id.length || p.id.length > 1000 || ids.has(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 160 || !validCalibration(p.cal)) throw new Error('Invalid calibration preset.');
    if (p.cal.folding && (p.cal.center < 1 || !Number.isInteger(p.cal.center * 2))) throw new Error('Invalid calibration preset fold center.');
    ids.add(p.id);
    return { id: p.id, name: p.name, cal: velocityControls(p.cal) };
  });
  if (!calibrationPresets.some(p => p.id === value.importCalibrationPresetId)) throw new Error('Invalid default calibration preset.');
  return { calibrationPresets, importCalibrationPresetId: value.importCalibrationPresetId! };
}
export function controlsFromPreset(preset: CalibrationPreset): Calibration {
  return { ...velocityControls(preset.cal), preset: { id: preset.id, name: preset.name } };
}
export function calibrationForImport(preset: CalibrationPreset, length: number): Calibration {
  const cal = controlsFromPreset(preset);
  cal.folding = cal.folding && length >= 16;
  // Automatic centers are measured afresh for each file, never borrowed from a standard.
  if (cal.autoFold !== false) cal.center = length / 2 + .5;
  return cal;
}
export function calibrationFromReference(base: Calibration, result: VelocityCalibration): Calibration {
  const cal = { ...velocityControls(base), max: result.max, shift: result.shift,
    sinusoidal: result.reference.settings.sinusoidal, folding: result.reference.settings.folding,
    autoFold: result.reference.settings.autoCenter !== false, center: result.reference.settings.center,
    reference: structuredClone(result.reference) };
  if (result.reference.settings.nuclear_constants) cal.nuclear_constants = nuclearConstants(result.reference.settings.nuclear_constants);
  else delete cal.nuclear_constants;
  return cal;
}
export function sameCalibration(a: Calibration, b: Calibration, ignoreAutoCenter = true): boolean {
  return a.max === b.max && a.shift === b.shift && a.sinusoidal === b.sinusoidal && a.folding === b.folding
    && (a.autoFold !== false) === (b.autoFold !== false)
    && ((!a.folding || (ignoreAutoCenter && a.autoFold !== false)) || a.center === b.center)
    && nuclearConstants(a.nuclear_constants).id === nuclearConstants(b.nuclear_constants).id
    && JSON.stringify(a.reference ?? null) === JSON.stringify(b.reference ?? null);
}
