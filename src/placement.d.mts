import type { NuclearConstants } from './nuclear-constants.mjs';
export function placedParameters(kind: string, profile: string, first: { x: number; y: number }, widthPoint: { x: number; y: number } | null, opposite: { x: number; y: number } | null, background: number, mode: string, mix?: number, constants?: NuclearConstants): Record<string, number>;
import type { Site, Project } from './types';
export function updatePlacementSite(site: Site, values: Record<string, number>): Site;
export function placementProject(project: Project, site: Site, index?: number | null): Project;
