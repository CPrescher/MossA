import type { Project, Evaluation } from './types';
export function parseSpectrum(text: string): { raw?: number[]; spectrum?: Project['spectrum'] };
export function foldCounts(data: number[], center: number): number[];
export function calibrateCounts(data: number[], maxVelocity: number, shift: number, sinusoidal: boolean, foldCenter?: number | null): Project['spectrum'];
export function validateProjectFile(doc: unknown): Project;
export function csvSpectrum(project: Project, evaluation: Evaluation): string;
