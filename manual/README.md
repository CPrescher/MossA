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

The first-fit chapter uses the current synthetic mixture (`src/demo.ts`). The measured-data tutorials adapt the Freiburg conventional-source/almandine and SMS tutorials. Separate classroom exercises are excluded from the manual and its downloadable projects. The required almandine sequence follows the original steps 1–7; freeing A12 is optional. The SMS tutorial additionally covers sinusoidal calibration, measured before/after source references, SPEC MCA import, velocity reversal, three magnetic sextets, and 3:3:1 intensity links. The lab-equipment exercises remain outside the browser manual.

Start here follows the measurement workflow: workspace tour, folding/velocity calibration, then the synthetic first fit. The workspace tour covers the wide desktop, shared laptop editor, and tablet views. General begins with Folding & calibration, before Spectrum model; distinguish the Fitting options panel from its Fit options solver tab. Workspace screenshots use the synthetic mixture in both themes; the raw-import screenshot uses the public Freiburg almandine data before fitting. Their current capture details are recorded under `workspaceRefresh` in the capture record.

Screenshots throughout the substantive manual pages were captured from the real local browser app. Captions distinguish measured teaching examples, generated source/xVBF illustrations, and deliberately produced warnings. Screenshots show local preview builds, so timings are not benchmarks. Store the capture record in `src/assets/screenshots/capture-record.json` and refresh a screenshot when its associated UI changes.

Refresh the three measured-data tutorials with `node scripts/capture-tutorial-screenshots.mjs --playwright-module /absolute/path/to/playwright/index.mjs` from the repository root while this checkout's app is served at `http://127.0.0.1:5428/`. Override the URL with `--base`; select groups with `--tutorial almandine,sms,syncmoss` and themes with `--theme light,dark`. The script reopens public worked projects, captures the current calibration entry points on wide and laptop layouts, and refits the reference dialogs through their actual controls. It records source revision, visible state, dimensions, and image hashes under `tutorialRefresh`. The calculated SYNCmoss source-response plot remains a calculated figure and is not recaptured as a GUI screenshot.

Click a screenshot to enlarge it, or use its keyboard-focusable button. The preview supports Escape/Close and provides a full-size image link. Image assets, the enlargement script, and search are served locally with the manual.

Application screenshots follow the manual's Light/Dark/Auto theme. Keep the light capture (`.png` or `.jpg`) in `src/assets/screenshots/` (the first-fit image is in `src/assets/`) and a real app dark-mode capture with the same basename in `public/screenshots/dark/<name>.jpg`. The Markdown processor creates the paired markup and fails the build if a dark capture is missing. Capture both from the corresponding workflow; do not invert or recolor a screenshot. The enlarged preview uses the active theme, and printing uses the light capture for legibility. Existing light captures and newer dark captures can show different local build timestamps; the capture record retains their provenance.

The physics section contains original, explicitly labeled calculated figures. Regenerate them with `python3 scripts/plot-transmission-tutorial.py` and `python3 scripts/plot-syncmoss-source.py` from the repository root. These figures also have light/dark variants but are not app screenshots or measured data.

KaTeX renders equations with both MathML and visual HTML. The math-search plugin keeps those accessibility/rendering representations intact while excluding the duplicate MathML/TeX text from Pagefind snippets.

The model-comparison foundations chapter includes a native arithmetic control and a replay of real production-WASM bootstrap fits. Regenerate its three synthetic datasets, portable projects, reports, and replay with `node --import tsx scripts/prepare-comparison-tutorial.ts` from the repository root, using Node 26 and compiled WASM. The observed-data seed is 42; each 199-trial bootstrap uses seed 12345. `public/comparison-lesson.mjs` only renders saved spectra and fitted parameters; it does not run a second fitter. Playback requires an explicit click, supports pause and single steps, and becomes a static completion under reduced-motion preferences. The ordinary worked table and downloads remain readable without JavaScript and in print. Check the components with `node --test tests/comparison-lesson.test.mjs` from the repository root.

The SYNCmoss tutorial pins upstream commit `b712fbc1521004a47409b964b9ab012fe5c5e255`. The three original `.dat` files and upstream MIT notice in `public/tutorial-data/syncmoss/` retain exact bytes. `Calibration.dat` duplicates the CMS numeric observations. Regenerate the four new worked fits with `node --import tsx scripts/prepare-syncmoss-tutorial.ts` (Node 26 and compiled WASM); the script verifies the original Git blob hashes and reopens every saved fit. Preserve attribution, full license notices, source conversion, and the distinction between empirical CMS models, the supplied SMS source, and newly calculated fits.

The two almandine course count files are distributed byte for byte under `public/tutorial-data/freiburg/`, with simplified download names and SHA-256 provenance. The `.mossa` files contain **new browser fits**, not original MATLAB answer files. To regenerate them after compiling WASM, run:

```sh
node --import tsx scripts/prepare-course-tutorial.ts /path/to/exercise-folder
```

Run that command from the repository root with Node 26. It exports only the almandine tutorial and checks actual save/open round trips for its model alternatives. Separate classroom spectra, calibrations, solutions, and combined exercise projects are not exported. Original PDFs and third-party literature figures are not copied into the public site.

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

Pushes to **`main`** or **`develop`** build both sites independently and publish them together. The release app/manual uses `main`; `/MossA/preview/` and its manual use `develop`. The MATLAB history is retained on `matlab-legacy`. There is no new hosting account or external search service. Generated output, Astro caches, and `node_modules/` are ignored by Git.

## SMS tutorial data and regeneration

The four SMS measurements are copied byte for byte under `public/tutorial-data/sms/`. Their original names, hashes, the unresolved 1 GPa/02GPa labels, dedicated source fits, and browser worked projects are retained. The reader recognizes the specific five-column reference layout only after checking total and difference arithmetic. It reads a single SPEC MCA `@A` block with a checked `#@CHANN` count, retaining headers as metadata. Other MCA dialects are outside this support.

Regenerate with Node 26 after building WASM:

```sh
node --import tsx scripts/prepare-sms-tutorial.ts /path/to/original/SMS
```

The script performs new browser-core velocity/source/sample fits and checks every saved model on reopening. The before/after source mean is held fixed for sample fits. Reversed axes use project version 3 and collection/autosave version 2 to protect against older clients losing the direction during recalibration. Existing nonreversed formats remain readable.
