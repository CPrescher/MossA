/** WebKit on macOS does not focus buttons on mouse/AX activation by default.
 * Focus the activated control before its handler opens a dialog, so native
 * dialog focus restoration and keyboard continuation have a real target. */
export function focusActivatedControl(target:EventTarget|null) {
  const element=target as Element|null;
  const control=element?.closest?.<HTMLElement>('button,summary');
  if(control&&!control.matches(':disabled'))control.focus({preventScroll:true});
}

export function captureDialogFocus():HTMLElement|null {
  return typeof document!=='undefined'&&typeof HTMLElement!=='undefined'&&document.activeElement instanceof HTMLElement?document.activeElement:null;
}
export function resolveFocusTarget(trigger:HTMLElement|null):HTMLElement|null {
 if(!trigger||trigger.isConnected)return trigger;
 return trigger.dataset.returnFocus?document.getElementById(trigger.dataset.returnFocus):null;
}
/** Wait for actual readiness, including ancestor fieldsets; never take focus
 * back after the user has deliberately moved to another control. */
export function restoreDialogFocus(trigger:HTMLElement|null) {
 if(!trigger||trigger===document.body||typeof window==='undefined')return;
 window.requestAnimationFrame(()=>{
  let observer:MutationObserver|undefined,timer:number|undefined;
  const target=resolveFocusTarget(trigger);if(!target)return;
  const cleanup=()=>{observer?.disconnect();if(timer!==undefined)window.clearTimeout(timer);document.removeEventListener('focusin',moved);};
  const moved=()=>{if(document.activeElement!==document.body&&document.activeElement!==target)cleanup();};
  const restore=()=>{
   if(!target.isConnected||!target.getClientRects().length||(document.activeElement!==document.body&&document.activeElement!==target)){cleanup();return;}
   if(target.matches(':disabled')||target.closest('[inert]'))return;
   cleanup();target.focus({preventScroll:true});
  };
  observer=new window.MutationObserver(restore);
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','hidden','inert','class','style']});
  document.addEventListener('focusin',moved);timer=window.setTimeout(cleanup,5000);restore();
 });
}
export async function withNativeDialogFocus<T>(action:()=>Promise<T>,trigger=captureDialogFocus()):Promise<T> {
  try{return await action();}
  finally{restoreDialogFocus(trigger);}
}
