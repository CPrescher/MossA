import { useState } from 'react';
import { Numeric } from './Numeric';
import { niceTicks, formatTick } from './axes.mjs';
import { addDistribution, editDistribution, enableXvbf, removeDistribution } from './xvbf';
import { formatResult, formatStd, uncertainty } from './results';
import type { FitSummary } from './session';
import type { DistributionComponent, Project, Site, Xvbf } from './types';

function DistributionPlot({components,label}:{components:DistributionComponent[];label:string}) {
  const lo=Math.min(...components.map(c=>c.center.value-2*Math.max(c.width.value,.01))),hi=Math.max(...components.map(c=>c.center.value+2*Math.max(c.width.value,.01)));
  const xs=Array.from({length:161},(_,i)=>lo+(hi-lo)*i/160);
  const curves=components.map(c=>xs.map(x=>c.width.value>0?c.weight.value*.8326/(c.width.value/2*1.7725)*Math.exp(-(((x-c.center.value)/(c.width.value/2)*.8326)**2)):0));
  const sum=xs.map((_,i)=>curves.reduce((s,c)=>s+c[i],0)),height=Math.max(...sum,1e-6),xx=(x:number)=>12+216*(x-lo)/(hi-lo),yy=(y:number)=>63-53*y/height;
  const path=(ys:number[])=>ys.map((y,i)=>`${i?'L':'M'}${xx(xs[i])},${yy(y)}`).join(' '),ticks=niceTicks(lo,hi,4);
  return <svg className="xvbf-distribution-plot" viewBox="0 0 240 85" role="img" aria-label={`${label} distribution`}><title>{`${label} distribution; Gaussian components follow the original MossA width convention`}</title><line x1="12" x2="228" y1="63" y2="63" stroke="#a0aab2"/>{curves.map((y,i)=>components[i].width.value>0?<path key={i} d={path(y)} fill="none" stroke="#78aaa5" strokeWidth="1"/>:components[i].weight.value>0?<line key={i} x1={xx(components[i].center.value)} x2={xx(components[i].center.value)} y1="10" y2="63" stroke="#78aaa5"/>:null)}<path d={path(sum)} fill="none" stroke="currentColor" strokeWidth="1.5"/>{ticks.values.map((x:number)=><text key={x} x={xx(x)} y="78" textAnchor="middle" fontSize="9" fill="currentColor">{formatTick(x,ticks.step)}</text>)}</svg>;
}
export function XvbfEditor({project,selected,result,onSite}:{project:Project;selected:number;result:FitSummary|null;onSite:(site:Site)=>void}) {
  const site=project.sites[selected],model=site?.xvbf;
  const [error,setError]=useState('');
  const act=(change:()=>Site)=>{try{onSite(change());setError('');}catch(e){setError(String(e));}};
  const change=(x:Xvbf)=>({...site,xvbf:x});
  function std(id:string,scale=1) {const e=uncertainty(project,result,id);return e.state==='fixed'?'fixed':`± ${formatStd(e.error==null?null:e.error*scale)}`;}
  function cell(axis:'cs'|'qs',index:number,key:keyof DistributionComponent,component:DistributionComponent) {
    const p=component[key],id=`site:${selected}:${axis==='cs'?'csd':'qsd'}:${index}:${key}`,scale=key==='weight'?100:1,label=`${axis.toUpperCase()} ${index+1} ${key}`;
    return <div className="xvbf-cell" key={key}><div><Numeric label={label} value={p.value*scale} disabled={key==='weight'&&model![axis].length===1} onChange={v=>act(()=>change(editDistribution(model!,axis,index,key,{value:v!/scale})))}/><input type="checkbox" aria-label={`Fit ${label}`} checked={p.fit} disabled={key==='weight'&&model![axis].length===1} onChange={e=>act(()=>change(editDistribution(model!,axis,index,key,{fit:e.target.checked})))}/></div><small title={key==='weight' ? `${uncertainty(project,result,id).reason} Displayed in percentage points.` : uncertainty(project,result,id).reason}>{std(id,key==='weight'?100:1)}</small></div>;
  }
  return <section className="option-section xvbf-editor"><h3>Extended Voigt-based fitting</h3>{!site?<p className="xvbf-note">Select a site.</p>:<>
    <label className="check-label"><input type="checkbox" checked={!!model} disabled={!model&&(site.kind!=='Doublet'||site.profile!=='Lorentzian')} onChange={e=>act(()=>{if(e.target.checked)return enableXvbf(site);const {xvbf:_old,...normal}=site;return normal;})}/>xVBF for {site.name}</label>
    {!model&&<p className="xvbf-note">Available for Lorentzian doublets.</p>}
    {model&&<>
      <div className="param-row"><label title="Correlation between CS and QS broadening; −1 to 1">Coupling δ</label><Numeric label="xVBF coupling" value={model.delta.value} onChange={v=>act(()=>change({...model,delta:{...model.delta,value:v!}}))}/><input type="checkbox" aria-label="Fit xVBF coupling" checked={model.delta.fit} onChange={e=>act(()=>change({...model,delta:{...model.delta,fit:e.target.checked}}))}/></div><div className="xvbf-coupling-std">{std(`site:${selected}:delta`)}</div>
      {(['cs','qs'] as const).map(axis=><section className="xvbf-axis" key={axis}><div className="section-heading"><h3>{axis==='cs'?'Center-shift':'Quadrupole-splitting'} distribution</h3><button type="button" aria-label={`Add ${axis.toUpperCase()} component`} title="Split a component weight and add a Gaussian" disabled={model[axis].length>=8} onClick={()=>act(()=>change(addDistribution(model,axis)))}>+</button></div>
        <DistributionPlot components={model[axis]} label={axis.toUpperCase()}/>
        <div className="xvbf-column-labels"><span>{axis.toUpperCase()} mm/s</span><span title="Legacy MossA width parameter used by voigt_curve.m">Width mm/s</span><span>Weight %</span></div>
        {model[axis].map((c,index)=><div className="xvbf-component" key={index}><div className="xvbf-component-heading"><span>{axis.toUpperCase()} {index+1}</span><button type="button" className="xvbf-delete" aria-label={`Delete ${axis.toUpperCase()} component ${index+1}`} disabled={model[axis].length===1} onClick={()=>act(()=>change(removeDistribution(model,axis,index)))}><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg></button></div><div className="xvbf-row">{(['center','width','weight'] as const).map(key=>cell(axis,index,key,c))}</div>
          <details className="xvbf-bounds"><summary>Bounds</summary>{(['center','width','weight'] as const).map(key=><div className="xvbf-bound-row" key={key}><label>{key}</label>{(['min','max'] as const).map(bound=><Numeric key={bound} label={`${axis.toUpperCase()} ${index+1} ${key} ${bound}`} value={c[key][bound]===null?null:c[key][bound]!*(key==='weight'?100:1)} nullable onChange={v=>act(()=>change(editDistribution(model,axis,index,key,{[bound]:v===null?null:v/(key==='weight'?100:1)})))}/>)}</div>)}</details>
        </div>)}<p className="xvbf-total">Total {formatResult(model[axis].reduce((sum,c)=>sum+c.weight.value,0)*100)}%</p>
      </section>)}
      <details className="xvbf-notes"><summary>Model notes</summary><p>Weights in each distribution sum to 100%. One weight is dependent. Checked fields vary; fixed weights remain fixed.</p><p>A single symmetric doublet cannot identify both widths and coupling independently. The initial QS width is held fixed.</p><p>Widths preserve the original MossA Voigt parameter convention. They are not conventional spectral FWHMs. The Lorentzian parameter is fixed at 0.194 mm/s.</p></details>
    </>}
  </>}{error&&<p role="alert" className="calibration-error">{error}</p>}</section>;
}
