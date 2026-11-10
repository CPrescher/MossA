import {readFileSync} from 'node:fs';
import {solverLinearAlgebraCases} from './solver-linear-algebra-cases.mjs';
export function normPrecomputeCases(evaluate,source) {
 return [...solverLinearAlgebraCases(evaluate,source),{
  id:'velocity-calibration-roundoff',
  project:JSON.parse(readFileSync('tests/fixtures/stable-norm-calibration.json','utf8')).project,
 }];
}
