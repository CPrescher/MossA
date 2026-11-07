#!/usr/bin/env node
// Run the production WASM engine for the pinned SYNCmoss validation harness.
import { readFileSync, writeFileSync } from 'node:fs';
import init, { evaluate_json, fit_json } from '../src/wasm/mossa_core.js';
import { fitMultiStart } from '../src/multistart.mjs';
await init({ module_or_path: readFileSync(new URL('../src/wasm/mossa_core_bg.wasm', import.meta.url)) });
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node scripts/evaluate-syncmoss-sms.mjs input.json output.json');
const request = JSON.parse(readFileSync(input, 'utf8'));
const evaluate = p => JSON.parse(evaluate_json(JSON.stringify(p)));
const results = request.projects.map(({ id, project, fit }) => {
  const result = fit ? fitMultiStart(project, p => JSON.parse(fit_json(JSON.stringify(p))), evaluate) : null;
  const finalProject = result?.project ?? project;
  return { id, project: finalProject, evaluation: result?.evaluation ?? evaluate(project), fit: result };
});
writeFileSync(output, JSON.stringify({ results }, null, 2) + '\n');
