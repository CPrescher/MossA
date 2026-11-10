// Measures the actual Engine/MessagePort/Worker path, without shared memory.
import { build } from 'vite';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import os from 'node:os';
import assert from 'node:assert/strict';
import { compare } from './transmission-equivalence.mjs';
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const pw = option('--playwright-module', null);
const browsers = await import(pw ? pathToFileURL(resolve(pw)) : 'playwright');
const counts = option('--workers', '1,2,4,8').split(',').map(x => x === 'auto' ? null : Number(x));
const repetitions = Number(option('--repetitions', '5'));
const client = args.includes('--shared') ? 'validation-data/performance/runtime/parallel-client-shared' : 'validation-data/performance/runtime/parallel-client';
await mkdir(client, { recursive: true });
const entry = resolve(client, 'entry.ts');
await writeFile(entry, `export { Engine } from ${JSON.stringify(resolve('src/engine.ts'))};\n`);
await build({ configFile: false, base: './', logLevel: 'error', publicDir: false, worker: { format: 'es' }, build: {
  outDir: client, emptyOutDir: false, rollupOptions: { input: entry, preserveEntrySignatures: 'strict', output: { entryFileNames: 'engine.js' } },
} });
const files = ['tests/fixtures/transmission-performance.json', 'tests/fixtures/transmission-measured-performance.json'];
let cases = (await Promise.all(files.map(async file => JSON.parse(await readFile(file, 'utf8')).cases))).flat();
const filter = option('--cases', '').split(',').filter(Boolean);
if (filter.length) cases = cases.filter(c => filter.includes(c.id));
const searchStarts = Number(option('--search-starts', '1'));
assert.ok(Number.isInteger(searchStarts) && searchStarts >= 1 && searchStarts <= 32);
if (searchStarts > 1) {
  // Compare the complete production-worker search with the frozen pre-change
  // WASM fitter, not with another execution of the optimized search itself.
  const archive = resolve('validation-data/performance/runtime/remaining-work/baseline');
  const core = await import(pathToFileURL(resolve(archive, 'mossa_core.js')));
  const { fitMultiStart } = await import(pathToFileURL(resolve(archive, 'multistart.mjs')));
  await core.default({ module_or_path: await readFile(resolve(archive, 'mossa_core_bg.wasm')) });
  cases = cases.filter(c => !c.calibration).map(c => {
    const project = { ...c.project, search_starts: searchStarts };
    const result = fitMultiStart(project, p => JSON.parse(core.fit_json(JSON.stringify(p))), p => JSON.parse(core.evaluate_json(JSON.stringify(p))));
    return { ...c, project, result };
  });
}
const headers = args.includes('--shared') ? { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' } : {};
const root = resolve('.');
const server = createServer(async (req, res) => {
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/__parallel-benchmark.html') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Derivative benchmark</title>'); return; }
  try {
    const file = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + sep)) throw new Error('Outside workspace');
    res.setHeader('Content-Type', extname(file) === '.wasm' ? 'application/wasm' : 'text/javascript');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const output = { date: new Date().toISOString(), cpu: os.cpus()[0].model, node: process.version, repetitions, search_starts: searchStarts, paired: args.includes('--paired'), wasm_sha256: createHash('sha256').update(await readFile('src/wasm/mossa_core_bg.wasm')).digest('hex'), results: [] };
try {
  for (const browserName of option('--browsers', 'webkit,chromium').split(',')) {
    const browser = await browsers[browserName].launch({ headless: true });
    try {
      const page = await browser.newPage();
      page.on('console', message => { if (message.type() === 'error') console.error(browserName, message.text()); });
      page.on('pageerror', error => console.error(browserName, error));
      await page.goto(base + '/__parallel-benchmark.html');
      for (const count of counts) {
        const rows = await page.evaluate(async ({ cases, count, repetitions, argsPaired, clientUrl }) => {
          const { Engine } = await import(clientUrl);
          const resultKey = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
          let engine;
          await new Promise((resolve, reject) => { engine = new Engine(resolve, reject); });
          const rows = [];
          try {
            for (const c of cases) {
              const options = count === null ? undefined : { derivativeWorkers: count };
              const run = (serial = false) => engine.request(c.calibration ? 'fit-source' : 'fit', c.project, undefined, serial ? { derivativeWorkers: 1 } : options);
              const paired = argsPaired;
              if (paired) await run(true);
              const coldStart = performance.now(), cold = await run(), coldMs = performance.now() - coldStart;
              const samples = [], compute = [], serialSamples = [];
              let response = cold;
              for (let repeat = 0; repeat < repetitions; repeat++) {
                const serial = async () => { const begin = performance.now(); const reference = await run(true); serialSamples.push(performance.now() - begin); if (resultKey(reference.result) !== resultKey(cold.result)) throw new Error(`${c.id}: serial/parallel outputs differ`); };
                if (paired && repeat % 2 === 0) await serial();
                const start = performance.now(); response = await run(); samples.push(performance.now() - start); compute.push(response.elapsed);
                if (JSON.stringify(response.result) !== JSON.stringify(cold.result)) throw new Error(`${c.id}: nondeterministic parallel output`);
                if (paired && repeat % 2 !== 0) await serial();
              }
              rows.push({ id: c.id, cold_ms: coldMs, samples_ms: samples, compute_ms: compute, median_ms: [...samples].sort((a,b)=>a-b)[Math.floor(samples.length/2)], ...(paired ? { serial_samples_ms: serialSamples, serial_median_ms: [...serialSamples].sort((a,b)=>a-b)[Math.floor(serialSamples.length/2)] } : {}), execution: response.execution, result: response.result });
            }
          } finally { engine.stop(); }
          return { rows, hardwareConcurrency: navigator.hardwareConcurrency, crossOriginIsolated: self.crossOriginIsolated };
        }, { cases, count, repetitions, argsPaired: args.includes('--paired'), clientUrl: `/${client}/engine.js` });
        for (const row of rows.rows) {
          const reference = cases.find(c => c.id === row.id);
          row.comparison = compare(reference, row.result);
          assert.deepEqual(row.result, reference.result, `${browserName}/${count}/${row.id}: complete fit differs`);
          assert.equal(row.execution.fallback, undefined, 'Benchmark must not silently use serial fallback');
          row.iterations = row.result.iterations; delete row.result;
        }
        output.results.push({ browser: browserName, version: browser.version(), requested_workers: count ?? 'auto', ...rows });
        console.log(browserName, count ?? 'auto', JSON.stringify(rows.rows.map(r => ({ id: r.id, median_ms: r.median_ms, workers: r.execution.derivative_workers }))));
        await writeFile(option('--output', 'validation-data/performance/parallel.json'), JSON.stringify(output, null, 2) + '\n');
      }
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
