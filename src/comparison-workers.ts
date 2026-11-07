export function comparisonWorkerCount(requested = 0, hardwareConcurrency = typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency) {
  if (!Number.isInteger(requested) || requested < 0 || requested > 16) throw new Error('Choose Auto or 1–16 parallel workers.');
  const available = Number.isFinite(hardwareConcurrency) ? Math.max(1, Math.floor(hardwareConcurrency) - 1) : 1;
  return requested || Math.min(8, available);
}
