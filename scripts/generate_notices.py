#!/usr/bin/env python3
"""Bundle upstream license texts without changing their terms or copyright notices."""
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent.parent
metadata = json.loads(subprocess.check_output(
    ['cargo', 'metadata', '--locked', '--format-version', '1', '--filter-platform', 'wasm32-unknown-unknown', '--manifest-path', str(root / 'rust-core/Cargo.toml')],
    cwd=root, text=True,
))
packages = []
resolved = {node['id'] for node in metadata['resolve']['nodes']}
for package in metadata['packages']:
    if package['source'] and package['id'] in resolved:
        packages.append((package['name'], package['version'], package['license'], Path(package['manifest_path']).parent))
for name in ['react', 'react-dom', 'scheduler', '@mathjax/src', '@mathjax/mathjax-tex-font', 'jspdf', 'svg2pdf.js', 'opentype.js', 'fflate', 'fast-png', 'iobuffer', 'pako', 'rgbcolor', 'specificity', 'cssesc', 'svgpath', 'font-family-papandreou', '@babel/runtime', 'canvg', 'core-js', 'dompurify', 'html2canvas', 'raf', 'stackblur-canvas', 'text-segmentation', 'utrie', 'base64-arraybuffer', 'performance-now']:
    folder = root / 'node_modules' / name
    package = json.loads((folder / 'package.json').read_text())
    packages.append((name, package['version'], package['license'], folder))

texts, entries = {}, []
for name, version, license_id, folder in sorted(packages):
    notices = []
    for path in sorted(folder.iterdir()):
        if path.is_file() and path.name.lower().startswith(('license', 'licence', 'copying', 'notice')):
            body = path.read_text().strip()
            if body not in texts:
                texts[body] = f'Text {len(texts) + 1}'
            notices.append(f'{path.name}: {texts[body]}')
    # The TeX font npm archive declares Apache-2.0 but omits its license file.
    # Include the complete identical Apache text distributed with MathJax.
    if not notices and name == '@mathjax/mathjax-tex-font' and license_id == 'Apache-2.0':
        body = (root / 'node_modules/@mathjax/src/LICENSE').read_text().strip()
        if body not in texts:
            texts[body] = f'Text {len(texts) + 1}'
        notices.append(f'Apache-2.0 (package metadata; text from @mathjax/src/LICENSE): {texts[body]}')
    if not notices:
        raise RuntimeError(f'No upstream license text found for {name} {version}')
    entries.append(f'{name} {version} — {license_id}\n  ' + '; '.join(notices))

header = '''MossA — Third-party notices

MossA itself is licensed under the MIT License (see LICENSE.txt).
Dependencies retain their upstream licenses. This inventory covers the resolved
Rust dependency graph (including build-time support crates) and the interface, scientific labels, and figure export dependencies.
Identical license texts are included once and referenced by text number.

'''
body = header + '\n'.join(entries) + '\n\n'
for source, label in texts.items():
    body += f'{"=" * 72}\n{label}\n{"=" * 72}\n{source}\n\n'
for name in ['LICENSE', 'NotoSans-LICENSE.txt']:
    body += '\n' + '=' * 72 + '\nBundled PDF fonts — ' + name + '\n' + '=' * 72 + '\n' + (root / 'public/fonts' / name).read_text() + '\n'
output = root / 'THIRD_PARTY_NOTICES.txt'
output.write_text(body)
print(f'{output.name}: {len(packages)} packages, {len(texts)} license texts, {output.stat().st_size} bytes')
