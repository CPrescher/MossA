import { useEffect } from 'react';

// WebKit can focus the dialog shell when Shift+Tab leaves its first control.
// Keep keyboard navigation inside the topmost modal, including nested dialogs.
export function useDialogKeyboardNavigation() {
  useEffect(() => {
    const keydown = (event:KeyboardEvent) => {
      if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
      const dialog = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]')).at(-1);
      if (!dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],summary,[tabindex]'))
        .filter(node => !node.matches(':disabled,[tabindex="-1"],input[type=hidden]') && !node.closest('[hidden],[inert],dialog:not([open])') && node.getClientRects().length > 0);
      if (!controls.length) { event.preventDefault(); dialog.focus(); return; }
      const active = document.activeElement;
      const first = controls[0], last = controls.at(-1)!;
      if (event.shiftKey && (active === first || !controls.includes(active as HTMLElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (active === last || !controls.includes(active as HTMLElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => document.removeEventListener('keydown', keydown, true);
  }, []);
}
