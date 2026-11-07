import { invoke, isTauri } from '@tauri-apps/api/core';
import { saveText } from './file-save';
import {captureDialogFocus,withNativeDialogFocus} from './focus-control';

export type ProjectFileTarget = { id: string; filename: string };
export type OpenedDesktopProject = ProjectFileTarget & { contents: string };

// File capabilities live only in this editor session, never in a project or
// autosave. History keeps a separate document identity across New/Open/Undo.
export class ProjectFiles {
  private targets = new WeakMap<object, ProjectFileTarget>();
  filename(document:object) { return this.targets.get(document)?.filename; }
  opened(document: object, target: ProjectFileTarget) { this.targets.set(document, target); }
  async save(document: object, filename: string, contents: string, saveAs = false,returnFocus=captureDialogFocus()) {
    if (!isTauri()) return saveText(filename, contents, 'application/json');
    const target = this.targets.get(document);
    const saved = await withNativeDialogFocus(()=>invoke<ProjectFileTarget | null>('save_project_file', {
      target: target?.id ?? null, filename, contents, saveAs,
    }),returnFocus);
    if (!saved) return false;
    this.targets.set(document, saved);
    return true;
  }
}

export function openDesktopProject() {
  return invoke<OpenedDesktopProject | null>('open_project_file');
}
