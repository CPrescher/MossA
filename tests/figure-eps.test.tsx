import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {figureEps} from '../src/figure-eps';
import {defaultFigureOptions,renderFigure} from '../src/figure';
import {demo} from '../src/demo';
import type {Evaluation} from '../src/types';

const dom=new JSDOM('',{url:'http://localhost/'});
Object.assign(globalThis,{DOMParser:dom.window.DOMParser,document:dom.window.document});
globalThis.fetch=async input=>{
  const name=new URL(String(input)).pathname.split('/').at(-1)!;
  const bytes=await readFile(new URL(`../public/fonts/${name}`,import.meta.url));
  return new Response(bytes);
};

test('EPS retains physical size, clipping, dash patterns, transformed math, and Unicode labels as vector paths',async()=>{
  const project=demo();
  project.spectrum={x:[-2,-1,0,1,2],y:[100,92,83,94,100]};
  const evaluation:Evaluation={parameters:{},y:[100,91,81,91,100],background:[100,101,102,103,104],components:[[0,3,6,3,0],[0,7,15,9,4]],residual:[0,1,2,3,0],sse:14,objective:14};
  const options=defaultFigureOptions(project);options.title='Mössbauer · α-Fe';options.legend='above';
  options.sites[0].name='Fe$^{3+}$';options.sites[1].name='Fe²⁺ $\\frac{a_1}{b^2}$';
  const before=JSON.stringify({project,evaluation,options});
  for(const style of ['filled','transparent','lines'] as const) {
    options.style=style;
    const blob=await figureEps(renderFigure(project,evaluation,options,true),180,120),eps=await blob.text();
    assert.equal(blob.type,'application/postscript');
    assert.match(eps,/^%!PS-Adobe-3.0 EPSF-3.0/);
    assert.match(eps,/%%BoundingBox: 0 0 511 341/);
    assert.match(eps,/%%HiResBoundingBox: 0 0 510\.23622 340\.15748/);
    assert.match(eps,/rectclip/);assert.match(eps,/\[4 4\] 0 setdash/);
    assert.match(eps,/curveto/);assert.match(eps,/\[0 -1 1 0 15 [\d.]+\] concat/);
    assert.doesNotMatch(eps,/colorimage|image|findfont|\) show/,'artwork and text remain vectors');
    assert.equal(eps.includes('Flattened transparent site fills'),style==='transparent');
  }
  options.style='filled';assert.equal(JSON.stringify({project,evaluation,options}),before);
});

test('EPS transparency preserves overlap colors and splits crossing site boundaries',async()=>{
  const eps=await (await figureEps(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 20"><g>
    <path data-site-fill="0" d="M0 0L10 10L10 20L0 20Z" fill="#ff0000" fill-opacity="0.5"/>
    <path data-site-fill="1" d="M0 10L10 0L10 20L0 20Z" fill="#0000ff" fill-opacity="0.5"/>
    </g></svg>`,90,90)).text();
  assert.match(eps,/1 0\.5 0\.5 setrgbcolor/,'red over white');
  assert.match(eps,/0\.5 0\.5 1 setrgbcolor/,'blue over white');
  assert.match(eps,/0\.5 0\.25 0\.75 setrgbcolor/,'blue over translucent red');
  assert.match(eps,/5 5 lineto/,'crossing divides the strip at x=5');
  assert.doesNotMatch(eps,/colorimage|setopacity/);
});

test('EPS supports zero-opacity fills and rejects unsupported glyphs without a corrupt download',async()=>{
  const eps=await (await figureEps('<svg viewBox="0 0 10 10"><circle r="2" fill="#ff0000" fill-opacity="0"/></svg>',90,90)).text();
  assert.doesNotMatch(eps,/setrgbcolor/);
  await assert.rejects(()=>figureEps('<svg viewBox="0 0 10 10"><text>🪨</text></svg>',90,90),/character unavailable/);
});
