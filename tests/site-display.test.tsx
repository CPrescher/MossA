import {test} from 'node:test';
import assert from 'node:assert/strict';
import {siteDisplayCurves} from '../src/site-display';
import {demo} from '../src/demo';
import type {Evaluation} from '../src/types';

test('screen and export share non-stacked curves and the legacy transmission display scale',()=>{
  const project=demo();project.spectrum={x:[0,1],y:[900,1000]};project.background[0].value=1000;
  const evaluation:Evaluation={background:[1000,1100],components:[[40,20],[10,5]],y:[950,1075],residual:[-50,-75],parameters:{},sse:0,objective:0};
  const before=structuredClone({project,evaluation});
  assert.deepEqual(siteDisplayCurves(project,evaluation),{scale:1,curves:[[960,1080],[990,1095]]});
  project.mode='transmission';
  assert.deepEqual(siteDisplayCurves(project,evaluation),{scale:1.6,curves:[[936,1068],[984,1092]]});
  project.mode='thin';assert.deepEqual({project,evaluation},before);
});
