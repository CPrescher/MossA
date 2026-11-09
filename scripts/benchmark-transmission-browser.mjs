// Optional browser-runtime validation. Supply an installed Playwright module:
// node scripts/benchmark-transmission-browser.mjs --playwright-module /path/to/playwright/index.mjs
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compare } from './transmission-equivalence.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const playwright = option('--playwright-module', null);
const { webkit, chromium } = await import(playwright ? pathToFileURL(resolve(playwright)) : 'playwright');
const root = resolve('.');
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const path = resolve(root, `.${pathname}`);
    if (!path.startsWith(root + sep)) throw new Error('Outside workspace');
    res.setHeader('Content-Type', { '.wasm': 'application/wasm', '.json': 'application/json' }[extname(path)] ?? 'text/javascript');
    res.end(await readFile(path));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const fixturePath = option('--fixture', 'tests/fixtures/transmission-performance.json');
const fixture = JSON.parse(await readFile(fixturePath));
const stages = option('--stages', 'baseline,plans,curves,simd128').split(',');
const repetitions = Number(option('--repetitions', '5'));
const results = [];
try {
  for (const [name, engine] of [['webkit', webkit], ['chromium', chromium]]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(base + '/package.json');
      for (const stage of stages) {
        const rows = await page.evaluate(async ({ stage, repetitions, fixturePath }) => {
          const { cases } = await (await fetch('/' + fixturePath)).json();
          const module = await import(`/validation-data/performance/runtime/${stage}/mossa_core.js`);
          await module.default();
          const rows = [];
          for (const c of cases) {
            const json = JSON.stringify(c.project), run = () => JSON.parse(module[c.calibration ? 'fit_source_json' : 'fit_json'](json));
            run();
            const times = [];
            let result;
            for (let i = 0; i < repetitions; i++) { const start = performance.now(); result = run(); times.push(performance.now() - start); }
            rows.push({ id: c.id, fit_samples_ms: times, fit_ms: [...times].sort((a,b)=>a-b)[Math.floor(times.length/2)], result });
          }
          return rows;
        }, { stage, repetitions, fixturePath });
        for (const row of rows) {
          row.comparison = compare(fixture.cases.find(c => c.id === row.id), row.result, true);
          row.iterations = row.result.iterations; row.termination = row.result.termination;
          delete row.result;
        }
        results.push({ browser: name, version: browser.version(), stage, rows });
        console.log(name, stage, JSON.stringify(rows.map(r => ({ id: r.id, fit_ms: r.fit_ms, failures: r.comparison.failures }))));
        await writeFile(option('--output', 'validation-data/performance/browsers.json'), JSON.stringify({ repetitions, results }, null, 2) + '\n');
      }
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
