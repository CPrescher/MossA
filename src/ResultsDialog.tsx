import {useEffect,useRef,type ReactNode} from 'react';

export function ResultsDialog({children,onClose,context}:{children:ReactNode;context?:string;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog ref={dialog} className="results-dialog" aria-labelledby="expanded-results-title" aria-describedby={context?'expanded-results-context':undefined} onClose={onClose} onKeyDown={event=>event.stopPropagation()}>
    <div className="help-heading"><div><h2 id="expanded-results-title">Expanded results</h2>{context&&<p id="expanded-results-context" className="subtle" title={context}>{context}</p>}</div><button autoFocus aria-label="Close expanded results" onClick={()=>dialog.current?.close()}>×</button></div>
    <div className="results-dialog-content">{children}</div>
  </dialog>;
}
