import type { Evaluation, FitProgress, FitResult, Project } from './types';
export function searchCandidate(project: Project, index: number): Project;
export function fitMultiStart(project: Project, fitLocal: (project: Project, onProgress?: (state: FitProgress) => void) => FitResult, evaluate: (project: Project) => Evaluation, onProgress?: (state: FitProgress) => void): FitResult;
