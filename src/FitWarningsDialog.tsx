import {useEffect,useRef} from 'react';
import type {WarningParameter} from './warning-parameters';
export function FitWarningsDialog({warnings,context,onClose,parameters=[],onInspect}:{warnings:string[];context:string;onClose:()=>void;parameters?:WarningParameter[];onInspect?:(parameter:WarningParameter)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog ref={dialog} className="fit-warnings-dialog" aria-labelledby="fit-warnings-title" aria-describedby="fit-warnings-context" onClose={onClose} onKeyDown={event=>event.stopPropagation()}>
    <div className="help-heading"><h2 id="fit-warnings-title">Fit warnings</h2><button autoFocus aria-label="Close fit warnings" onClick={()=>dialog.current?.close()}>×</button></div>
    <p id="fit-warnings-context" className="subtle">{context}</p>
    <ul>{warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul>
    {parameters.length>0&&<details className="warning-parameters" open={parameters.length<=4}><summary>Parameters without std ({parameters.length})</summary><p>These fitted or linked values have no symmetric std estimate. Fixed parameters are excluded.</p><ul>{parameters.map(parameter=><li key={parameter.id}><strong>{parameter.label}</strong><span>{parameter.location}</span>{onInspect&&<button onClick={()=>onInspect(parameter)} aria-label={`Inspect ${parameter.label}`}>Inspect parameter →</button>}</li>)}</ul></details>}
    <p>Convergence alone does not establish that every parameter is independently determined. Review these warnings before using the fitted values and std.</p>
  </dialog>;
}
