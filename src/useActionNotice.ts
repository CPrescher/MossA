import {useCallback,useEffect,useState} from 'react';
/** Transient feedback is separate from the persistent fit/calculation summary. */
export function useActionNotice(initial='') {
 const [notice,setNotice]=useState({text:initial,serial:0,persistent:false});
 const show=useCallback((text:string,persistent=false)=>setNotice(old=>({text,serial:old.serial+1,persistent})),[]);
 const clear=useCallback(()=>setNotice(old=>old.text?{text:'',serial:old.serial+1,persistent:false}:old),[]);
 useEffect(()=>{if(!notice.text||notice.persistent)return;const timer=window.setTimeout(clear,6000);return()=>window.clearTimeout(timer);},[notice,clear]);
 return {text:notice.text,show,clear};
}
