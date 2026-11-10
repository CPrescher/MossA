#!/usr/bin/env python3
"""Archive the already-built browser app/manual without changing either live site."""
import json
from pathlib import Path
import shutil
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
source = root / 'dist'
info = json.loads((source / 'build-info.json').read_text())
if not (source / 'manual/index.html').is_file():
    raise RuntimeError('Build the app and manual with npm run build:pages first')
output = root / 'release-web'
output.mkdir(exist_ok=True)
archive = output / f'MossA_{info["version"]}_web.zip'
with ZipFile(archive, 'w', ZIP_DEFLATED) as bundle:
    for file in sorted(source.rglob('*')):
        if file.is_file():
            bundle.write(file, Path('MossA') / file.relative_to(source))
    bundle.writestr('READ-ME.txt', '''MossA browser release candidate

Extract this archive and serve the extracted directory with a static HTTP server.
For example, with Python installed: python3 -m http.server 4173 --bind 127.0.0.1
Then open http://127.0.0.1:4173/MossA/ in your browser.
Do not open index.html directly with file://. WASM needs an HTTP server.
Python is only an example server; calculations run locally in browser WASM.
A deployed static host must serve .wasm as application/wasm.
The included manual belongs to this build; live website links may show an older build.
Save portable .mossa backups before testing. See the release notes for validation limits.
''')
shutil.copy2(source / 'build-info.json', output / 'build-info.json')
print(archive)
