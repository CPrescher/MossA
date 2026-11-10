import { renderFigure, type FigureOptions } from './figure';
import { plainScientificLabel } from './plain-label';
import { textWidth } from './scientific-label';
import { formatParenthetical, formatResult, intensityFractions, parameterAt, parameterValue, uncertainty } from './results';
import type { Calibration, FitSummary } from './session';
import { keys, type Evaluation, type Project } from './types';

export type FitReportInput = {
  project: Project; evaluation: Evaluation; result: FitSummary; options: FigureOptions;
  projectName: string; spectrumName: string; modelName: string; application: string;
  calibration?: Calibration; velocityReversed?: boolean; createdAt?: Date;
};
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
// Coordinates and font sizes are in mm; use the same Arial metrics as the graph.
function wrap(value: string, width: number, size = 2.7): string[] {
  if(value.includes('\n'))return value.split('\n').flatMap(line=>wrap(line,width,size));
  const lines: string[] = [];
  for(const word of value.replace(/\s+/g,' ').trim().split(' ')) {
    if(lines.length && textWidth(`${lines.at(-1)} ${word}`,size)<=width) { lines[lines.length-1] += ` ${word}`; continue; }
    let rest='';
    for(const char of word) {
      if(rest && textWidth(rest+char,size)>width){lines.push(rest);rest='';}
      rest+=char;
    }
    if(rest)lines.push(rest);
  }
  return lines.length ? lines : [''];
}
const text = (x:number,y:number,value:string,size=2.7,bold=false,color='#18212b') => `<text x="${x}" y="${y}" font-size="${size}"${bold?' font-weight="bold"':''} fill="${color}">${escape(value)}</text>`;
const rule = (y:number) => `<line x1="12" y1="${y}" x2="198" y2="${y}" stroke="#cbd2d8" stroke-width="0.2"/>`;
type Row = {cells:string[];color?:string};

/** Exact preview pages; graph and text remain vectors in the PDF. */
export function renderFitReport(input: FitReportInput): string[] {
  const {project,evaluation,result,options} = input;
  if(!result)throw new Error('Fit the current model before exporting a report.');
  const pages:string[][] = [[]]; let y=17;
  const add = (svg:string) => pages.at(-1)!.push(svg);
  const context = `${input.spectrumName} · ${input.modelName}`;
  function newPage() { pages.push([]); y=17; paragraph(`${context} · continued`,3.1,true); y+=3; }
  function ensure(height:number) { if(y+height>280)newPage(); }
  function paragraph(value:string,size=2.7,bold=false) {
    const lines=wrap(value,186,size);
    if(lines.length*size*1.45<=220)ensure(lines.length*size*1.45);
    for(const line of lines) { ensure(size*1.45);add(text(12,y,line,size,bold));y+=size*1.45; }
  }
  function table(title:string,headers:string[],widths:number[],rows:Row[]) {
    const headerLines=headers.map((header,i)=>wrap(header,widths[i]-3,2.65*1.08));
    const headerHeight=Math.max(...headerLines.map(lines=>lines.length))*3.6;
    const heading=()=>{paragraph(title,3.3,true);y+=1;let x=12;
      headerLines.forEach((lines,i)=>{lines.forEach((line,j)=>add(text(x+1.5,y+j*3.6,line,2.65,true)));x+=widths[i];});y+=headerHeight-1.6;add(rule(y));y+=4;};
    const firstRowHeight=rows.length?Math.max(...rows[0].cells.map((cell,i)=>wrap(cell,widths[i]-(i===0&&rows[0].color?6:3),2.65).length))*3.6+1.8:0;
    ensure(Math.min(220,Math.max(20,firstRowHeight+headerHeight+11)));heading();
    for(const [rowIndex,row] of rows.entries()) {
      const lines=row.cells.map((cell,i)=>wrap(cell,widths[i]-(i===0&&row.color?6:3),2.65));
      const count=Math.max(...lines.map(v=>v.length)),rowHeight=count*3.6+1.8;
      if(y+rowHeight>280&&rowHeight<=220){newPage();heading();}
      for(let start=0;start<count;) {
        if(y+5>280){newPage();heading();}
        const take=Math.min(count-start,Math.max(1,Math.floor((278-y)/3.6)));
        let x=12;
        add(`<g data-report-table="${escape(title)}" data-report-row="${rowIndex}">`);
        row.cells.forEach((_,i)=>{if(i===0&&row.color)add(`<rect x="${x+1}" y="${y-2.5}" width="2.1" height="2.1" fill="${row.color}"/>`);
          lines[i].slice(start,start+take).forEach((line,j)=>add(text(x+(i===0&&row.color?5:1.5),y+j*3.6,line,2.65)));x+=widths[i];});
        add('</g>');
        y+=take*3.6+1.8;add(rule(y-3.4));start+=take;
      }
    }
    y+=4;
  }
  const value = (id:string,n:number) => {
    const u=uncertainty(project,result,id),f=formatParenthetical(n,u.error);
    return `${f.value}${u.state==='fixed'?' fixed':u.error===null?' (—)':f.suffix}${parameterAt(project,id)?.link?' *':''}`;
  };
  const siteName=(i:number)=>`${i+1}. ${plainScientificLabel(options.sites.find(s=>s.index===i)?.name??project.sites[i].name)}`;
  const color=(i:number)=>options.sites.find(s=>s.index===i)?.color;
  paragraph('Mössbauer fit report',4.8,true);y+=1;
  paragraph(input.projectName,3.1);paragraph(context,3.1,true);
  paragraph(`${result.converged?'Converged':'Stopped'} · ${result.iterations} iterations · ${project.mode==='thin'?'Thin absorber':'Full transmission'} · ${project.weighting==='counts'?'Count weighting':'Unweighted'}`);
  y+=2;
  // Preserve the chosen graph aspect ratio, within the standard portrait page.
  const scale=Math.min(186/options.width,132/options.height),width=options.width*scale,height=options.height*scale;
  ensure(height);
  const graph=renderFigure(project,evaluation,options,true,result).replace(/^<\?xml[^>]*>\s*/, '').replace('<svg ',`<svg x="${12+(186-width)/2}" y="${y}" `).replace(/width="[^"]+" height="[^"]+"/,`width="${width}" height="${height}"`);
  add(graph);y+=height+6;
  const fractions=intensityFractions(project,evaluation,result);
  const columns=[{key:'fraction',label:'Fraction\n(%)',width:19}, {key:'cs',label:'CS\n(mm/s)',width:19},{key:'fwhm',label:'FWHM\n(mm/s)',width:19},{key:'intensity',label:'Intensity\n(raw)',width:21},{key:'qs',label:'QS\n(mm/s)',width:19},{key:'bhf',label:'BHF\n(T)',width:19},{key:'a12',label:'A12',width:13},{key:'a13',label:'A13',width:13},{key:'mix',label:'Lorentz\nmix',width:19}]
    .filter(c=>c.key==='fraction'||project.sites.some(s=>keys(s).includes(c.key)||!!s.xvbf&&['cs','qs'].includes(c.key)));
  const cells=(i:number,k:string)=>{
    if(k==='fraction'){const f=fractions[i],v=formatParenthetical(f.value,f.error);return `${v.value}${f.value===null?'':f.error===null?' (—)':v.suffix}`;}
    const s=project.sites[i];return keys(s).includes(k)||!!s.xvbf&&['cs','qs'].includes(k)?value(`site:${i}:${k}`,parameterValue(project,evaluation,i,k)):'—';
  };
  if(project.sites.length) {
    const nameWidth=columns.length>8?32:36,totalWidth=columns.reduce((sum,c)=>sum+c.width,0);
    table('Site parameters',['Site / profile',...columns.map(c=>c.label)],[nameWidth,...columns.map(c=>(186-nameWidth)*c.width/totalWidth)],project.sites.map((site,i)=>({color:color(i),cells:[`${siteName(i)}\n${site.xvbf?'xVBF':`${site.kind} · ${site.profile}`}`,...columns.map(c=>cells(i,c.key))]})));
    paragraph('Parentheses: approximate 1 std in the last quoted digits; (—): std unavailable; fixed: held fixed.');
    paragraph(project.mode==='transmission'?'Fractions are absorber-intensity fractions, not phase abundances.':'Fractions are normalized site intensities, not phase abundances.');
    if(options.sites.some(s=>!s.visible))paragraph('The table includes all model sites, including sites hidden in the graph.');
    y+=3;
  } else paragraph('Background-only model; no sites.',3.3,true);
  const details:Row[]=[];
  project.background.forEach((p,i)=>details.push({cells:[`Background b${i}`,value(`bkg:${i}`,evaluation.parameters[`bkg:${i}`]??p.value)]}));
  project.sites.forEach((site,i)=>{
    if(site.xvbf) {
      details.push({cells:[`${siteName(i)} · coupling delta`,value(`site:${i}:delta`,site.xvbf.delta.value)]});
      for(const axis of ['cs','qs'] as const)site.xvbf[axis].forEach((component,j)=>{
        for(const key of ['center','width','weight'] as const) {
          const id=`site:${i}:${axis==='cs'?'csd':'qsd'}:${j}:${key}`;
          details.push({cells:[`${siteName(i)} · ${axis.toUpperCase()} distribution ${j+1} ${key}${key==='weight'?'':' (mm/s)'}`,value(id,evaluation.parameters[id]??component[key].value)]});
        }
      });
    }
  });
  table('Background and distribution parameters',['Parameter','Value'],[126,60],details);
  const ids=[...project.background.map((_,i)=>`bkg:${i}`),...project.sites.flatMap((site,i)=>[...keys(site).map(k=>`site:${i}:${k}`),...(site.xvbf?['delta',...(['cs','qs'] as const).flatMap(axis=>site.xvbf![axis].flatMap((_,j)=>['center','width','weight'].map(k=>`${axis==='cs'?'csd':'qsd'}:${j}:${k}`)))].map(k=>`site:${i}:${k}`):[])])];
  for(const id of ids) {const link=parameterAt(project,id)?.link;if(link)paragraph(`* Link: ${id} = ${formatResult(link.factor)} × ${link.target}`);}
  y+=2;ensure(15);paragraph('Fit details',3.3,true);
  paragraph(`${result.termination.replace(/([a-z])([A-Z])/g,'$1 $2')} · Free parameters: ${result.free_parameters} · Rank: ${result.rank} · Degrees of freedom: ${result.dof}`);
  paragraph(`${project.weighting==='counts'?'Reduced weighted objective':'Reduced sum of squares'}: ${formatResult(result.reduced_objective)} · SSE: ${formatResult(evaluation.sse)}`);
  if(result.search)paragraph(`Multistart: best start ${result.search.best_start} of ${result.search.completed} completed (${result.search.requested} requested).`);
  paragraph(`Graph residual: ${options.residual==='none'?'hidden':`${options.sign==='data-model'?'data - model':'model - data'}, ${options.residual}`}. Velocity range: ${options.range?options.range.join(' to '):`${project.spectrum.x[0]} to ${project.spectrum.x.at(-1)}`} mm/s.`);
  if(project.mode==='transmission') {
    paragraph(project.source_gaussians?'Source: Gaussian mixture (component widths below).':`Source: ${project.source_squared?'Lorentz-squared':'Lorentzian'}; source FWHM: ${formatResult(project.source_fwhm)} mm/s.`);
    project.source_gaussians?.forEach((g,i)=>paragraph(`Source Gaussian ${i+1}: center ${formatResult(g.center)} mm/s; FWHM ${formatResult(g.fwhm)} mm/s; weight ${formatResult(g.weight)}.`));
  }
  if(input.calibration) {const c=input.calibration;paragraph(`Channel calibration: maximum velocity ${formatResult(c.max)} mm/s; shift ${formatResult(c.shift)} mm/s; ${c.sinusoidal?'sinusoidal':'linear'} scale; ${c.folding?`folded at channel ${formatResult(c.center)}`:'unfolded'}.`);}
  if(input.velocityReversed)paragraph('Velocity axis reversed after calibration.');
  if(result.warnings.length){y+=3;ensure(15);paragraph('Fit warnings',3.3,true);result.warnings.forEach(w=>paragraph(w));}
  const date=(input.createdAt??new Date()).toLocaleString('en-US',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'});
  return pages.map((body,i)=>`<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297" font-family="Arial, Helvetica, sans-serif"><title>${escape(`${context} · Fit report`)}</title><rect width="210" height="297" fill="white"/><g font-family="Arial, Helvetica, sans-serif">${body.join('')}${rule(285)}${text(12,290,`${input.application} · ${date}`,2.3,false,'#52606d')}${text(180,290,`${i+1} / ${pages.length}`,2.3,false,'#52606d')}</g></svg>`);
}
