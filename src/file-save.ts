import { isTauri, invoke } from '@tauri-apps/api/core';

/** Native Save As on desktop; the same bytes are downloaded in the browser. */
export async function saveBlob(blob: Blob, filename: string): Promise<boolean> {
  if (isTauri()) {
    return invoke<boolean>('save_file', { filename, data: Array.from(new Uint8Array(await blob.arrayBuffer())) });
  }
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export function saveText(filename: string, data: string, type: string) {
  return saveBlob(new Blob([data], { type }), filename);
}
