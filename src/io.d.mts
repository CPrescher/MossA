import type { Project, Evaluation } from './types';
export type ImportInfo = { format: 'spec-mca' | 'sms-five-column'; channels: number; columns?: number[]; headers?: string[]; filename?: string };
export function parseSpectrum(text: string): { raw?: number[]; spectrum?: Project['spectrum']; importInfo?: ImportInfo; notice?: string };
export function validImportInfo(value: unknown): value is ImportInfo;
export function reverseSpectrum(spectrum: Project['spectrum']): Project['spectrum'];
export function foldCounts(data: number[], center: number): number[];
export function calibrateCounts(data: number[], maxVelocity: number, shift: number, sinusoidal: boolean, foldCenter?: number | null, reversed?: boolean): Project['spectrum'];
export function validateProjectFile(doc: unknown): Project;
export function csvSpectrum(project: Project, evaluation: Evaluation): string;
