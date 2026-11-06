import type { Project } from './types';
export function duplicateSiteAt(project: Project, index: number): { project: Project; selected: number };
export function removeSiteAt(project: Project, selected: number, index: number): { project: Project; selected: number };
