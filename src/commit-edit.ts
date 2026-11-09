import {flushSync} from 'react-dom';
import {captureDialogFocus,resolveFocusTarget} from './focus-control';

/** Commit pending input/name edits and flush their React updates before an
 * action reads its latest document ref. Invalid drafts stay available to fix. */
export function commitActiveEdit() {
 const origin=captureDialogFocus();
 flushSync(()=>origin?.blur());
 return {origin:resolveFocusTarget(origin),invalid:document.querySelector<HTMLInputElement>('.app input[aria-invalid="true"]')};
}
