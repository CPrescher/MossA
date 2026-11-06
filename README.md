# MossA 2 browser preview

**[Open MossA 2 in your browser](https://cprescher.github.io/MossA/)** — no installation or MATLAB license needed. Spectra and fitting remain on your device. Local autosave belongs to the browser used to open the app; Save project exports a portable backup.

React/TypeScript interface with a Rust/WebAssembly fitting core. All spectrum calculations run on the user's device in a Web Worker. The production build is a static website; it needs no calculation server, Python, or MATLAB.

This is the **`mossa2` preview branch** of [CPrescher/MossA](https://github.com/CPrescher/MossA/tree/mossa2). The **[`main` branch](https://github.com/CPrescher/MossA/tree/main)** retains the original MATLAB application.

The original MATLAB source is also retained, unchanged, as ordinary tracked files in `reference/MossA/`, matching commit `d201482b7990afbd0e2dcc23e306bfc8d60a5049`. Both implementation histories are preserved in this repository; no submodule setup is needed. Both the port and retained reference use GPL-3.0. See `LICENSE` and [PORTING.md](PORTING.md).

## GitHub Pages

Pushes to `mossa2` run the Rust/WASM and UI tests, build the static app, and deploy `dist/` through `.github/workflows/pages.yml`. The MATLAB `main` branch is not a deployment source. GitHub Pages uses the `github-pages` environment, restricted to `mossa2`. The site needs no calculation server; its relative asset URLs support the `/MossA/` project path. `build-info.json` identifies the deployed commit.

## Open the prebuilt prototype

The downloadable ZIP includes `dist/`. A Git checkout keeps generated builds out of version control; run the development build below first.

From this folder:

```sh
node scripts/serve.mjs
```

Open **http://127.0.0.1:4173**. On macOS, `Start MossA.command` starts the same local server. Node is needed for this convenience server, not for the hosted browser application. The bundled `dist/` folder can be hosted by any static web server with `.wasm` served as `application/wasm`; do not open `dist/index.html` directly with `file://`.

## Workflow

- The layout retains MossA's site controls on the left, spectrum and residuals in the center, Gen/Bnds/xVBF/Opt tabs on the right, and a resizable results pane below. Drag the divider to change its height; the header stays fixed, with room for at least three sites. It fills the browser height; only individual panes scroll. In narrow windows, **Options** opens the right pane over the graph.
- **Open spectrum:** plain text/CSV with velocity and counts in two columns, or a single count column. Two-column data are sorted by velocity, with duplicate velocities rejected. Comments beginning with `#`, `%`, `;`, or `//` and a conventional header are supported. Instrument-specific binary/MCA/XML formats are not yet supported.
- Single-column data enable manual folding and velocity calibration in Gen. The fold center uses the original 1-based integer/half-integer convention. An initial center is suggested; it is not an automatic determination of the correct folding point.
- **+ → New site type / New line profile → Define on graph** starts the original mouse workflow. First click sets the position and depth; second click sets the half-width. A doublet needs a third click at the other line, and a sextet at the opposite outer line. The curve previews while moving the mouse. A small hint overlays the lower-right of the graph without moving it. During placement, an undragged left click places a point; left-drag zoom, right-drag pan, wheel zoom, right-click unzoom, and double-right-click reset remain available. **Redefine** redraws the selected site in place, preserving its name, profile, fit flags, bounds, and links. Linked parameters continue following their source; out-of-bounds replacements are rejected. **Esc** or **Cancel** exits placement without changing the site. These clicks create starting estimates for fitting.
- Each site row has a trash icon. Deleting a different site preserves the selected site and remaps remaining links. Selecting a row in the list or table brings its thicker curve to the foreground.
- The site list shows up to four rows by default and scrolls independently above the selected site's numeric editor. Drag the divider below it to allocate more space to sites or parameters (arrow keys also resize; double-click resets). The selected row scrolls into view. Edit its name directly above the numeric parameters: Enter or clicking away applies the name, and Escape cancels. The gear opens type and profile settings; background controls are in **Gen**. The total model curve is black; site curves retain their colors.
- The overlapping-squares **Duplicate** icon beside Redefine copies and selects the current site. Values, fit flags, bounds, and profile are independent copies. Links within the source site are redirected to the copy's own parameters; links to other sites remain linked to those sites. Names receive a unique “copy” suffix. Duplication is one Undo step and respects the 16-site limit.
- Numeric labels are right-aligned beside their inputs. Numeric fields and dropdowns share subtle separators and inset focus styling across both panels. Fields normally display up to five significant digits; focusing reveals the full value. Leaving a field unchanged never rounds the stored value. Calculations, project saves, and CSV exports retain full precision. Enter commits and Escape cancels an edit.
- **Undo / Redo** retains up to 50 committed changes in memory, including parameter values, flags, bounds, links, site changes, completed fits and their results, imported spectrum/project data, and raw calibration controls. Returning to a fitted snapshot restores its parameter/fraction errors, warnings, convergence diagnostics, and original elapsed time without optimization; curves are reevaluated for display. A changed model's new state is unfitted until fitting, but Undo restores the previous completed fit. A fit or import is one step; live iterations and picking previews are not recorded. Site names commit on blur or Enter and retain valid results. A new edit clears redo. Use **⌘/Ctrl+Z**, **⌘/Ctrl+Shift+Z**, or **Ctrl+Y** outside editable fields; inside a field native text undo applies. Selection and plot navigation do not consume steps. Undo history starts fresh after a reload and is not saved in project files; local autosave still preserves the current fit.
- **Local autosave** restores the current spectrum, model, raw counts, calibration controls, selected site, completed-fit diagnostics/uncertainties, option tab, and both panel sizes after reload. Autosave uses browser storage on this device and writes shortly after changes; normal reload/close flushes pending saves and commits focused input edits. Restored panel sizes fit the current window. Active fit iterations and unfinished picking previews are not saved. If local storage fails, the app shows a warning directing you to Save project. This autosave belongs to the same browser and app address; clearing its storage removes it. **Save project** remains the portable backup/export.
- All sites can be deleted. With zero sites, the polynomial background can still be evaluated and fitted.
- **Bnds** edits bounds and proportional links. Checked parameters vary; unchecked parameters stay fixed. Linked values display their resolved values and follow the source parameter.
- Detailed workflow and scientific notes are available through **Help**. Fit progress and diagnostics appear only in the lower-left Status panel. Fit details open automatically when there is enough space below the selected site's parameters. In a compact layout, the **Fit details** button expands/collapses them within the card; the parameter editor can scroll, and the status remains above the diagnostics.
- **Fit spectrum** updates the curve, residuals, live objective, site parameters, and iteration count at up to approximately 10 Hz. Very short fits may finish before an intermediate update is due. **Stop** terminates the worker and restores the starting model; partial iterates are not committed.
- **Save project / Open project** round-trip the spectrum, model, parameters, bounds, and links as versioned JSON. Raw count channels and calibration controls are retained when present. Saved fit diagnostics are archival; opening a project clears the current fit result and uncertainties until refitting. MATLAB `.map` files are not yet imported.
- Export the spectrum/model/residuals as CSV, fit parameters and approximate uncertainties as CSV, and the current plot as SVG.
- The results table shows values with **± 1 std** on a separate line. **Fit for errors** means no current fitted uncertainties are available; **fixed** marks a held parameter, and **± —** has a tooltip explaining why no std is reported. **Intensity (%)** is the first numeric column, calculated immediately as `100 × site intensity / sum of site intensities`, matching the MATLAB table definition. **Intensity (raw)** remains available separately. **Lorentz mix** is the pseudo-Voigt line-shape mixing fraction (0–1), which is a different quantity and is only shown for pseudo-Voigt sites. In full transmission the percentages are absorber-intensity fractions. Their std uses the full fit covariance and is in percentage points; exact fixed/link ratios can have 0 std. All-zero intensity has no defined percentages. Older saved fits need a refit to obtain the new fraction std. Percentage values/std are also exported as `intensity_fraction_percent` CSV rows.

### Velocity calibration

Open **Gen → Velocity calibration…**. Load an α-Fe reference as **one column of counts**, or use the current raw spectrum if it is an iron standard. Reference loading does not replace your sample. For an unfolded reference, enable **Fold reference channels** and set its integer/half-integer center; leave folding off for an already folded spectrum. Select the same linear/sinusoidal drive used for acquisition, enter an approximate initial maximum velocity, and set the reference field (default **33 T**, from MATLAB `calib.m`). Use the known field appropriate to your standard and measurement conditions.

**Fit reference** runs a Lorentzian sextet with zero QS and linear background in a separate Rust/WASM worker, with live curve/residual updates and cancellation. Inspect the six-line fit before accepting it. The window reports the maximum velocity and standard center shift. **Apply calibration** recalculates your current raw spectrum with these values in one Undo/Redo step; it keeps sample counts/sites and clears the previous fit. If your sample already contains velocity columns, its spectrum and fit are retained, and **Use calibration** stores the settings for later raw-count imports. Calibration coefficients, reference counts/settings, and source filename are retained by local autosave and project export. The reference draft itself is committed only when you apply/use it.

This currently supports the single-sextet iron reference used by MATLAB, not arbitrary calibration materials or a non-linear correction from manually assigned peak positions. Coefficient recovery has been checked with independent synthetic linear/sinusoidal and folded references; a measured-standard comparison with MATLAB is still needed. See PORTING.md for the exact scale/shift convention.

### Graph controls

| Gesture | Action |
| --- | --- |
| Left drag | Rectangle zoom in both axes of the selected plot |
| Right drag | Pan the selected plot in x and y |
| Right click | Return to the previous zoom view |
| Double right click | Reset all zooming and panning |
| Mouse wheel | Zoom the velocity range around the pointer |

Residuals are drawn as points. Spectrum and residuals share their velocity range. Their vertical ranges can be zoomed/panned separately. Tick positions use rounded 1/2/2.5/5 steps, with formatting based on the interval and space reserved for axis titles.

## Implemented numerical scope

Singlets, doublets, sextets; Lorentzian, Gaussian, pseudo-Voigt, and Lorentzian-squared profiles; polynomial backgrounds of order 0–3; bounded trust-region-reflective least squares; fixed and proportionally linked parameters; unweighted or observed-count-weighted residuals; full transmission convolution with Lorentzian or Lorentzian-squared source and PCHIP interpolation; local-Jacobian uncertainty estimates with diagnostics for rank deficiency and active bounds.

**Not yet ported:** xVBF distributions and their coupling/normalization constraints, automatic source-profile calibration, automatic fold-center search, MATLAB class-based project import, instrument-specific importers, and the original formatted reporting workflow. The xVBF tab identifies the missing functionality.

This is an initial port, not a validated replacement for every MATLAB workflow. No measured reference spectra were supplied, and MATLAB is not installed in this environment. Numerical checks use independent transcriptions of the MATLAB expressions, synthetic fit recovery, and direct-convolution comparisons. `reference/export_mossa_reference.m` exports actual MATLAB profile outputs when run in MATLAB. See PORTING.md for conventions and validation limits.

## Development

The header shows the running app version and source commit. Public builds check `build-info.json` on startup, when returning to the app, and every five minutes while visible. A green dot means the running commit matches the latest deployment; clicking the version opens a compact changelog with recent student-facing release notes. **Check for updates** retries a check, and **Reload to update** appears there when a newer deployment is available. Failed checks are identified in the tooltip and changelog. The app never reloads automatically. Local builds are labeled **local**, with **modified** for uncommitted changes. Build identity is embedded in the JavaScript bundle and also included in saved-project provenance. Vite generates matching deployment metadata for every build; no release/tag is required. Add an entry to `src/changelog.ts` and increment `package.json` and its lockfile for named preview/release versions; the commit identifies changes between those versions.

Clone the preview branch:

```sh
git clone --branch mossa2 https://github.com/CPrescher/MossA.git
cd MossA
```

Prerequisites: Node.js 26+ (or 22.22.2+/24.15+ for the DOM tests), Rust (1.87+), and the `wasm32-unknown-unknown` target. Lockfiles are included.

```sh
npm ci
rustup target add wasm32-unknown-unknown
npm run build
npm run dev
```

`npm run build` compiles Rust via wasm-pack, type-checks TypeScript, and builds `dist/`. `npm run dev` serves the development interface; after changing Rust, rebuild with `npm run wasm` and reload the browser. Generated bindings are in `src/wasm/`.

```sh
npm test
```

Tests cover reference-profile expressions, synthetic parameter recovery, linked bounds/uncertainties, active bounds, rank deficiency, count weighting, zero sites, direct transmission convolution, actual compiled WASM, progress throttling, file parsing/folding/calibration, peak initialization, rounded axes, and DOM pointer-event behavior.

## Structure

```text
rust-core/              Native Rust library and WASM exports
src/                    React interface, SVG plot, worker, file parsing
src/wasm/               Generated wasm-pack output (regenerated by build)
reference/MossA/        Unmodified original MATLAB checkout
reference/export_*.m    Optional MATLAB fixture exporter
tests/                  Numerical fixtures and JavaScript/DOM tests
dist/                   Prebuilt static application
scripts/serve.mjs        Dependency-free local static server
```

The core is also an `rlib`, so a later Tauri application can use either the same WASM frontend or call the same Rust library natively. No Tauri wrapper is included yet.

In full-transmission mode, site overlays show absorber profiles scaled together for display using the original MossA convention. They are not additive transmission components; the fitted transmission model and residuals are unchanged.
