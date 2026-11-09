import {variableProjectionCases} from './variable-projection-cases.mjs';
import {sourceXvbfCases} from './source-xvbf-analytical-cases.mjs';
import {transmissionAnalyticalCases} from './transmission-analytical-cases.mjs';
export function solverLinearAlgebraCases(evaluate,source){
 const thin=variableProjectionCases(evaluate,source);
 const extra=[...sourceXvbfCases(evaluate,source).filter(c=>c.project.mode!=='thin'),...transmissionAnalyticalCases(evaluate).map(c=>({...c,id:'ordinary-'+c.id}))];
 const joint=thin.filter(c=>['Sextet-PseudoVoigt','MS_MexicanMagnetite_coarse','MS-Fe2O3-Fe3O4_70-30_coarse'].includes(c.id)).map(c=>({...c,id:c.id+'-joint',project:{...c.project,thin_solver:'joint'}}));
 return [...thin,...extra,...joint];
}
