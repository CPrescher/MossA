import type { Evaluation, FitProgress, FitResult, Project, LocalFitResult, FitFinalization } from './types';
export const explorationPolicy: Readonly<{ iterations: number; iterations_per_parameter: number; objective_margin: number }>;
export function searchCandidate(project: Project, index: number): Project;
export function fitMultiStart(project: Project, fitLocal: (project: Project, onProgress?: (state: FitProgress) => void) => LocalFitResult, evaluate: (project: Project) => Evaluation, onProgress?: (state: FitProgress) => void, finalize?: (state: FitFinalization) => FitResult): FitResult;

export type MultiStartExecution = {
  independentFit?: (project: Project, onProgress?: (state: FitProgress) => void) => Promise<LocalFitResult>;
  check?: () => void;
  cancelIndependent?: () => void;
};
export function fitMultiStartAsync(project: Project, fitLocal: (project: Project, onProgress?: (state: FitProgress) => void) => Promise<LocalFitResult>, evaluate: (project: Project) => Evaluation | Promise<Evaluation>, onProgress?: (state: FitProgress) => void, finalize?: (state: FitFinalization) => FitResult | Promise<FitResult>, execution?: MultiStartExecution): Promise<FitResult>;
