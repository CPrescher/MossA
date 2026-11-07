# MossA 2 user manual

An Astro Starlight documentation site, published beside the browser app at `https://cprescher.github.io/MossA/manual/` by the repository's existing GitHub Pages workflow.

## Develop

Use Node.js **22.23.4 or newer**; CI uses 26.12.1. The app and manual keep separate npm dependencies and lockfiles. From the repository root:

```sh
npm ci --prefix manual
npm run dev:manual
```

Open `http://127.0.0.1:4321/MossA/manual/` (or the port printed by Astro). Local preview uses the same case-sensitive base path as GitHub Pages. The **Open MossA** link opens the public app; the standalone manual dev server does not serve the application.

## Write

Pages live in `src/content/docs/`. Start each Markdown page with a `title` and `description` in YAML frontmatter, then begin its headings at `##`. The sidebar order is explicit in `astro.config.mjs`.

- Explain one user task per guide and use the app's exact visible control labels.
- Use American English and **std** for standard deviation.
- Identify synthetic examples, input assumptions, fitted results, and scientific interpretation separately.
- Check scientific details against the current implementation, `PORTING.md`, and specific validation records. Do not infer validation from a passing documentation build.
- Keep internal links under `/MossA/manual/` and the application link at `/MossA/`. If the hosting path changes, update the config and content together.
- Write inline math with `$…$` and display equations with `$$…$$`. KaTeX is rendered at build time; fonts and styles are bundled locally.
- Place screenshots in `src/assets/` and reference them with relative Markdown image paths and descriptive alt text. Capture synthetic or explicitly redistributable data; keep private measurement inputs out of the site.
- Prefer a contextual link from the in-app Help dialog to duplicating the entire manual there.

The first-fit chapter uses the current synthetic mixture (`src/demo.ts`). The measured-data tutorials adapt the Freiburg conventional-source/almandine tutorial and section 4 of the 2026 practical: dedicated pyroxene calibration, two-doublet augite and omphacite fits, and area-based Fe³⁺/ΣFe interpretation. The required almandine sequence follows the original steps 1–7; freeing A12 is optional. The SMS tutorial additionally covers sinusoidal calibration, measured before/after source references, SPEC MCA import, velocity reversal, three magnetic sextets, and 3:3:1 intensity links. The lab-equipment exercises remain outside the browser manual.

Screenshots throughout the substantive manual pages were captured from the real local browser app. Captions distinguish measured teaching examples, generated source/xVBF illustrations, and deliberately produced warnings. Screenshots show local preview builds, so timings are not benchmarks. Store the capture record in `src/assets/screenshots/capture-record.json` and refresh a screenshot when its associated UI changes.

Click a screenshot to enlarge it, or use its keyboard-focusable button. The preview supports Escape/Close and provides a full-size image link. Image assets, the enlargement script, and search are served locally with the manual.

The five course count files are distributed byte for byte under `public/tutorial-data/freiburg/`, with simplified download names and SHA-256 provenance. The `.mossa` files contain **new browser fits**, not original MATLAB answer files. To regenerate them after compiling WASM, run:

```sh
node --import tsx scripts/prepare-course-tutorial.ts /path/to/exercise-folder
```

Run that command from the repository root with Node 26. It checks actual save/open round trips for individual and combined projects. The raw 514-channel pyroxene files retain the handout's center 256.5 rather than being trimmed or silently recentered; the manual documents that choice and the different automatic estimate. Original PDFs and third-party literature figures are not copied into the public site.

## Build and check

```sh
npm run build:manual
```

This builds static pages into `manual/dist/`, creates Starlight's local search index, and checks generated links, assets, and anchors within the manual. External links and the app are outside the standalone link check. No app build, Rust installation, or WASM compilation is needed for editing and checking the manual alone.

To preview the production manual:

```sh
npm --prefix manual run preview
```

The base path remains `/MossA/manual/`.

## Deploy with the app

The existing `.github/workflows/pages.yml` installs both locked dependency trees, tests the app, and runs `npm run build:pages`. That command builds the app into root `dist/`, builds the manual separately into `manual/dist/`, checks its links, then copies it into `dist/manual/`. Only the combined root artifact is deployed. A separate manual deployment would replace the application's Pages artifact, so both stay in one workflow.

App-only `npm run build` and `npm run build:web` remain available. `build:pages` expects WASM to have been generated already, as the workflow's `npm test` does; from a clean checkout run `npm run wasm` first. The standalone manual PR workflow checks documentation changes without building the Rust app.

Publishing follows pushes to **`mossa2`**, not the MATLAB `main` branch. There is no new hosting account or external search service. Generated output, Astro caches, and `node_modules/` are ignored by Git.

## SMS tutorial data and regeneration

The four SMS measurements are copied byte for byte under `public/tutorial-data/sms/`. Their original names, hashes, the unresolved 1 GPa/02GPa labels, dedicated source fits, and browser worked projects are retained. The reader recognizes the specific five-column reference layout only after checking total and difference arithmetic. It reads a single SPEC MCA `@A` block with a checked `#@CHANN` count, retaining headers as metadata. Other MCA dialects are outside this support.

Regenerate with Node 26 after building WASM:

```sh
node --import tsx scripts/prepare-sms-tutorial.ts /path/to/original/SMS
```

The script performs new browser-core velocity/source/sample fits and checks every saved model on reopening. The before/after source mean is held fixed for sample fits. Reversed axes use project version 3 and collection/autosave version 2 to protect against older clients losing the direction during recalibration. Existing nonreversed formats remain readable.
