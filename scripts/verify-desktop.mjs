// Check the actual packaged payload: no website paths or CDN assets are needed.
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../dist-desktop/', import.meta.url));
const base = new URL('https://tauri.localhost/');
const files = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, e.name);
    if (e.isDirectory()) await walk(path); else files.push(path);
  }
}
await walk(root);
const required = ['index.html', 'build-info.json', 'LICENSE.txt', 'THIRD_PARTY_NOTICES.txt', 'DESKTOP_NOTICES.txt', 'MossA/manual/index.html', 'MossA/manual/pagefind/pagefind.js', 'MossA/manual/tutorial-data/synthetic-first-fit.mossa', 'MossA/manual/tutorial-data/freiburg/almandine.dat'];
for (const file of required) await stat(resolve(root, file));
if (files.some(f => /mossa_core.*\.wasm$/.test(f))) throw new Error('Desktop must use the native Rust fitting engine, not bundled fitting WASM');
if (!files.some(f => f.endsWith('.woff2'))) throw new Error('Manual fonts are missing');
const info = JSON.parse(await readFile(resolve(root, 'build-info.json'), 'utf8'));
if (info.fittingBackend !== 'native-rust') throw new Error('Desktop numerical backend must be native Rust');
if (info.channel !== 'desktop') throw new Error('Desktop must not use website update checks');
const failures = [];
let checked = 0;
for (const path of files.filter(f => /\.(html|css)$/.test(f))) {
  const content = await readFile(path, 'utf8');
  const url = new URL(relative(root, path).split(sep).join('/'), base);
  const references = path.endsWith('.html')
    ? [...content.matchAll(/<(script|link|img|source)\b[^>]*?\b(?:src|href)="([^"#]+)"/g)].filter(m => !/rel="(?:canonical|sitemap|alternate)"/.test(m[0])).map(m => m[2])
    : [...content.matchAll(/url\(\s*["']?([^\s)'"#]+)["']?\s*\)/g)].map(m => m[1]);
  for (const ref of references) {
    const asset = new URL(ref.replaceAll('&amp;', '&'), url);
    if (asset.protocol === 'data:') continue;
    if (asset.origin !== base.origin) { failures.push(`${relative(root, path)} requires remote asset ${ref}`); continue; }
    try { await stat(resolve(root, '.' + decodeURIComponent(asset.pathname))); checked++; }
    catch { failures.push(`${relative(root, path)} → ${ref}`); }
  }
}
if (failures.length) throw new Error(`Desktop asset failures:\n${failures.join('\n')}`);
console.log(`Desktop payload verified: ${files.length} files, ${checked} local asset references, native Rust backend, bundled search, fonts, examples, and licenses.`);
