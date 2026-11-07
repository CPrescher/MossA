// Canonical vector source: a stylized six-line absorption spectrum on navy.
// Run with a supported Node version to regenerate SVG, PNG, macOS, and Windows assets.
import {writeFileSync,mkdirSync,mkdtempSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const peaks=[[-.78,1],[-.46,.62],[-.145,.43],[.145,.43],[.46,.62],[.78,1]];
const points=Array.from({length:641},(_,i)=>{const x=-1+i/320,y=peaks.reduce((sum,[center,depth])=>sum+depth*Math.exp(-.5*((x-center)/.043)**2),0);return `${i?'L':'M'}${(512+320*x).toFixed(2)},${(332+348*y).toFixed(2)}`;}).join(' ');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><filter id="shadow" x="-15%" y="-15%" width="130%" height="140%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#071529" flood-opacity=".22"/></filter></defs><rect x="64" y="64" width="896" height="896" rx="200" fill="#213b5b" filter="url(#shadow)"/><rect x="65" y="65" width="894" height="894" rx="199" fill="none" stroke="#829cb7" stroke-opacity=".22" stroke-width="2"/><path d="${points}" fill="none" stroke="#f4f7fc" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`;
writeFileSync(new URL('../src-tauri/icons/icon.svg',import.meta.url),svg);
writeFileSync(new URL('../manual/public/favicon.svg',import.meta.url),svg);
mkdirSync(new URL('../public/',import.meta.url),{recursive:true});
writeFileSync(new URL('../public/icon.svg',import.meta.url),svg);

const root=fileURLToPath(new URL('../',import.meta.url));
const temp=mkdtempSync(join(tmpdir(),'mossa-icons-'));
try {
  for(const [folder,args] of [['all',[]],['small',['--png','64']]]) {
    const output=join(temp,folder);
    const result=spawnSync(process.execPath,[join(root,'scripts/tauri.mjs'),'icon',join(root,'src-tauri/icons/icon.svg'),'--output',output,...args],{cwd:root,stdio:'pipe'});
    if(result.status!==0)throw new Error(result.stderr.toString()||'Icon generation failed');
  }
  for(const name of ['32x32.png','128x128.png','128x128@2x.png','icon.png','icon.icns','icon.ico'])copyFileSync(join(temp,'all',name),join(root,'src-tauri/icons',name));
  copyFileSync(join(temp,'small','64x64.png'),join(root,'src-tauri/icons/64x64.png'));
  console.log('Generated the MossA navy spectrum icon for the app, browser, and manual.');
} finally {rmSync(temp,{recursive:true,force:true});}
