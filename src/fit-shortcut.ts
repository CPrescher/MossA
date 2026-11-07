import {resolveFocusTarget} from './focus-control';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

// Commit the active numeric field before using the newly rendered Fit action.
// Modal dialogs retain their own keyboard behavior, and this never activates Stop.
export function fitShortcut(event:ReactKeyboardEvent<HTMLElement>|KeyboardEvent,scope?:HTMLElement|null) {
  if(event.defaultPrevented||event.key !== 'Enter' || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || document.querySelector('dialog[open],[role="dialog"]')) return;
  const root=scope??event.currentTarget;if(!(root instanceof HTMLElement))return;
  event.preventDefault();
  let origin = document.activeElement as HTMLElement | null;
  origin?.blur();
  window.setTimeout(() => {
    if(!root.isConnected) return;
    origin=resolveFocusTarget(origin);
    const activated=root.querySelector<HTMLButtonElement>('.fit-button:not(.stop):not(:disabled)');
    const restore = () => {
      if(!origin?.isConnected || origin===document.body || !root.isConnected || (document.activeElement !== document.body && document.activeElement !== origin && document.activeElement !== activated)) { observer.disconnect(); return; }
      if(root.querySelector('.fit-button.stop') || origin.matches(':disabled')) return;
      origin.focus({preventScroll:true});
      observer.disconnect();
    };
    const observer = new window.MutationObserver(restore);
    observer.observe(root, {subtree:true,childList:true,attributes:true,attributeFilter:['disabled','class']});
    activated?.click();
    window.setTimeout(restore, 0);
  }, 0);
}
