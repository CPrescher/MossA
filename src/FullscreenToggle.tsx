import { useEffect, useState } from 'react';

// Older Safari and embedded WebKit expose the prefixed Fullscreen API.
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => void | Promise<void>;
};
type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => void | Promise<void>;
};

export function FullscreenToggle({ onError }: { onError: (message: string) => void }) {
  const doc = document as FullscreenDocument;
  const element = doc.documentElement as FullscreenElement;
  const standard = typeof element.requestFullscreen === 'function';
  const supported = standard ? doc.fullscreenEnabled !== false :
    typeof element.webkitRequestFullscreen === 'function' && doc.webkitFullscreenEnabled !== false;
  const isFullscreen = () => !!(doc.fullscreenElement || doc.webkitFullscreenElement);
  const [fullscreen, setFullscreen] = useState(isFullscreen);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const update = () => setFullscreen(isFullscreen());
    doc.addEventListener('fullscreenchange', update);
    doc.addEventListener('webkitfullscreenchange', update);
    return () => {
      doc.removeEventListener('fullscreenchange', update);
      doc.removeEventListener('webkitfullscreenchange', update);
    };
  }, []);

  async function toggle() {
    setPending(true);
    try {
      if (isFullscreen()) {
        if (standard) await doc.exitFullscreen();
        else await doc.webkitExitFullscreen!();
      } else {
        // Fullscreen the document so dialogs and portals remain visible too.
        if (standard) await element.requestFullscreen();
        else await element.webkitRequestFullscreen!();
      }
    } catch {
      onError('Could not switch full-screen mode. Check your browser’s full-screen permissions and try again.');
    } finally {
      setPending(false);
    }
  }

  return <button type="button" className="header-icon-button" aria-label={fullscreen ? 'Exit full screen' : 'Enter full screen'} aria-pressed={fullscreen}
    title={!supported ? 'Full screen is unavailable in this browser' : fullscreen ? 'Exit full screen (Esc)' : 'Enter full screen · Hide browser tabs and toolbar'}
    disabled={!supported || pending} onClick={() => void toggle()}>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={fullscreen ? 'M4 9h5V4m6 0v5h5M4 15h5v5m6 0v-5h5' : 'M9 4H4v5m11-5h5v5M4 15v5h5m6 0h5v-5'}/>
    </svg>
  </button>;
}
