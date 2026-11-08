import {defaultFigureOptions,figureFilename,type FigureOptions} from './figure';
import {siteColor,type Project} from './types';
export type FigureSettings={options:FigureOptions;format:'svg'|'png'|'pdf'|'eps';dpi:number;filename:string};
export type RememberedFigureSettings=FigureSettings&{sourceName:string;sourceSites:{name:string;color:string;site:Project['sites'][number]}[];sitesRefreshed?:boolean};
export function defaultFigureSettings(project:Project,name:string):FigureSettings {
 return {options:defaultFigureOptions(project),format:'svg',dpi:300,filename:figureFilename(name)};
}
export function rememberFigureSettings(settings:FigureSettings,project:Project,name:string):RememberedFigureSettings {
 return {...settings,sourceName:name,sourceSites:project.sites.map((site,index)=>({name:site.name,color:siteColor(site,index),site}))};
}
/** Known appended sites retain existing overrides. Removals or ambiguous
 * topology changes refresh site options rather than relabeling another site. */
export function restoreFigureSettings(saved:RememberedFigureSettings|undefined,project:Project,name:string,resetRange=false):RememberedFigureSettings {
 if(!saved)return rememberFigureSettings(defaultFigureSettings(project,name),project,name);
 const defaults=defaultFigureOptions(project),changed=saved.sourceSites.length!==project.sites.length;
 const appended=project.sites.length>saved.sourceSites.length&&saved.sourceSites.every((source,index)=>source.site===project.sites[index]);
 const resetSites=changed&&!appended;
 const sites=resetSites?defaults.sites:saved.options.sites.map(site=>{
  const old=saved.sourceSites[site.index],current=defaults.sites[site.index];
  return {...site,name:site.name===old.name?current.name:site.name,color:site.color===old.color?current.color:site.color};
 }).concat(appended?defaults.sites.slice(saved.sourceSites.length):[]);
 const settings={...saved,filename:saved.filename===figureFilename(saved.sourceName)?figureFilename(name):saved.filename,options:{...saved.options,sites,range:resetRange?null:saved.options.range}};
 return {...rememberFigureSettings(settings,project,name),sitesRefreshed:resetSites||saved.sitesRefreshed};
}

/** Portable appearance data: no scientific parameters or runtime object references. */
export type StoredFigureSettings=FigureSettings&{version:1;sourceName:string;sourceSites:{name:string;color:string}[]};
export function storeFigureSettings(saved:RememberedFigureSettings):StoredFigureSettings {
 return {version:1,options:saved.options,format:saved.format,dpi:saved.dpi,filename:saved.filename,sourceName:saved.sourceName,sourceSites:saved.sourceSites.map(({name,color})=>({name,color}))};
}
export function hydrateFigureSettings(saved:StoredFigureSettings|undefined,project:Project,name:string):RememberedFigureSettings|undefined {
 if(!saved)return;
 const remembered={...saved,sourceSites:saved.sourceSites.map((source,index)=>({...source,site:project.sites[index]}))};
 return restoreFigureSettings(remembered,project,name);
}
/** Invalid optional appearance data never prevents a scientific project opening. */
export function decodeFigureSettings(value:unknown,project:Project):StoredFigureSettings|undefined {
 try {
  const s=value as StoredFigureSettings,o=s.options;
  const text=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max;
  const color=(v:unknown)=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
  if(s.version!==1||!['svg','png','pdf','eps'].includes(s.format)||![300,600].includes(s.dpi)||!text(s.filename,240)||!text(s.sourceName,2100))return;
  if(!o||!Number.isFinite(o.width)||o.width<70||o.width>300||!Number.isFinite(o.height)||o.height<60||o.height>300||!text(o.title,100))return;
  if(!['filled','transparent','lines'].includes(o.style)||!['depth','custom'].includes(o.order)||!['above','below','none'].includes(o.residual)||!['data-model','model-data'].includes(o.sign)||!['auto','above','below','right','top-left','top-right','bottom-left','bottom-right','none'].includes(o.legend))return;
  const fillOpacity=o.fillOpacity??.22;if(!Number.isFinite(fillOpacity)||fillOpacity<0||fillOpacity>1)return;
  if(typeof o.legendDataFit!=='boolean'||typeof o.legendFractions!=='boolean')return;
  if(o.range!==null&&(!Array.isArray(o.range)||o.range.length!==2||!o.range.every(Number.isFinite)||o.range[0]>=o.range[1]||project.spectrum.x.filter(x=>x>=o.range![0]&&x<=o.range![1]).length<2))return;
  if(!Array.isArray(s.sourceSites)||s.sourceSites.length!==project.sites.length||!s.sourceSites.every(v=>v&&text(v.name,1000)&&color(v.color)))return;
  if(!Array.isArray(o.sites)||o.sites.length!==project.sites.length||new Set(o.sites.map(v=>v.index)).size!==o.sites.length||!o.sites.every(v=>v&&Number.isInteger(v.index)&&v.index>=0&&v.index<project.sites.length&&text(v.name,1000)&&color(v.color)&&typeof v.visible==='boolean'))return;
  // Explicit reconstruction strips unknown keys, including obsolete runtime references.
  return {version:1,format:s.format,dpi:s.dpi,filename:s.filename,sourceName:s.sourceName,sourceSites:s.sourceSites.map(({name,color})=>({name,color})),options:{width:o.width,height:o.height,title:o.title,style:o.style,fillOpacity,order:o.order,residual:o.residual,sign:o.sign,legend:o.legend,legendDataFit:o.legendDataFit,legendFractions:o.legendFractions,range:o.range,sites:o.sites.map(({index,name,color,visible})=>({index,name,color,visible}))}};
 }catch{return;}
}
