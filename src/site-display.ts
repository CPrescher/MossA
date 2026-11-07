import type { Evaluation, Project } from './types';

/** Shared screen/export geometry; transmission sites remain display-scaled profiles. */
export function siteDisplayCurves(project:Project, evaluation:Evaluation) {
  let scale=1;
  if(project.mode==='transmission') {
    let maximum=0,minimum=Infinity;
    for(let i=0;i<project.spectrum.x.length;i++) {
      maximum=Math.max(maximum,evaluation.components.reduce((sum,component)=>sum+component[i],0));
      minimum=Math.min(minimum,project.spectrum.y[i]);
    }
    scale=maximum>0?.8*Math.max(0,project.background[0].value-minimum)/maximum:0;
  }
  const curves=evaluation.components.map(component=>component.map((value,i)=>evaluation.background[i]-value*scale));
  return {scale,curves};
}
