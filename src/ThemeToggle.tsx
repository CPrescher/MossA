import { useEffect, useState } from 'react';
import { applyTheme, isDarkTheme, readThemePreference, themeStorageKey } from './theme';

export function ThemeToggle() {
  const [preference, setPreference] = useState(readThemePreference);
  const [dark, setDark] = useState(() => isDarkTheme(preference));
  useEffect(() => {
    const update = () => setDark(applyTheme(preference));
    update();
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (preference !== 'system') return;
    media?.addEventListener('change', update);
    return () => media?.removeEventListener('change', update);
  }, [preference]);

  return <button type="button" className="theme-toggle" aria-label="Dark mode" aria-pressed={dark} title={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => {
    const next = dark ? 'light' : 'dark';
    setPreference(next);
    try { window.localStorage.setItem(themeStorageKey, next); } catch { /* Keep the choice for this visit. */ }
  }}>
    <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dark ? <><circle cx="10" cy="10" r="3.5"/><path d="M10 1.5v1.7m0 13.6v1.7M1.5 10h1.7m13.6 0h1.7M4 4l1.2 1.2m9.6 9.6L16 16M4 16l1.2-1.2m9.6-9.6L16 4"/></> : <path d="M17 12.2A7.5 7.5 0 0 1 7.8 3a7.5 7.5 0 1 0 9.2 9.2Z"/>}
    </svg>
  </button>;
}
