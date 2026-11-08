import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { scientificLabel, layoutLabel, svgLabelLine } from '../src/scientific-label';
import { plainScientificLabel } from '../src/plain-label';
import { ScientificLabel } from '../src/ScientificLabel';
import { SiteNameEditor } from '../src/SiteNameEditor';
import { SiteList } from '../src/site-list';
import { ResultsTable } from '../src/ResultsTable';
import { demo } from '../src/demo';
import { createProjectFile, openProjectFile } from '../src/projectFile';

test('charge, Greek, spin and orbital labels support mixed text and bare TeX', () => {
  for (const source of ['Fe$^{2+}$', 'Fe$^{3+}$', '$\\alpha$-Fe', 'High-spin Fe$^{2+}$', '$d_{xy}$', '$d_{x^2-y^2}$', '\\mathrm{Fe}^{3+}', 'd_{xy}', '\\(\\alpha\\)-Fe', '$\\frac{1}{2}$']) {
    const label = scientificLabel(source);
    assert.equal(label.error, undefined, source);
    const math = label.parts.filter(part => part.kind === 'math');
    assert.ok(math.length, source);
    for (const part of math) {
      assert.ok(part.svg.includes('<path'), source);
      assert.ok(part.width > 0 && part.ascent > 0, source);
      assert.doesNotMatch(part.svg, /<use|<image|<foreignObject|href=/, source);
    }
  }
  assert.deepEqual(scientificLabel('Ordinary site_1').parts, [{ kind: 'text', source: 'Ordinary site_1' }]);
});

test('unfinished, invalid and unsafe input remains readable text', () => {
  for (const name of ['Fe$^{2+}', '$\\badcommand$', '$\\frac{1}{$', '$\\href{javascript:alert(1)}{Fe}$', '$\\require{html}$', '$\\class{hidden}{Fe}$', 'x'.repeat(513)]) {
    const label = scientificLabel(name);
    assert.ok(label.error, name);
    assert.deepEqual(label.parts, [{ kind: 'text', source: name }]);
  }
  const name = '<img src=x onerror="alert(1)"> Fe$^{3+}$';
  const dom = new JSDOM(renderToStaticMarkup(<ScientificLabel name={name}/>));
  assert.equal(dom.window.document.querySelector('img'), null);
  assert.equal(dom.window.document.querySelector('[onerror]'), null);
  assert.equal(dom.window.document.querySelector('.scientific-label')?.getAttribute('aria-label'), plainScientificLabel(name));
});

test('figure label wrapping preserves complete math and fits its allotted width', () => {
  const attached = layoutLabel('High-spin Fe$^{3+}$', 75);
  const chargeLine = attached.find(line => line.parts.some(({ part }) => part.kind === 'math'))!;
  assert.ok(chargeLine.parts.some(({ part }) => part.kind === 'text' && part.source === 'Fe'));
  const name = 'High-spin $\\mathrm{Fe}^{3+}$ with $d_{x^2-y^2}$ orbitals';
  for (const width of [35, 100, 200]) {
    const lines = layoutLabel(name, width);
    assert.ok(lines.every(line => line.width <= width + 1e-8));
    const maths = lines.flatMap(line => line.parts).filter(({ part }) => part.kind === 'math');
    assert.equal(maths.length, 2);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">${lines.map((line, i) => svgLabelLine(line, 0, 20 + i * 25)).join('')}</svg>`;
    const doc = new JSDOM(svg, { contentType: 'image/svg+xml' }).window.document;
    assert.equal(doc.querySelectorAll('svg svg').length, 2);
    assert.equal(doc.querySelectorAll('foreignObject, use, image').length, 0);
  }
});

test('site list and results table render the same label; project files retain the editable source', async () => {
  const project = demo(), name = 'High-spin Fe$^{3+}$'; project.sites[0].name = name;
  const list = renderToStaticMarkup(<SiteList sites={project.sites} selected={0} disabled={false} onSelect={() => {}} onDelete={() => {}}/>);
  const table = renderToStaticMarkup(<ResultsTable project={project} evaluation={null} result={null} selected={0} onSelect={() => {}}/>);
  for (const html of [list, table]) {
    const doc = new JSDOM(html).window.document;
    assert.equal(doc.querySelector('.scientific-label')?.getAttribute('aria-label'), plainScientificLabel(name));
    assert.ok(doc.querySelector('.scientific-label svg path'));
  }
  const cal = { max: 10, shift: 0, folding: false, sinusoidal: false, center: 256.5 };
  const file = await createProjectFile({ project, cal, raw: null, filename: 'Test', selected: 0 }, {});
  const restored = await openProjectFile(JSON.parse(JSON.stringify(file)), cal, 'Test', async () => ({ parameters: {}, y: project.spectrum.y, background: project.spectrum.y, components: [], residual: [], sse: 0, objective: 0 }));
  assert.equal(restored.snapshot.project.sites[0].name, name);
});

test('name editor keeps the panel compact, applies once on Enter/blur and restores on Escape', async () => {
  const dom = new JSDOM('<div id="root"></div><button id="outside">Outside</button>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root')!), commits: string[] = [];
  const original = 'Fe$^{2+}$';
  try {
    await act(async () => root.render(<SiteNameEditor name={original} onCommit={name => commits.push(name)}/>));
    const input = document.querySelector('input')!;
    const type = async (value: string) => act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    const key = async (key: string) => act(async () => { input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
    await act(async () => input.focus());
    await type('$\\alpha$-Fe');
    assert.equal(document.querySelector('.site-name-preview'),null);assert.equal(document.querySelector('.site-name-help'),null);assert.equal(input.value,'$\\alpha$-Fe');
    assert.deepEqual(commits, []);
    await key('Enter'); assert.deepEqual(commits, ['$\\alpha$-Fe']);
    await act(async () => input.focus()); await type('Canceled'); await key('Escape');
    assert.equal(input.value, original); assert.equal(commits.length, 1);
    await act(async () => input.focus()); await type('Fe$^{3+}$'); await act(async () => document.getElementById('outside')!.focus());
    assert.deepEqual(commits, ['$\\alpha$-Fe', 'Fe$^{3+}$']);
    await act(async () => input.focus()); await type('Fe$^{');
    assert.match(document.querySelector('[role="status"]')!.textContent!, /Close/);
    await key('Escape');
    assert.equal(document.querySelector('[role="status"]'), null);
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});

test('site buttons form a named group with arrow selection and Delete, with accessible row actions',async()=>{
 const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root')!);let selected=-1,removed=-1;try{await act(async()=>root.render(<SiteList sites={demo().sites} selected={0} disabled={false} onSelect={i=>selected=i} onDelete={i=>removed=i}/>));assert.ok(document.querySelector('[role=group][aria-label=Sites]'));const buttons=document.querySelectorAll<HTMLButtonElement>('.site-select');await act(async()=>buttons[0].dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true})));assert.equal(selected,1);assert.equal(document.activeElement,buttons[1]);await act(async()=>buttons[1].dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true})));assert.equal(removed,1);assert.ok([...document.querySelectorAll<HTMLButtonElement>('.site-trash')].every(b=>b.tabIndex===0));}finally{await act(async()=>root.unmount());dom.window.close();}
});


test('native selectors and accessible names use readable labels without changing editable source',()=>{
 const cases=[['Fe$^{2+}$','Fe²⁺'],['High-spin Fe$^{3+}$','High-spin Fe³⁺'],['$\\alpha$-Fe','α-Fe'],['\\mathrm{Fe}^{3+}','Fe³⁺'],['$d_{xy}$','d_(xy)'],['$d_{x^2-y^2}$','d_(x²-y²)'],['$\\frac{1}{2}$','(1)/(2)'],['Ordinary site_1','Ordinary site_1'],['Fe$^{2+}','Fe$^{2+}']];
 for(const [source,expected] of cases)assert.equal(plainScientificLabel(source),expected,source);
 const project=demo();project.sites=Array.from({length:5},(_,i)=>({...project.sites[i%2],name:i===0?'Fe$^{2+}$':`Site ${i+1}`}));
 const doc=new JSDOM(renderToStaticMarkup(<SiteList sites={project.sites} selected={0} disabled={false} onSelect={()=>{}} onDelete={()=>{}}/>)).window.document;
 assert.match(doc.querySelector('option')!.textContent!,/Fe²⁺/);assert.equal(project.sites[0].name,'Fe$^{2+}$');
});

test('percentage annotations remain intact when a long legend label wraps',()=>{
 const lines=layoutLabel('A long descriptive mineral label',65,11,' · 12.3%');
 assert.ok(lines.some(line=>line.parts.some(({part})=>part.kind==='text'&&part.source===' · 12.3%')));
 assert.ok(!lines.some(line=>line.parts.at(-1)?.part.source==='·'));
});
