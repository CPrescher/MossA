import { storageKey } from './storage-namespace';
export type ThemePreference = 'system' | 'light' | 'dark';
export const themeStorageKey = 'mossa-theme';

export function readThemePreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(themeStorageKey);
    if (value === 'light' || value === 'dark') return value;
  } catch { /* Appearance still works when browser storage is unavailable. */ }
  return 'system';
}

export function isDarkTheme(preference: ThemePreference): boolean {
  return preference === 'dark' || (preference === 'system' && (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false));
}

export function applyTheme(preference: ThemePreference) {
  const dark = isDarkTheme(preference);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#181818' : '#edf0f2');
  return dark;
}
