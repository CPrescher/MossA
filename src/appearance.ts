export const textSizeStorageKey = 'mossa-text-size';
export const textSizes = ['compact', 'comfortable', 'large', 'extra-large'] as const;
export type TextSize = typeof textSizes[number];

export function readTextSize(): TextSize {
  try {
    const value = window.localStorage.getItem(textSizeStorageKey);
    if (textSizes.includes(value as TextSize)) return value as TextSize;
  } catch { /* Use the readable default when storage is unavailable. */ }
  return 'comfortable';
}

export function applyTextSize(size: TextSize) {
  document.documentElement.dataset.textSize = size;
  window.dispatchEvent(new window.Event('mossa-appearance-change'));
}
