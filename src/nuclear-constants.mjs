import definitions from './nuclear-constants.json' with { type: 'json' };
export const LEGACY_NUCLEAR_CONVENTION = 'mossa-legacy-rounded';
export const CURRENT_NUCLEAR_CONVENTION = 'fe57-iaea-2019-2020-codata2022';
export function validNuclearConstants(value) {
  return !!value && Object.hasOwn(definitions, value.id) && Array.isArray(value.coefficients) && value.coefficients.length === 3 && value.coefficients.every((v, i) => v === definitions[value.id].coefficients[i]);
}
export function nuclearConstants(value) {
  // Missing metadata identifies an existing analysis, never a new default.
  if (value === undefined) return { id: LEGACY_NUCLEAR_CONVENTION, coefficients: [...definitions[LEGACY_NUCLEAR_CONVENTION].coefficients] };
  if (!validNuclearConstants(value)) throw new Error('Unsupported or inconsistent ⁵⁷Fe nuclear constants.');
  return { id: value.id, coefficients: [...value.coefficients] };
}
export function newNuclearConstants() {
  return { id: CURRENT_NUCLEAR_CONVENTION, coefficients: [...definitions[CURRENT_NUCLEAR_CONVENTION].coefficients] };
}
export function usesModernNuclearConstants(value) { return nuclearConstants(value).id !== LEGACY_NUCLEAR_CONVENTION; }
