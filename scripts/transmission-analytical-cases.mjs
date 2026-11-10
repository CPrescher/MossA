import {readFileSync} from 'node:fs';
export function transmissionAnalyticalCases(evaluate){
 const cases=['transmission-performance.json','transmission-measured-performance.json'].flatMap(f=>JSON.parse(readFileSync('tests/fixtures/'+f)).cases).filter(c=>c.project.mode==='transmission'&&!c.calibration&&c.project.sites.every(s=>!s.xvbf)).map(c=>({id:c.id,project:structuredClone(c.project)}));
 const copy=id=>structuredClone(cases.find(c=>c.id===id));
 const thick=copy('singlet-lorentzian-source');thick.id='strong-absorption';thick.project.sites[0].params.intensity.value=12.;
 thick.project.spectrum.y=evaluate(thick.project).y.map((v,i)=>v+.1*Math.sin(1.73*i));thick.project.sites[0].params.intensity.value=10.;thick.project.sites[0].params.fwhm.value*=1.1;cases.push(thick);
 const background=copy('singlet-squared-source');background.id='background-only';background.project.sites=[];cases.push(background);
 const cross=copy('linked-parameters');cross.id='background-cross-link';
 cross.project.background[1].fit=true;cross.project.background[1].value=.3;cross.project.sites[0].params.cs.link={target:'bkg:1',factor:-.5};
 cross.project.spectrum.y=evaluate(cross.project).y.map((v,i)=>v+.2*Math.sin(i*1.31));cross.project.background[1].value=.31;cases.push(cross);
 const edge=copy('singlet-lorentzian-source');edge.id='transmission-grid-edges';
 edge.project.spectrum.x=[-30,-29.999,-29.993,-29.99,...edge.project.spectrum.x,29.99,29.993,29.999,30];edge.project.spectrum.y=Array(edge.project.spectrum.x.length).fill(20000);
 edge.project.spectrum.y=evaluate(edge.project).y.map((v,i)=>v+.1*Math.sin(i*1.79));edge.project.sites[0].params.cs.value+=.02;cases.push(edge);
 return cases;
}
