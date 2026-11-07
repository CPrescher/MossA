import type { Evaluation, FitProgress, FitResult, Project } from './types';
export function searchCandidate(project: Project, index: number): Project;
export function fitMultiStart(project: Project, fitLocal: (project: Project, onProgress?: (state: FitProgress) => void) => FitResult, evaluate: (project: Project) => Evaluation, onProgress?: (state: FitProgress) => void): FitResult;

export function fitMultiStartAsync(project: Project, fitLocal: (project: Project, onProgress?: (state: FitProgress) => void) => Promise<FitResult>, evaluate: (project: Project) => Evaluation | Promise<Evaluation>, onProgress?: (state: FitProgress) => void): Promise<FitResult>;
