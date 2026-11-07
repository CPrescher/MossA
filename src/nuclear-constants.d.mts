export type NuclearConstants = { id: 'mossa-legacy-rounded' | 'fe57-iaea-2019-2020-codata2022'; coefficients: [number, number, number] };
export const LEGACY_NUCLEAR_CONVENTION: NuclearConstants['id'];
export const CURRENT_NUCLEAR_CONVENTION: NuclearConstants['id'];
export function validNuclearConstants(value: unknown): value is NuclearConstants;
export function nuclearConstants(value?: NuclearConstants): NuclearConstants;
export function newNuclearConstants(): NuclearConstants;
export function usesModernNuclearConstants(value?: NuclearConstants): boolean;
