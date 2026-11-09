import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { defaultFigureOptions, pngResolution, renderFigure } from '../src/figure';
import { demo } from '../src/demo';
import type { Evaluation } from '../src/types';
import type {FitSummary} from '../src/session';
import { figureTicks, legendSpace, intersects } from '../src/figure-layout';

function fixture() {
  const project = demo();
  project.spectrum = { x: [-2, -1, 0, 1, 2], y: [100, 92, 83, 94, 100] };
  const evaluation: Evaluation = { parameters: {}, y: [100, 91, 81, 91, 100], background: [100, 101, 102, 103, 104], components: [[0, 3, 6, 3, 0], [0, 7, 15, 9, 4]], residual: [0, 1, 2, 3, 0], sse: 14, objective: 14 };
  return { project, evaluation, options: defaultFigureOptions(project) };
}
function documentSvg(svg: string) { return new JSDOM(svg, { contentType: 'image/svg+xml' }).window.document; }
test('solid sites draw deepest first, retain their own names/colors, and include every observation', () => {
  const { project, evaluation, options } = fixture(), before = JSON.stringify({ project, evaluation });
  options.sites[1].name = '<Fe & "oxide">';
  const doc = documentSvg(renderFigure(project, evaluation, options, true));
  const paths = [...doc.querySelectorAll('path[data-site-fill]')];
  assert.deepEqual(paths.map(p => p.getAttribute('data-site-fill')), ['1', '0']);
  assert.equal(paths[0].getAttribute('fill'), options.sites[1].color);
  assert.ok(paths.every(p => p.getAttribute('d')!.endsWith('Z')));
  assert.ok(doc.documentElement.textContent!.includes('<Fe & "oxide">'));
  assert.equal(doc.querySelectorAll('[data-point="observed"]').length, 5);
  assert.equal(JSON.stringify({ project, evaluation }), before);
});
test('residual shares the spectrum scale, flips around its reference line, and has no separate axes or visible label', () => {
  const { project, evaluation, options } = fixture();
  const first = documentSvg(renderFigure(project, evaluation, options, false));
  options.sign = 'model-data';
  const flipped = documentSvg(renderFigure(project, evaluation, options, false));
  const y = (d: Document) => Number(d.querySelectorAll('[data-point="residual"]')[2].getAttribute('cy'));
  const zero = (d: Document) => Number(d.querySelector('[data-curve="residual-zero"]')!.getAttribute('y1'));
  assert.ok(Math.abs((y(first) - zero(first)) + (y(flipped) - zero(flipped))) < .002);
  const observed = first.querySelectorAll('[data-point="observed"]');
  const spectrumPixelsPerCount = (Number(observed[0].getAttribute('cy')) - Number(observed[1].getAttribute('cy'))) / (project.spectrum.y[0] - project.spectrum.y[1]);
  assert.ok(Math.abs((y(first) - zero(first)) / evaluation.residual[2] - spectrumPixelsPerCount) < .002);
  assert.equal(first.querySelector('#figure-residual'), null);
  assert.equal(first.querySelector('[data-curve="residual"]')!.getAttribute('clip-path'), 'url(#figure-main)');
  const visibleLabels = [...first.querySelectorAll('text')].map(t => t.textContent).join(' ');
  assert.doesNotMatch(visibleLabels, /residual|data\s*[−-]\s*model|model\s*[−-]\s*data/i);
  assert.ok([...first.querySelectorAll('[data-point="residual"]')].every(p => Number(p.getAttribute('cy')) > Math.max(...[...observed].map(p => Number(p.getAttribute('cy'))))));
  options.residual = 'above';
  const above = documentSvg(renderFigure(project, evaluation, options, false));
  const spectrumTop = Math.min(...[...above.querySelectorAll('[data-point="observed"]')].map(p => Number(p.getAttribute('cy'))));
  assert.ok([...above.querySelectorAll('[data-point="residual"]')].every(p => Number(p.getAttribute('cy')) < spectrumTop));
  options.residual = 'none';
  const hidden = documentSvg(renderFigure(project, evaluation, options, false));
  assert.equal(hidden.querySelectorAll('[data-point="residual"]').length, 0);
  assert.equal(hidden.querySelector('[data-curve="residual-zero"]'), null);
});
test('large signed and flat residuals fit inside the shared axes above or below', () => {
  const { project, evaluation, options } = fixture();
  for (const residual of [[-200, 0, 300, -500, 100], [0, 0, 0, 0, 0]]) {
    evaluation.residual = residual;
    for (const position of ['above', 'below'] as const) {
      options.residual = position;
      const doc = documentSvg(renderFigure(project, evaluation, options, true));
      const clip = doc.querySelector('#figure-main rect')!, top = Number(clip.getAttribute('y')), bottom = top + Number(clip.getAttribute('height'));
      for (const point of doc.querySelectorAll('[data-point]')) {
        const y = Number(point.getAttribute('cy')); assert.ok(Number.isFinite(y) && y > top && y < bottom);
      }
    }
  }
});
test('legend uses the supplied names without automatically adding site types', () => {
  const { project, evaluation, options } = fixture(); options.sites[0].name = 'Iron'; options.sites[1].name = 'Oxide · doublet';
  const labels = () => [...documentSvg(renderFigure(project, evaluation, options, true)).querySelectorAll('text')].map(t => t.textContent);
  assert.ok(labels().includes('Iron')); assert.ok(!labels().includes('Iron · sextet'));
  assert.ok(labels().includes('Oxide · doublet'));
  assert.ok(!labels().some(t => t?.includes('doublet · doublet')));
  assert.deepEqual(demo().sites.map(s => s.name), ['α-Fe', 'Fe²⁺']);
});
test('custom layer order, hidden sites, and view range affect the exported figure only', () => {
  const { project, evaluation, options } = fixture();
  options.order = 'custom'; options.range = [-1, 1]; options.sites[0].visible = false;
  const doc = documentSvg(renderFigure(project, evaluation, options, true));
  assert.equal(doc.querySelectorAll('[data-site-index]').length, 1);
  assert.equal(doc.querySelectorAll('[data-point="observed"]').length, 3);
  assert.equal(doc.querySelector('[data-site-index]')!.getAttribute('data-site-index'), '1');
  assert.equal(project.sites.length, 2);
});
test('transmission export identifies scaled absorber overlays and preserves the actual total model', () => {
  const { project, evaluation, options } = fixture();
  const thin = documentSvg(renderFigure(project, evaluation, options, true));
  project.mode = 'transmission'; options.legend = 'none';
  const doc = documentSvg(renderFigure(project, evaluation, options, true));
  assert.ok(doc.documentElement.textContent!.includes('not additive transmission components'));
  assert.deepEqual(JSON.parse(doc.querySelector('metadata')!.textContent!).componentScale, .8 * (100000 - 83) / 21);
  assert.ok(thin.querySelector('[data-curve="model"]'));
  assert.ok(doc.querySelector('[data-curve="model"]'));
});
test('undersized layouts and empty velocity selections fail with actionable messages', () => {
  const { project, evaluation, options } = fixture();
  options.range = [50, 60]; assert.throws(() => renderFigure(project, evaluation, options, true), /two data points/);
  options.range = null; options.height = NaN; assert.throws(() => renderFigure(project, evaluation, options, true), /height/);
});
test('PNG metadata records the selected print density and leaves image chunks intact', async () => {
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=', 'base64');
  const result = Buffer.from(await (await pngResolution(new Blob([image]), 600)).arrayBuffer());
  const location = result.indexOf('pHYs');
  assert.equal(result.readUInt32BE(location + 4), Math.round(600 / .0254));
  assert.equal(result.readUInt32BE(location + 8), Math.round(600 / .0254));
  assert.equal(result[location + 12], 1);
  const imageChunk = (buffer: Buffer) => { const start = buffer.indexOf('IDAT'); return buffer.subarray(start, start + 4 + buffer.readUInt32BE(start - 4)); };
  assert.deepEqual(imageChunk(result), imageChunk(image));
});

test('LaTeX legends use self-contained paths, retain source metadata and a fixed ink color in either theme', () => {
  const { project, evaluation, options } = fixture();
  options.sites[0].name = 'High-spin Fe$^{3+}$';
  options.sites[1].name = '$d_{x^2-y^2}$';
  for (const legend of ['below', 'right'] as const) {
    options.legend = legend;
    const doc = documentSvg(renderFigure(project, evaluation, options, true));
    const labels = [...doc.querySelectorAll('[data-scientific-label]')];
    assert.ok(labels.some(label => label.getAttribute('aria-label') === options.sites[0].name));
    const maths = doc.querySelectorAll('[data-scientific-label] svg');
    assert.equal(maths.length, 2);
    assert.ok([...maths].every(svg => svg.querySelector('path')));
    assert.equal(doc.querySelector('g[color]')?.getAttribute('color'), '#30343a');
    assert.equal(doc.querySelectorAll('use, foreignObject, image').length, 0);
    const metadata = JSON.parse(doc.querySelector('metadata')!.textContent!);
    assert.equal(metadata.options.sites[1].name, options.sites[1].name);
    const name = labels.find(label => label.getAttribute('aria-label') === options.sites[0].name)!;
    const text = name.querySelector('text')!, math = name.querySelector('svg')!;
    assert.ok(Math.abs(Number(math.getAttribute('x')) - Number(text.getAttribute('x')) - Number(text.getAttribute('textLength'))) < 1e-8);
  }
});

test('journal and presentation axes have readable major labels, intermediate ticks, and a complete box', () => {
  const { project, evaluation, options } = fixture();
  project.spectrum.x = [-10, -5, 0, 5, 10];
  for (const [width, height] of [[90, 90], [180, 120], [240, 135]]) {
    options.width = width; options.height = height;
    const doc = documentSvg(renderFigure(project, evaluation, options, true));
    assert.ok(doc.querySelectorAll('[data-tick="x-major"]').length >= 5);
    assert.ok(doc.querySelectorAll('[data-tick="x-minor"]').length > doc.querySelectorAll('[data-tick="x-major"]').length);
    assert.ok(doc.querySelectorAll('[data-tick="y-minor"]').length > 0);
    assert.ok(doc.querySelector('[data-axes-box]'));
  }
  for (const [lo, hi] of [[-.0031, .0017], [1e8, 1.01e8], [-10, 10]]) {
    const ticks = figureTicks(lo, hi, 400);
    assert.ok(ticks.minor.every(v => v >= lo && v <= hi));
    assert.ok(ticks.minor.every(v => !ticks.values.some(major => Math.abs(major - v) < ticks.step * 1e-8)));
  }
});
test('legend defaults to site colors only and data/fit entries are explicitly optional', () => {
  const { project, evaluation, options } = fixture();
  const names = () => [...documentSvg(renderFigure(project, evaluation, options, true)).querySelectorAll('[data-figure-legend] [data-scientific-label]')].map(e => e.getAttribute('aria-label'));
  assert.deepEqual(names().sort(), project.sites.map(s => s.name).sort());
  options.legendDataFit = true;
  assert.ok(names().includes('Data')); assert.ok(names().includes('Fit'));
});
test('auto legend occupies clear space and moves above if the legend is too large for the interior', () => {
  const { project, evaluation, options } = fixture();
  project.spectrum.y.fill(95); evaluation.y.fill(95); evaluation.background.fill(100); evaluation.components.forEach(c => c.fill(0)); evaluation.residual.fill(0);
  const doc = documentSvg(renderFigure(project, evaluation, options, true));
  const legend = doc.querySelector('[data-figure-legend]')!;
  assert.equal(legend.getAttribute('data-figure-legend'), 'auto');
  const box = { x: Number(legend.getAttribute('data-x')), y: Number(legend.getAttribute('data-y')), width: Number(legend.getAttribute('data-width')), height: Number(legend.getAttribute('data-height')) };
  for (const point of doc.querySelectorAll('[data-point]')) assert.ok(!intersects(box, { x: Number(point.getAttribute('cx')) - 2, y: Number(point.getAttribute('cy')) - 2, width: 4, height: 4 }));
  options.sites = Array.from({ length: 16 }, (_, index) => ({ ...options.sites[0], index, name: `Site ${index + 1}` }));
  project.sites = options.sites.map(s => ({ ...project.sites[0], name: s.name }));
  evaluation.components = options.sites.map(() => [0, 0, 0, 0, 0]);
  assert.equal(documentSvg(renderFigure(project, evaluation, options, true)).querySelector('[data-figure-legend]')!.getAttribute('data-figure-legend'), 'above');
  assert.equal(legendSpace({ x: 0, y: 0, width: 100, height: 100 }, 30, 30, [{ x: 0, y: 0, width: 100, height: 100 }]), null);
});
test('title is centered over the axes and explicit inside and above legends remain available', () => {
  const { project, evaluation, options } = fixture(); options.title = 'Iron spectrum';
  for (const position of ['above', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
    options.legend = position;
    const doc = documentSvg(renderFigure(project, evaluation, options, true));
    const title = doc.querySelector('[data-figure-title]')!, axes = doc.querySelector('[data-axes-box]')!;
    assert.equal(title.getAttribute('text-anchor'), 'middle');
    assert.equal(Number(title.getAttribute('x')), Number(axes.getAttribute('x')) + Number(axes.getAttribute('width')) / 2);
    assert.equal(doc.querySelector('[data-figure-legend]')!.getAttribute('data-figure-legend'), position);
  }
});

test('optional legend fractions use resolved intensities and all sites, preserve math, and never mutate the model', () => {
 const {project,evaluation,options}=fixture();
 options.order='custom';options.legend='above';options.sites[0].name='\\alpha_{Fe}';
 project.sites[0].params.intensity.value=1;project.sites[1].params.intensity.link={target:'site:0:intensity',factor:3};
 evaluation.parameters['site:1:intensity']=3;
 const before=JSON.stringify({project,evaluation});
 assert.equal(options.legendFractions,false);
 assert.doesNotMatch(documentSvg(renderFigure(project,evaluation,options,true)).querySelector('[data-figure-legend]')!.textContent!,/%/);
 options.legendFractions=true;
 let doc=documentSvg(renderFigure(project,evaluation,options,true));
 const labels=()=>[...doc.querySelectorAll('[data-scientific-label]')].map(label=>label.getAttribute('aria-label'));
 assert.deepEqual(labels(),['\\alpha_{Fe} · 25.0 (—)%','Fe²⁺ · 75.0 (—)%']);
 assert.ok(doc.querySelector('[data-scientific-label] svg path'));
 assert.match(doc.querySelector('metadata')!.textContent!,/intensity fractions of all model sites/);
 options.sites[1].visible=false;doc=documentSvg(renderFigure(project,evaluation,options,true));
 assert.deepEqual(labels(),['\\alpha_{Fe} · 25.0 (—)%']);
 assert.equal(JSON.stringify({project,evaluation}),before);
 project.sites[0].params.intensity.value=0;evaluation.parameters['site:1:intensity']=0;
 assert.match(documentSvg(renderFigure(project,evaluation,options,true)).querySelector('[data-scientific-label]')!.getAttribute('aria-label')!,/—%/);
});

test('legend markers center against first-line label extents for plain and tall math labels in every placement',()=>{
 const {project,evaluation,options}=fixture();options.order='custom';options.legendDataFit=true;
 options.sites[0].name='Plain';options.sites[1].name='$\\frac{a_1}{b^2}$';
 for(const legend of ['above','below','right','top-left','top-right','bottom-left','bottom-right'] as const){
  options.legend=legend;
  const doc=documentSvg(renderFigure(project,evaluation,options,true));
  for(const item of doc.querySelectorAll('[data-legend-item]')){
   const center=Number(item.getAttribute('data-marker-center')),label=item.querySelector('[data-scientific-label]')!;
   const first=label.firstElementChild!;
   if(first.tagName==='svg')assert.ok(Math.abs(Number(first.getAttribute('y'))+Number(first.getAttribute('height'))/2-center)<.002);
   else assert.ok(Math.abs(Number(first.getAttribute('y'))-3.3-center)<.002);
  }
 }
});

test('unfitted legend percentages are visibly qualified and tiny positive fractions retain their significance',()=>{
 const {project,evaluation,options}=fixture();options.legendFractions=true;project.sites[0].params.intensity.value=.0001;project.sites[1].params.intensity.value=100;
 const doc=documentSvg(renderFigure(project,evaluation,options,false));
 assert.match([...doc.querySelectorAll('text')].map(node=>node.textContent).join(' '),/unfitted starting parameters/);
 assert.ok([...doc.querySelectorAll('[data-scientific-label]')].some(node=>/0.0001%/.test(node.getAttribute('aria-label')!)));
});

test('transparent fills retain opaque outlines, and outlines-only has no fill or closing baseline',()=>{
 const {project,evaluation,options}=fixture();options.style='transparent';
 let doc=documentSvg(renderFigure(project,evaluation,options,true));
 assert.equal(doc.querySelectorAll('[data-site-fill][fill-opacity="0.22"]').length,2);
 for(const curve of doc.querySelectorAll('[data-site-index]')){assert.equal(curve.getAttribute('fill'),'none');assert.equal(curve.hasAttribute('opacity'),false);assert.ok(!curve.getAttribute('d')!.endsWith('Z'));}
 options.style='lines';doc=documentSvg(renderFigure(project,evaluation,options,true));assert.equal(doc.querySelectorAll('[data-site-fill]').length,0);assert.equal(doc.querySelectorAll('[data-site-index]').length,2);
});

test('chosen transparency affects fills only and rejects invalid percentages',()=>{
 const {project,evaluation,options}=fixture();options.style='transparent';
 for(const opacity of [0,.35,1]){options.fillOpacity=opacity;const doc=documentSvg(renderFigure(project,evaluation,options,true));assert.ok([...doc.querySelectorAll('[data-site-fill]')].every(node=>Number(node.getAttribute('fill-opacity'))===opacity));assert.ok([...doc.querySelectorAll('[data-site-index]')].every(node=>!node.hasAttribute('opacity')&&!node.hasAttribute('stroke-opacity')));}
 options.fillOpacity=NaN;assert.throws(()=>renderFigure(project,evaluation,options,true),/transparency/);
});


test('legend fractions carry fitted std in parentheses through layouts and omit stale errors for unfitted models',()=>{
 const {project,evaluation,options}=fixture();options.legendFractions=true;options.order='custom';
 project.sites[0].params.intensity.value=1;project.sites[1].params.intensity.value=3;
 const result={intensity_fractions:[{value:25,error:.25},{value:75,error:0}]} as FitSummary;
 const before=JSON.stringify({project,evaluation,result});
 for(const legend of ['auto','above','below','right','top-left'] as const){
  options.legend=legend;
  const doc=documentSvg(renderFigure(project,evaluation,options,true,result));
  assert.deepEqual([...doc.querySelectorAll('[data-scientific-label]')].map(n=>n.getAttribute('aria-label')),['α-Fe · 25.00(25)%','Fe²⁺ · 75(0)%']);
  assert.match(doc.querySelector('metadata')!.textContent!,/approximate 1 std in the last quoted digits/);
 }
 options.sites[1].visible=false;
 let doc=documentSvg(renderFigure(project,evaluation,options,true,result));
 assert.equal(doc.querySelector('[data-scientific-label]')!.getAttribute('aria-label'),'α-Fe · 25.00(25)%');
 doc=documentSvg(renderFigure(project,evaluation,options,false,result));
 assert.equal(doc.querySelector('[data-scientific-label]')!.getAttribute('aria-label'),'α-Fe · 25.0%');
 assert.equal(JSON.stringify({project,evaluation,result}),before);
});
