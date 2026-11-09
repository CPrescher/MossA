import type { Project } from './types';

/** Matches the Rust core's analytical Jacobian support. */
export function usesAnalyticalDerivatives(project: Project, _calibration = false): boolean {
  return project.derivative_method !== 'numerical';
}
