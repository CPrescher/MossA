// Supplement the existing core notices with the desktop and manual dependencies.
import { spawnSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const result = spawnSync('cargo', ['metadata', '--locked', '--format-version', '1', '--manifest-path', 'src-tauri/Cargo.toml'], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
if (result.status !== 0) throw new Error(result.stderr || result.error?.message || 'Cargo metadata failed');
const packages = JSON.parse(result.stdout).packages.filter(p => p.source).map(p => ({ name: p.name, version: p.version, license: p.license, dir: dirname(p.manifest_path) }));
for (const [base, names] of [[root, ['@tauri-apps/api']], [join(root, 'manual'), ['astro', '@astrojs/starlight', 'katex', '@pagefind/default-ui', 'pagefind']]]) {
  for (const name of names) {
    const dir = join(base, 'node_modules', name);
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    packages.push({ name, version: pkg.version, license: pkg.license, dir });
  }
}
const texts = new Map(), inventory = [];
const upstream = JSON.parse(await readFile(join(root, 'src-tauri/licenses/sources.json'), 'utf8'));
for (const p of packages.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))) {
  const licenses = [];
  async function scan(dir, nested = false) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!/^(licen[cs]e|copying|notice|copyright)/i.test(entry.name)) continue;
      if (entry.isDirectory() && !nested) await scan(join(dir, entry.name), true);
      else if (entry.isFile()) {
        const body = (await readFile(join(dir, entry.name), 'utf8')).trim();
        if (!texts.has(body)) texts.set(body, `Text ${texts.size + 1}`);
        licenses.push(`${entry.name}: ${texts.get(body)}`);
      }
    }
  }
  await scan(p.dir);
  // The UI npm package omits its license; the matching Pagefind package includes it.
  if (!licenses.length && p.name === '@pagefind/default-ui') {
    const pagefind = JSON.parse(await readFile(join(root, 'manual/node_modules/pagefind/package.json'), 'utf8'));
    if (pagefind.version !== p.version) throw new Error('Pagefind UI and engine licenses must match versions');
    await scan(join(root, 'manual/node_modules/pagefind'));
  }
  if (!licenses.length && upstream[p.name]?.length) {
    for (const source of upstream[p.name]) {
      const body = (await readFile(join(root, 'src-tauri/licenses', source.file), 'utf8')).trim();
      if (!texts.has(body)) texts.set(body, `Text ${texts.size + 1}`);
      licenses.push(`${source.url}: ${texts.get(body)}`);
    }
  }
  if (!licenses.length) throw new Error(`Missing upstream license text for ${p.name} ${p.version} (${p.dir})`);
  inventory.push(`${p.name} ${p.version} — ${p.license}\n  ${licenses.join('; ')}`);
}
const header = 'MossA desktop and bundled manual — additional third-party notices\n\nSee also THIRD_PARTY_NOTICES.txt for the shared fitting core and interface.\nThis inventory includes desktop Rust build dependencies and target-specific crates.\n\n';
await writeFile(join(root, 'dist-desktop', 'DESKTOP_NOTICES.txt'), header + inventory.join('\n') + '\n\n' + [...texts].map(([body, label]) => `${'='.repeat(72)}\n${label}\n${'='.repeat(72)}\n${body}\n`).join('\n'));
console.log(`Desktop/manual notices: ${packages.length} packages, ${texts.size} license texts.`);
