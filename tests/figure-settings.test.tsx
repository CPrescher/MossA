import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demo} from '../src/demo';
import {defaultFigureSettings,rememberFigureSettings,restoreFigureSettings} from '../src/figure-settings';

test('repeat export retains this model’s layout, format, precision, and explicit site overrides',()=>{
 const project=demo(),settings=defaultFigureSettings(project,'Sample · Model 1');
 settings.options={...settings.options,width:90,height:90,legend:'right',legendFractions:true,title:'Iron sites',range:[-2,2],sites:settings.options.sites.map((site,index)=>({...site,...(index===0?{name:'Fe$^{3+}$',color:'#112233',visible:false}:{})})).reverse()};
 settings.format='png';settings.dpi=600;settings.filename='custom publication';
 const restored=restoreFigureSettings(rememberFigureSettings(settings,project,'Sample · Model 1'),structuredClone(project),'Sample · Model 1');
 assert.equal(restored.options.width,90);assert.equal(restored.options.legend,'right');assert.equal(restored.options.legendFractions,true);assert.equal(restored.format,'png');assert.equal(restored.dpi,600);assert.equal(restored.filename,'custom publication');assert.deepEqual(restored.options.range,[-2,2],'the explicitly selected export range persists');assert.equal(restored.options.sites[1].name,'Fe$^{3+}$');assert.equal(restored.options.sites[1].visible,false);
 assert.equal(defaultFigureSettings(project,'Other model').options.legendFractions,false,'new models retain independent defaults');
});

test('unmodified names/colors follow model edits while explicit export overrides survive refitting',()=>{
 const project=demo(),settings=defaultFigureSettings(project,'Sample · Original');settings.options.sites[1].name='Custom';settings.options.sites[1].color='#112233';
 const remembered=rememberFigureSettings(settings,project,'Sample · Original'),changed=structuredClone(project);changed.sites[0].name='New site name';changed.sites[0].color='#336699';changed.sites[1].name='Renamed second site';
 const restored=restoreFigureSettings(remembered,changed,'Sample · Renamed');assert.equal(restored.options.sites[0].name,'New site name');assert.equal(restored.options.sites[0].color,'#336699');assert.equal(restored.options.sites[1].name,'Custom');assert.equal(restored.options.sites[1].color,'#112233');assert.match(restored.filename,/Renamed/);
});

test('adding/removing a site conservatively refreshes per-site export overrides without transferring them to another site',()=>{
 const project=demo(),settings=defaultFigureSettings(project,'Sample');settings.options.legendFractions=true;settings.options.sites[0].visible=false;settings.options.sites[0].name='Do not transfer';
 let remembered=rememberFigureSettings(settings,project,'Sample');const fewer=structuredClone(project);fewer.sites.shift();remembered=restoreFigureSettings(remembered,fewer,'Sample',false);assert.equal(remembered.options.sites[0].name,fewer.sites[0].name);assert.equal(remembered.options.sites[0].visible,true);assert.equal(remembered.sitesRefreshed,true);assert.equal(remembered.options.legendFractions,true);
 const added=structuredClone(project);const next=restoreFigureSettings(remembered,added,'Sample');assert.equal(next.options.sites.length,2);assert.ok(next.options.sites.every(site=>site.visible));
});

test('a known append preserves overrides, but an ambiguous Undo with duplicate names cannot transfer them',()=>{
 const project=demo(),settings=defaultFigureSettings(project,'Sample');settings.options.sites[0].name='Custom export';settings.options.sites[0].visible=false;
 const saved=rememberFigureSettings(settings,project,'Sample');const appended={...project,sites:[...project.sites,structuredClone(project.sites[0])]};
 const restored=restoreFigureSettings(saved,appended,'Sample');assert.equal(restored.options.sites[0].name,'Custom export');assert.equal(restored.options.sites[0].visible,false);assert.equal(restored.options.sites[2].visible,true);assert.ok(!restored.sitesRefreshed);
 const duplicate=demo();duplicate.sites[1].name=duplicate.sites[0].name;const remaining={...duplicate,sites:[structuredClone(duplicate.sites[1])]};const override=defaultFigureSettings(remaining,'Sample');override.options.sites[0].name='Second site override';
 const undo=restoreFigureSettings(rememberFigureSettings(override,remaining,'Sample'),duplicate,'Sample');assert.ok(undo.sitesRefreshed);assert.equal(undo.options.sites[0].name,duplicate.sites[0].name);
});

test('durable settings strip runtime references, hydrate overrides, and reject malformed optional data',async()=>{
 const {storeFigureSettings,hydrateFigureSettings,decodeFigureSettings}=await import('../src/figure-settings');
 const project=demo(),settings=defaultFigureSettings(project,'Sample');settings.format='pdf';settings.options.style='transparent';settings.options.fillOpacity=.35;settings.options.range=[-2,2];settings.options.sites[0].name='Custom';
 const saved=storeFigureSettings(rememberFigureSettings(settings,project,'Sample'));
 assert.ok(!JSON.stringify(saved).includes('params'));const decoded=decodeFigureSettings(JSON.parse(JSON.stringify(saved)),project)!;assert.deepEqual(decoded,saved);
 const hydrated=hydrateFigureSettings(decoded,project,'Sample')!;assert.equal(hydrated.sourceSites[0].site,project.sites[0]);assert.equal(hydrated.options.sites[0].name,'Custom');
 for(const mutate of [(s:typeof saved)=>{s.options.sites[1].index=0},(s:typeof saved)=>{s.options.range=[9,-9]},(s:typeof saved)=>{s.options.sites[0].color='url(https://bad)'},(s:typeof saved)=>{s.dpi=100000},(s:typeof saved)=>{s.sourceSites.pop()}]){const bad=structuredClone(saved);mutate(bad);assert.equal(decodeFigureSettings(bad,project),undefined);}
 assert.equal(decodeFigureSettings(undefined,project),undefined);
});

test('EPS format survives project serialization and restoration',async()=>{
 const {storeFigureSettings,hydrateFigureSettings,decodeFigureSettings}=await import('../src/figure-settings');
 const project=demo(),settings=defaultFigureSettings(project,'Sample');settings.format='eps';
 const saved=JSON.parse(JSON.stringify(storeFigureSettings(rememberFigureSettings(settings,project,'Sample'))));
 const restored=hydrateFigureSettings(decodeFigureSettings(saved,project),project,'Sample');
 assert.equal(restored?.format,'eps');
});
