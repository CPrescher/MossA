// Capture the actual GUI; no recoloring, overlays, or fitted-data edits.
// Run against this checkout's dev server. Supply an installed Playwright module.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const args=process.argv.slice(2), option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const module=option('--playwright-module',null);
const {chromium}=await import(module?pathToFileURL(resolve(module)).href:'playwright');
const base=option('--base','http://127.0.0.1:5428/');
const groups=option('--tutorial','almandine,sms,syncmoss').split(',');
const themes=option('--theme','light,dark').split(',');
const data=resolve(root,'manual/public/tutorial-data');
const recordPath=resolve(root,'manual/src/assets/screenshots/capture-record.json');
const record=JSON.parse(await readFile(recordPath,'utf8'));
const refresh=record.tutorialRefresh??={records:[]};
refresh.sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
refresh.source=base;
refresh.method='Actual Chromium UI in light and dark mode. Worked fits reopened without optimization; velocity/source dialogs refitted through their real controls. No screenshot compositing.';
const extensions={};
for(const slug of ['almandine','sms','syncmoss']) {
 const text=await readFile(resolve(root,`manual/src/content/docs/tutorials/${slug}.md`),'utf8');
 for(const match of text.matchAll(/assets\/screenshots\/([^/]+)\.(png|jpg)/g)) extensions[match[1]]=match[2];
}
const browser=await chromium.launch({headless:true});
try {
 for(const theme of themes) {
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,colorScheme:theme});
  const page=await context.newPage();page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(()=>!document.querySelector('.fit-button')?.disabled);
  async function openProject(file) {
   await page.locator('input[aria-label="Project file"]').setInputFiles(resolve(data,file));
   await page.waitForFunction(()=>document.querySelector('.status-current')?.textContent?.includes('Opened'));
   await page.locator('#spectrum-plot .total-model-curve').waitFor({state:'attached'});
   const expand=page.getByRole('button',{name:'Expand project sidebar',exact:true});
   if(await expand.isVisible())await expand.click();
   await general();
   const divider=page.getByRole('separator',{name:'Resize results pane',exact:true});
   if(await divider.isVisible()){await divider.press('Home');for(let i=0;i<4;i++)await divider.press('ArrowUp');}
  }
  async function general() {
   const switcher=page.getByRole('button',{name:'Fitting options',exact:true});
   if(await switcher.isVisible())await switcher.click();
   const show=page.getByRole('button',{name:'Show fitting options',exact:true});
   if(await show.isVisible())await show.click();
   await page.getByRole('tab',{name:'General',exact:true}).click();
   await page.locator('.options-content').evaluate(n=>n.scrollTop=0);
  }
  async function model(id) {
   await page.locator(`#model-${id}`).click();
   await page.locator('#spectrum-plot .total-model-curve').waitFor({state:'attached'});
   await page.waitForTimeout(150);
  }
  async function spectrum(id) {
   await page.locator(`#spectrum-${id}`).click();
   await page.locator('#spectrum-plot .total-model-curve').waitFor({state:'attached'});
   await page.waitForTimeout(150);
  }
  async function capture(name,description) {
   assert.deepEqual(errors,[],'Browser errors before '+name);
   const values=page.locator('dialog[open] .calibration-values').last();
   if(await values.count())await values.scrollIntoViewIfNeeded();
   await page.evaluate(()=>document.fonts.ready);
   await page.mouse.move(0,0);
   await page.waitForTimeout(200);
   const extension=theme==='dark'?'jpg':extensions[name]??'png';
   const file=theme==='dark'?`manual/public/screenshots/dark/${name}.jpg`:`manual/src/assets/screenshots/${name}.${extension}`;
   await page.screenshot({path:resolve(root,file),type:extension==='jpg'?'jpeg':'png',...(extension==='jpg'?{quality:92}:{})});
   const bytes=await readFile(resolve(root,file));
   const item={name,theme,file,description,capturedAt:new Date().toISOString(),viewport:page.viewportSize(),sha256:createHash('sha256').update(bytes).digest('hex'),spectrum:await page.locator('.document-bar strong').innerText(),status:await page.locator('.status-current').innerText(),dialogs:await page.locator('dialog[open] h2').allTextContents()};
   refresh.records=refresh.records.filter(old=>old.name!==name||old.theme!==theme);refresh.records.push(item);
   await writeFile(recordPath,JSON.stringify(record,null,2)+'\n');
   console.log(theme,name);
  }
  async function closeDialogs() {
   for(let i=0;i<4&&await page.locator('dialog[open]').count();i++)await page.keyboard.press('Escape');
  }
  async function number(label,value) {
   const input=page.getByRole('textbox',{name:label,exact:true});
   await input.fill(String(value));await input.press('Enter');await input.press('Tab');
  }
  async function calibrationLocations(prefix) {
   await general();
   await page.getByRole('button',{name:'Add calibration preset',exact:true}).click();
   await page.getByRole('button',{name:/From reference file/}).waitFor();
   await capture(`${prefix}-velocity-location-wide`,'General in the right Fitting options panel; + menu exposes From reference file for velocity-scale calibration.');
   await page.keyboard.press('Escape');
   await page.getByRole('button',{name:'Collapse project sidebar',exact:true}).click();
   await page.setViewportSize({width:1180,height:900});await page.waitForTimeout(250);
   await general();
   await page.getByRole('button',{name:'Add calibration preset',exact:true}).click();
   await capture(`${prefix}-velocity-location-laptop`,'Laptop shared editor with Fitting options and General selected; + menu exposes From reference file.');
   await page.keyboard.press('Escape');
   await page.setViewportSize({width:1920,height:1080});await page.waitForTimeout(250);
   await page.getByRole('button',{name:'Expand project sidebar',exact:true}).click();
  }
  async function velocity(file,{max,sinusoidal,automatic,center},name) {
   await general();
   await page.getByRole('button',{name:'Add calibration preset',exact:true}).click();
   await page.getByRole('button',{name:/From reference file/}).click();
   const dialog=page.getByRole('dialog',{name:'Velocity calibration',exact:true});
   await dialog.locator('input[aria-label="Reference spectrum file"]').setInputFiles(resolve(data,file));
   await number('Reference initial maximum velocity',max);
   await dialog.getByLabel('Sinusoidal drive',{exact:true}).setChecked(sinusoidal);
   await dialog.getByLabel('Fold reference channels',{exact:true}).check();
   await dialog.getByLabel('Automatic fold center',{exact:true}).setChecked(automatic);
   if(!automatic)await number('Reference fold center',center);
   await dialog.getByRole('button',{name:'Fit reference',exact:true}).click();
   await dialog.locator('.calibration-values').waitFor({timeout:120000});
   const values=await dialog.locator('.calibration-values').innerText();
   await capture(name,`Fresh velocity-reference fit through GUI; ${values}`);
   await closeDialogs();
  }
  if(groups.includes('almandine')) {
   await openProject('freiburg/almandine.mossa');
   await model('teaching-almandine-model-0');
   await calibrationLocations('almandine');
   await velocity('freiburg/almandine-iron-foil.dat',{max:5,sinusoidal:false,automatic:false,center:256.5},'almandine-calibration');
   await general();await capture('almandine-one-doublet','Reopened one-doublet constant-background worked fit; no refitting.');
   await model('teaching-almandine-model-2');await capture('almandine-two-doublets','Reopened two-doublet linear-background worked fit; no refitting.');
  }
  if(groups.includes('sms')) {
   await openProject('sms/sms-worked.mossa');
   await calibrationLocations('sms');
   await velocity('sms/Iron foil calibration.txt',{max:8,sinusoidal:true,automatic:true},'sms-velocity-calibration');
   const doc=JSON.parse(await readFile(resolve(data,'sms/sms-worked.mossa'),'utf8'));
   for(const [index,name] of [[1,'sms-source-before'],[2,'sms-source-after']]) {
    await spectrum(doc.workspace.spectra[index].id);await general();
    await page.getByRole('button',{name:'Calibrate source…',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Source-profile calibration',exact:true});
    await dialog.locator('#source-calibration-plot .total-model-curve').waitFor();
    if(index===1) {
     await dialog.locator('details.import-details').evaluate(n=>n.open=true);
     await capture('sms-reference-columns','Saved five-column singlet reference; actual Import details names velocity column 1 and total counts column 2.');
     await dialog.locator('details.import-details').evaluate(n=>n.open=false);
    }
    await dialog.getByRole('button',{name:'Fit source reference',exact:true}).click();
    await dialog.locator('.calibration-values').waitFor({timeout:120000});
    await capture(name,'Fresh known-width singlet source calibration; '+await dialog.locator('.calibration-values').innerText());
    await closeDialogs();
   }
   await spectrum(doc.workspace.spectra[0].id);await general();
   await page.locator('details.import-details').evaluate(n=>n.open=true);
   await page.locator('details.import-details').scrollIntoViewIfNeeded();
   await capture('sms-reversed-axis','Saved raw SPEC MCA sample with Reverse velocity axis checked and original acquisition header expanded.');
   await page.locator('details.import-details').evaluate(n=>n.open=false);
   for(const [stage,name] of [[1,'sms-two-sextets'],[2,'sms-two-sextets-qs'],[3,'sms-three-sextets'],[5,'sms-final-fit']]) {
    await model(`sms-stage-${stage}`);await general();await capture(name,'Saved SMS tutorial stage '+stage+' with current GUI, residuals and fitted parameter table; no refitting.');
   }
   await model('sms-stage-4');
   await page.getByRole('tab',{name:'Bounds',exact:true}).click();
   await page.getByLabel('Editing site',{exact:true}).selectOption('2');
   await page.getByLabel('Link target',{exact:true}).selectOption('intensity');
   await page.getByLabel('Link source',{exact:true}).selectOption('site:0:intensity');
   await number('Link factor',1/3);
   await page.locator('.link-list').scrollIntoViewIfNeeded();
   await capture('sms-intensity-links','Existing site-3 intensity link to one third of site 1; target/source/factor controls selected for inspection, not applied.');
   // The import screenshot precedes reversal and model fitting in the tutorial.
   await openProject('sms/sms-start.mossa');
   await page.locator('details.import-details').evaluate(n=>n.open=true);
   await page.locator('details.import-details').scrollIntoViewIfNeeded();
   await capture('sms-mca-import','Unfitted tutorial start, original raw MCA and headers; Reverse velocity axis still off.');
  }
  if(groups.includes('syncmoss')) {
   await closeDialogs();
   await page.getByRole('button',{name:'New project',exact:true}).click();
   await page.getByRole('heading',{name:'Start a new project',exact:true}).waitFor();
   await page.locator('input[aria-label="Spectrum file"]').setInputFiles(resolve(data,'syncmoss/Standard_CMS.dat'));
   await page.waitForFunction(()=>document.querySelector('.status-current')?.textContent?.includes('Added'));
   await page.locator('#spectrum-plot .total-model-curve').waitFor({state:'attached'});await general();
   await capture('syncmoss-import','Actual original CMS file imported into an empty project; no fitted sites and supplied velocity axis retained.');
   await openProject('syncmoss/syncmoss-worked.mossa');
   const doc=JSON.parse(await readFile(resolve(data,'syncmoss/syncmoss-worked.mossa'),'utf8'));
   await spectrum(doc.workspace.spectra[0].id);
   for(const [id,name] of [['sync-cms-0','syncmoss-cms-lorentzian'],['sync-cms-1','syncmoss-cms-pseudovoigt']]) {
    await model(id);await general();await capture(name,'Reopened measured CMS empirical model; saved fit and std retained.');
   }
   await spectrum(doc.workspace.spectra[1].id);await model('sync-sms-0');await general();
   await page.getByRole('heading',{name:'Source profile',exact:true}).scrollIntoViewIfNeeded();
   await page.locator('.options-content').evaluate(n=>n.scrollTop=n.scrollHeight);
   await capture('syncmoss-sms-gaussian','Saved measured SMS fit with supplied three-Gaussian source controls visible.');
   await page.getByRole('tab',{name:'Fit options',exact:true}).click();
   await capture('syncmoss-weighting','Observed-count weighting, one current-model start and iteration limit for the saved SMS model.');
   await model('sync-sms-1');await general();
   await page.getByRole('heading',{name:'Source profile',exact:true}).scrollIntoViewIfNeeded();
   await page.locator('.options-content').evaluate(n=>n.scrollTop=n.scrollHeight);
   await capture('syncmoss-sms-squared','Saved deliberate 0.200 mm/s Lorentzian-squared source control; no refitting.');
   await model('sync-sms-0');await general();
   await capture('syncmoss-workspace','Current GUI with original CMS/SMS spectra and saved model alternatives in expanded project browser.');
   await page.getByRole('button',{name:'Export',exact:true}).click();
   await page.locator('.export-action button').filter({hasText:'Figure'}).click();
   await page.locator('.figure-preview-svg svg').waitFor();
   await capture('syncmoss-export','Actual current figure studio with saved SMS model, white-page preview, current export controls.');
   await closeDialogs();
  }
  await context.close();
 }
} finally {await browser.close();}
