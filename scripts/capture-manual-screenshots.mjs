// Refresh the guide/reference GUI screenshots from a running current checkout.
// Calculated physics figures are separate; no screenshots are composited.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import init, { evaluate_json, evaluate_source_json } from '../src/wasm/mossa_core.js';
const args=process.argv.slice(2), option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const module=option('--playwright-module',null);
const {chromium}=await import(module?pathToFileURL(resolve(module)).href:'playwright');
const base=option('--base','http://127.0.0.1:5428/');
const sections=option('--section','workspace,almandine,source,xvbf,warning,comparison').split(',');
const themes=option('--theme','light,dark').split(',');
const data=resolve(root,'manual/public/tutorial-data');
const recordPath=resolve(root,'manual/src/assets/screenshots/capture-record.json');
const record=JSON.parse(await readFile(recordPath,'utf8'));
const refresh=record.manualRefresh??={records:[]};
const workspaceNames=new Set(['workspace-wide','workspace-laptop','workspace-tablet','first-fit','importing-raw-counts']);
const workspaceRefresh=record.workspaceRefresh??={records:[]};
refresh.sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
refresh.source=base;
refresh.wasmSha256=createHash('sha256').update(await readFile(resolve(root,'src/wasm/mossa_core_bg.wasm'))).digest('hex');
Object.assign(workspaceRefresh,{sourceCommit:refresh.sourceCommit,source:base,wasmSha256:refresh.wasmSha256,method:'Actual current Chromium UI in light and dark mode at desktop, laptop and tablet widths; synthetic first fit and measured raw-count import through the real controls. No compositing.'});
refresh.method='Actual current Chromium GUI in both themes. Public worked fits reopened; synthetic source generated with the production evaluator and explicitly labeled. Comparison results recomputed through the real UI (199 Gaussian simulations, seed 12345, one worker). No screenshot compositing.';
await init({module_or_path:await readFile(resolve(root,'src/wasm/mossa_core_bg.wasm'))});
const starting=JSON.parse(await readFile(resolve(data,'synthetic-first-fit.mossa'),'utf8'));
function syntheticSource(calibration) {
 const file=structuredClone(starting),p=file.project,site=p.sites[1];
 site.name='Synthetic singlet';site.kind='Singlet';
 for(const key of ['qs','bhf','a12','a13','mix'])site.params[key].fit=false;
 Object.assign(site.params.cs,{value:.23,fit:true});Object.assign(site.params.fwhm,{value:.097,fit:false});Object.assign(site.params.intensity,{value:.3,fit:true});
 p.sites=[site];p.mode='transmission';p.source_fwhm=.17;p.source_squared=false;
 p.background=[10000,-7,2].map(value=>({value,fit:true,min:null,max:null,link:null}));
 p.spectrum={x:Array.from({length:301},(_,i)=>-3+.02*i),y:Array(301).fill(10000)};
 p.spectrum.y=JSON.parse((calibration?evaluate_source_json:evaluate_json)(JSON.stringify(p))).y;
 file.name='Synthetic singlet reference';file.selected_site=0;file.fit=null;file.fit_state=null;
 file.provenance={purpose:'Noiseless GUI illustration, not measured data or independent validation',generator:calibration?'evaluate_source_json':'evaluate_json',absorberFwhm:.097,sourceFwhm:.17,center:.23,intensity:.3,background:[10000,-7,2]};
 return file;
}
const browser=await chromium.launch({headless:true});
try {
 for(const theme of themes) {
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,colorScheme:theme});
  const page=await context.newPage();page.setDefaultTimeout(20000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.waitForFunction(()=>{const button=document.querySelector('.fit-button');return button&&!button.disabled;});
  async function general() {const switcher=page.getByRole('button',{name:'Fitting options',exact:true});if(await switcher.isVisible())await switcher.click();const show=page.getByRole('button',{name:'Show fitting options',exact:true});if(await show.isVisible())await show.click();await page.getByRole('tab',{name:'General',exact:true}).click();await page.locator('.options-content').evaluate(n=>n.scrollTop=0);}
  async function open(file) {
   await close();
   await page.locator('input[aria-label="Project file"]').setInputFiles(typeof file==='string'?resolve(data,file):{name:'manual-synthetic-illustration.mossa',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});
   await page.waitForFunction(()=>document.querySelector('.status-current')?.textContent?.includes('Opened'));
   await page.locator('#spectrum-plot .total-model-curve').waitFor({state:'attached'});
   const expand=page.getByRole('button',{name:'Expand project sidebar',exact:true});if(await expand.isVisible())await expand.click();
   await general();
   const divider=page.getByRole('separator',{name:'Resize results pane',exact:true});if(await divider.isVisible()){await divider.press('Home');for(let i=0;i<4;i++)await divider.press('ArrowUp');}
  }
  async function number(label,value) {const input=page.getByRole('textbox',{name:label,exact:true});await input.click();await input.fill(String(value));await input.press('Enter');await input.press('Tab');await page.waitForTimeout(100);assert.equal(Number(await input.inputValue()),value,label+' committed value');}
  async function capture(name,description,details={}) {
   assert.deepEqual(errors,[]);assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
   await page.mouse.move(0,0);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);
   const extension=theme==='dark'||['workspace','importing-raw-counts','almandine-folding','comparison-no-extra-result','comparison-borderline-result'].includes(name)?'jpg':'png';
   const file=theme==='dark'?`manual/public/screenshots/dark/${name}.jpg`:name==='first-fit'?'manual/src/assets/first-fit.png':`manual/src/assets/screenshots/${name}.${extension}`;
   await page.screenshot({path:resolve(root,file),type:extension==='jpg'?'jpeg':'png',...(extension==='jpg'?{quality:92}:{})});
   const item={name,theme,file,description,details,capturedAt:new Date().toISOString(),viewport:page.viewportSize(),sha256:createHash('sha256').update(await readFile(resolve(root,file))).digest('hex'),spectrum:await page.locator('.document-bar strong').innerText(),status:await page.locator('.status-current').innerText(),dialogs:await page.locator('dialog[open] h2').allTextContents()};
   const bucket=workspaceNames.has(name)?workspaceRefresh:refresh;bucket.records=bucket.records.filter(old=>old.name!==name||old.theme!==theme);bucket.records.push(item);
   await writeFile(recordPath,JSON.stringify(record,null,2)+'\n');console.log(theme,name);
  }
  async function close() {for(let i=0;i<4&&await page.locator('dialog[open]').count();i++){const button=page.locator('dialog[open]').last().locator('button[aria-label^="Close"]').first();if(await button.count())await button.click();else await page.keyboard.press('Escape');await page.waitForTimeout(100);}assert.equal(await page.locator('dialog[open]').count(),0,'All dialogs closed');for(const button of await page.locator('.header-options.is-open .header-more-toggle').all()){await button.focus();await button.press('Escape');}}
  if(sections.includes('workspace')) {
   await open('synthetic-first-fit.mossa');
   await capture('workspace-wide','Wide workspace with the synthetic mixture, updated project/site lists and direct Fold spectrum control.');
   await page.getByRole('button',{name:'Collapse project sidebar',exact:true}).click();
   await page.setViewportSize({width:1180,height:900});await general();
   await capture('workspace-laptop','Laptop shared editor with Fitting options selected and the synthetic spectrum visible beside it.');
   await page.setViewportSize({width:820,height:1180});await general();
   await capture('workspace-tablet','Tall portrait tablet: live synthetic graph above General with Folding & calibration first.');
   await page.setViewportSize({width:1920,height:1080});
   await page.getByRole('button',{name:'Expand project sidebar',exact:true}).click();await general();
   await page.getByRole('button',{name:'Fit spectrum',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('.status-current')?.textContent?.includes('Converged'));
   await capture('first-fit','Actual completed fit of the built-in synthetic mixture, updated lists and results with approximate 1 std.');
   await page.getByRole('button',{name:'New project',exact:true}).click();
   await page.getByRole('heading',{name:'Start a new project',exact:true}).waitFor();
   await page.locator('input[aria-label="Spectrum file"]').setInputFiles(resolve(data,'freiburg/almandine.dat'));
   await page.waitForFunction(()=>document.querySelector('.status-current')?.textContent?.includes('Added'));
   await general();assert(await page.getByLabel('Fold spectrum',{exact:true}).isChecked());
   await capture('importing-raw-counts','Fresh measured almandine raw-count import with Fold spectrum enabled, loaded/folded point counts and immediate calibration controls; not a reference-calibration result.');
  }
  if(sections.includes('almandine')) {
   await open('freiburg/almandine.mossa');await page.locator('#model-teaching-almandine-model-2').click();
   await capture('workspace','Measured almandine, complete project browser and saved alternative fits in the current GUI.');
   await page.getByRole('tab',{name:'Bounds',exact:true}).click();
   await capture('bounds-and-links','Current Bounds tab with selected-site bounds and proportional-link controls; saved fit unchanged.');
   await page.getByRole('tab',{name:'Fit options',exact:true}).click();
   await capture('fit-options','Current Fit options tab: unweighted residuals, one current-model start and iteration limit from the almandine worked model.');
   await general();await page.getByRole('button',{name:'Edit preset…',exact:true}).click();
   await capture('calibration-preset','Current named velocity-calibration preset editor with velocity scale, folding and explicit save/cancel controls; no edits.');
   await close();await page.getByRole('button',{name:'Inspect this spectrum’s folding…',exact:true}).click();
   await page.waitForFunction(()=>!document.querySelector('input[aria-label="Inspected fold center"]')?.disabled);
   await number('Inspected fold center',256.5);
   await capture('almandine-folding','Folding diagnostic at the teaching manual center 256.5 with the independently computed automatic refinement retained; center changes apply immediately.');
   await close();await page.getByRole('button',{name:'Export',exact:true}).click();
   await page.locator('.export-action button').filter({hasText:'Figure'}).click();await page.locator('.figure-preview-svg > svg').waitFor();
   await capture('figure-export','Current almandine figure studio, real white-page preview and export controls.');await close();
   await page.getByRole('button',{name:'Compare models',exact:true}).click();
   await page.getByLabel('Simpler model',{exact:true}).selectOption('teaching-almandine-model-0');
   await page.getByLabel('Larger model',{exact:true}).selectOption('teaching-almandine-model-1');
   await page.locator('.comparison-plot svg path').first().waitFor({state:'attached'});
   await page.locator('.comparison-overview').evaluate(n=>n.scrollTop=n.scrollHeight);
   await capture('model-comparison','Actual comparison setup for one and two almandine doublets with identical constant-background constraints; no simulation run.');await close();
  }
  if(sections.includes('source')) {
   await open(syntheticSource(false));await page.getByRole('heading',{name:'Source profile',exact:true}).scrollIntoViewIfNeeded();await page.locator('.options-content').evaluate(n=>n.scrollTop=n.scrollHeight);
   await capture('transmission-overlays','Noiseless synthetic singlet in full-transmission mode; absorber width 0.097 and fixed Lorentzian source width 0.17 mm/s. Not measured data.');
   await open(syntheticSource(true));await page.getByRole('button',{name:'Calibrate source…',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'Source-profile calibration',exact:true});
   await dialog.locator('#source-calibration-plot .total-model-curve').waitFor({state:'attached'});
   await dialog.getByRole('button',{name:'Fit source reference',exact:true}).click();await dialog.locator('.calibration-values').waitFor({timeout:120000});await dialog.locator('.calibration-values').scrollIntoViewIfNeeded();
   await capture('source-calibration','Actual source calibration of the explicitly constructed noiseless reference; tiny residual/std reflect construction, not experimental precision.',{values:await dialog.locator('.calibration-values').innerText()});await close();
  }
  if(sections.includes('xvbf')) {
   await open('synthetic-first-fit.mossa');
   const selector=page.getByLabel('Selected site',{exact:true});if(await selector.isVisible())await selector.selectOption('1');else await page.locator('.site-select').nth(1).click();
   await page.getByRole('tab',{name:'xVBF',exact:true}).click();await page.getByLabel('Enable for selected site',{exact:true}).check();
   await page.getByRole('button',{name:'Add CS component',exact:true}).click();await page.locator('.xvbf-component-card').nth(1).waitFor();
   await capture('xvbf-distributions','Synthetic starting doublet enabled for xVBF, two CS components, normalized weights, current parameter cards and bounds controls; not fitted.');
   await page.getByRole('tab',{name:'Corr',exact:true}).click();await capture('xvbf-correlation','Current xVBF correlation view at its initial delta=0, with live synthetic spectrum and joint map.');
   await number('xVBF coupling',.35);await page.getByRole('button',{name:'Open joint CS–QS distribution',exact:true}).click();
   await page.getByRole('dialog',{name:'CS–QS correlation',exact:true}).waitFor();
   await capture('xvbf-map','Actual enlarged joint CS–QS density map at manually chosen delta=0.35; illustration, not a fitted correlation.');await close();
  }
  if(sections.includes('warning')) {
   const limited=structuredClone(starting);limited.project.max_iterations=1;limited.provenance={purpose:'Deliberate one-iteration warning on the unfitted synthetic starting model'};
   await open(limited);await page.getByRole('tab',{name:'Fit options',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'Maximum iterations',exact:true}).inputValue(),'1');
   await page.getByRole('button',{name:'Fit spectrum',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.status-current')?.textContent?.includes('Stopped'));
   await page.locator('.status-current .fit-warning-link').click();await page.getByRole('dialog',{name:'Fit warnings',exact:true}).waitFor();
   await capture('iteration-limit','Intentionally stopped one-iteration synthetic fit. Actual warning dialog opened from Status; Fit options iteration limit visible behind it.');await close();
  }
  if(sections.includes('comparison')) {
   for(const [example,name,expected] of [['absent','comparison-no-extra-result',.28],['weak','comparison-borderline-result',.04]]) {
    await open(`site-comparison/${example}.mossa`);await page.getByRole('button',{name:'Compare models',exact:true}).click();
    await page.getByLabel('Measurement noise',{exact:true}).selectOption('gaussian');await page.getByLabel('Simulated spectra',{exact:true}).selectOption('199');await page.getByLabel('Random seed',{exact:true}).fill('12345');await page.getByLabel('CPU workers',{exact:true}).selectOption('1');
    await page.getByRole('button',{name:'Run simulation test',exact:true}).click();await page.locator('.comparison-result').waitFor({timeout:180000});
    const pValue=page.locator('.comparison-result dl>div').filter({has:page.getByText('Simulation p-value',{exact:true})}).locator('dd');
    assert(Number.parseFloat(await pValue.innerText())===expected,`${example} seeded p-value`);
    await pValue.evaluate(n=>{const panel=n.closest('.comparison-controls');panel.scrollTop+=n.closest('div').getBoundingClientRect().top-panel.getBoundingClientRect().top-45;});
    await page.locator('.comparison-overview').evaluate(n=>n.scrollTop=n.scrollHeight);
    await capture(name,'Completed real Gaussian bootstrap: 199 simulations, seed 12345, one worker; exact teaching p-value '+expected+'.',{pValue:expected,simulations:199,seed:12345,workers:1});await close();
   }
  }
  await context.close();
 }
} finally {await browser.close();}
