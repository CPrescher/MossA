import {useEffect,useMemo,useRef,useState} from 'react';
import {isTauri} from '@tauri-apps/api/core';
import {renderFitReport,type FitReportInput} from './fit-report';
import {figuresPdf} from './figure-pdf';
import {saveBlob} from './file-save';
import {safeFilenamePart} from './export-filename';
import {captureDialogFocus} from './focus-control';
import {useActionNotice} from './useActionNotice';
import './figure-export.css';
import './fit-report.css';

export function FitReportDialog({input,onClose}:{input:FitReportInput;onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null),createdAt=useRef(new Date());
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[magnified,setMagnified]=useState(false);
 const notice=useActionNotice();
 const preview=useMemo(()=>{try{return {pages:renderFitReport({...input,createdAt:createdAt.current}),error:''};}catch(e){return {pages:[],error:(e as Error).message};}},[input]);
 useEffect(()=>{dialog.current?.showModal();},[]);
 async function save() {
  if(busy||!preview.pages.length)return;
  const focus=captureDialogFocus();setBusy(true);setError('');notice.clear();
  try {
   const blob=await figuresPdf(preview.pages,210,297);
   const name=`${safeFilenamePart(input.spectrumName,90)||'spectrum'} - ${safeFilenamePart(input.modelName,90)||'model'} - fit report.pdf`;
   const saved=await saveBlob(blob,name,focus);
   notice.show(saved?(isTauri()?'Fit report saved.':`Downloaded ${name}`):'Save canceled; report kept open.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <dialog ref={dialog} className="figure-export-dialog fit-report-dialog" aria-labelledby="fit-report-heading" onClose={onClose} onKeyDown={e=>e.stopPropagation()}>
  <header className="figure-export-heading"><div className="figure-export-title"><h2 id="fit-report-heading">Export fit report</h2><p>{input.spectrumName} · {input.modelName}</p></div><button autoFocus aria-label="Close fit report" onClick={()=>dialog.current?.close()}>×</button></header>
  <div className="fit-report-body">
   <div className="figure-preview-meta"><span>A4 · {preview.pages.length} {preview.pages.length===1?'page':'pages'} · Vector PDF</span><button aria-pressed={magnified} onClick={()=>setMagnified(v=>!v)}>Magnify preview</button></div>
   <p className="figure-control-note">The graph uses this model’s saved Figure settings. All model sites and parameters are included in the tables.</p>
   <div className={`fit-report-pages${magnified?' fit-report-magnified':''}`} role="region" aria-label="Fit report preview" tabIndex={0}>
    {preview.error?<p role="alert">{preview.error}</p>:preview.pages.map((page,i)=><div className="fit-report-page" key={i} aria-label={`Report page ${i+1}`} dangerouslySetInnerHTML={{__html:page}}/>)}
   </div>
  </div>
  <footer className="figure-export-footer"><span role={error?'alert':'status'}>{error||notice.text||'Graph, parameters, fit details, and warnings.'}</span><button className="figure-save-button" disabled={busy||!preview.pages.length} onClick={()=>void save()}>{busy?'Preparing…':isTauri()?'Save report…':'Download PDF'}</button></footer>
 </dialog>;
}
