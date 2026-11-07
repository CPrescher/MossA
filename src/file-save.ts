import { isTauri, invoke } from '@tauri-apps/api/core';
import {captureDialogFocus,withNativeDialogFocus} from './focus-control';

/** Native Save As on desktop; the same bytes are downloaded in the browser. */
export async function saveBlob(blob: Blob, filename: string,returnFocus=captureDialogFocus()): Promise<boolean> {
  if (isTauri()) {
    const data=Array.from(new Uint8Array(await blob.arrayBuffer()));
    return withNativeDialogFocus(()=>invoke<boolean>('save_file', { filename, data }),returnFocus);
  }
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export function saveText(filename: string, data: string, type: string) {
  return saveBlob(new Blob([data], { type }), filename);
}
