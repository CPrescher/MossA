# Developing MossA

MossA uses React/TypeScript with one Rust numerical core. Browser workers run
its WASM build; the Tauri desktop app links it natively. Calculations require no
server, MATLAB, or Python runtime. `main` supplies the public browser app and
`develop` supplies `/preview/`; release-candidate branches can be tested separately.

## Setup and checks

Use Node.js 26.12.1 (the CI version), Rust 1.99.1, and the WASM target. Lockfiles
are included. Install the desktop prerequisites described in [DESKTOP.md](DESKTOP.md)
when building native installers.

```sh
npm ci
npm ci --prefix manual
rustup target add wasm32-unknown-unknown
npm run build
npm run dev
```

After editing Rust, regenerate WASM with `npm run wasm`. Generated files under
`src/wasm/`, `dist/`, and Cargo target directories stay outside Git.

```sh
npm test
npm run test:native
python3 -m unittest discover -s tests -p '*_test.py'
npm run build:pages
```

`npm test` rebuilds WASM, checks the Rust core and compiled WASM, and exercises
JavaScript/React behavior. Native integration checks use the production native
core/session registry through a headless transport; they do not replace packaged
GUI testing. `build:pages` builds the browser and manual, checks manual links,
and assembles the static site. See [manual/README.md](manual/README.md) for manual
and screenshot authoring.

## Source layout

| Path | Purpose |
| --- | --- |
| `src/` | React interface, plot/export code, browser workers, native adapter |
| `rust-core/` | Shared fitting core and native/WASM entry points |
| `src-tauri/` | Desktop shell, commands, native jobs, installer settings |
| `manual/` | Astro Starlight manual and bundled tutorials |
| `tests/` | Numerical, file-format, interaction, packaging and parity checks |
| `reference/MossA/` | Retained original MATLAB implementation |
| `validation-data/` | Scientific comparisons, benchmarks and provenance |

The original MATLAB history is retained on `matlab-legacy`; retained source
matches `d201482b7990afbd0e2dcc23e306bfc8d60a5049` apart from the author-approved
MIT license change. See [PORTING.md](PORTING.md) for deliberate differences and
[VALIDATION.md](VALIDATION.md) for case-specific evidence.

Performance reports and reproduction instructions are indexed in
[validation-data/performance/README.md](validation-data/performance/README.md).
Some expanded raw evidence and frozen benchmark binaries live in separately
hashed local archives, rather than in Git or the installed app. A fresh checkout
can run the tracked regression suite without these archives.

After dependency changes, regenerate bundled notices with
`python3 scripts/generate_notices.py`. Named releases update both package
lockfiles, the desktop Cargo version/lockfile, Windows numeric MSI mapping and
`src/changelog.ts`; see [RELEASING.md](RELEASING.md).
