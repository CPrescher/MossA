import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

// Fixed tolerances chosen before optimization: curve error < 1e-7 counts;
// parameter differences < 1e-3 of baseline std; std relative error < 1e-4.
// Small absolute floors cover parameters without an estimable std.
export function compare(reference, actual, diagnostic = false) {
  const failures = [];
  const check = (condition, message) => {
    if (!condition) { failures.push(message); if (!diagnostic) assert.fail(message); }
  };
  const a = reference.result, b = actual;
  const stats = { max_curve_abs: 0, max_parameter_abs: 0, max_parameter_in_std: 0, max_std_relative: 0, bitwise_equal: isDeepStrictEqual(a, b), failures };
  for (const key of ['converged', 'termination', 'iterations', 'rank', 'free_parameters', 'dof']) check(b[key] === a[key], `${reference.id}: ${key}`);
  check(JSON.stringify(Object.keys(b.evaluation.parameters)) === JSON.stringify(Object.keys(a.evaluation.parameters)), `${reference.id}: parameter keys`);
  check(JSON.stringify(Object.keys(b.errors)) === JSON.stringify(Object.keys(a.errors)), `${reference.id}: std keys`);
  check(b.evaluation.y.length === a.evaluation.y.length, `${reference.id}: channel count`);
  check(b.intensity_fractions.length === a.intensity_fractions.length, `${reference.id}: fraction count`);
  check(JSON.stringify(b.warnings) === JSON.stringify(a.warnings), `${reference.id}: warnings`);
  for (const [key, value] of Object.entries(a.evaluation.parameters)) {
    const delta = Math.abs(b.evaluation.parameters[key] - value);
    const std = a.errors[key];
    stats.max_parameter_abs = Math.max(stats.max_parameter_abs, delta);
    if (std > 1e-10) stats.max_parameter_in_std = Math.max(stats.max_parameter_in_std, delta / std);
    check(delta <= Math.max(1e-7 * Math.max(1, Math.abs(value)), (std ?? 0) * 1e-3), `${reference.id}: parameter ${key}: ${delta}`);
  }
  for (const [key, std] of Object.entries(a.errors)) {
    check((b.errors[key] === null) === (std === null), `${reference.id}: std availability ${key}`);
    if (std === null) continue;
    const delta = Math.abs(b.errors[key] - std);
    stats.max_std_relative = Math.max(stats.max_std_relative, delta / Math.max(1e-12, Math.abs(std)));
    check(delta <= Math.max(1e-10, Math.abs(std) * 1e-4), `${reference.id}: std ${key}: ${delta}`);
  }
  for (let i = 0; i < a.intensity_fractions.length; i++) {
    const x = a.intensity_fractions[i], y = b.intensity_fractions[i];
    for (const key of ['value', 'error']) {
      check((y[key] === null) === (x[key] === null), `${reference.id}: fraction ${key} availability`);
      if (x[key] !== null) check(Math.abs(y[key] - x[key]) <= Math.max(1e-7, Math.abs(x[key]) * (key === 'error' ? 1e-4 : 1e-7)), `${reference.id}: fraction ${key}`);
    }
  }
  for (let i = 0; i < a.evaluation.y.length; i++) stats.max_curve_abs = Math.max(stats.max_curve_abs, Math.abs(a.evaluation.y[i] - b.evaluation.y[i]));
  check(stats.max_curve_abs < 1e-7, `${reference.id}: curve ${stats.max_curve_abs}`);
  check(Math.abs(a.evaluation.objective - b.evaluation.objective) <= 1e-7 * Math.max(1, a.evaluation.objective), `${reference.id}: objective`);
  return stats;
}
