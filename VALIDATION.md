# Validation — November 7, 2026

## Automatic noise sensitivity after Poisson residual cautions

A completed Poisson comparison now automatically starts one Gaussian sensitivity comparison when the larger-model residual diagnostics flag excess scatter or lag-one correlation. Scheduling uses the existing diagnostic screens, independently of the p-value, component overlap, or local uncertainty flags. The second run preserves the selected models, constraints, residual weighting, simulation count, seed, and worker setting. Poisson-specific doubled-turnaround flags are disabled for the Gaussian approximation. If the existing weighting is incompatible with Gaussian noise, the UI explains the limitation and retains the Poisson result without modifying settings.

The original Poisson result remains visible while the second run is pending. Both completed noise results are shown together near the top of the results section. Automatic/manual origin, trigger codes, and complete/canceled/failed/unavailable status are included in exported reports. A canceled or failed second check cannot replace the original result, create a partial second p-value, or restart itself on rerender. Gaussian comparisons do not trigger automatic Poisson runs. Per-calculation progress guards also reject late primary progress after the secondary run has started; the existing generation guard handles cancellation and dialog teardown.

Focused regressions passed 21 assessment/dialog tests, including automatic completion/cancellation/failure, unsupported count weighting, reversed folded turnaround handling, unchanged input models, parameter/worker preservation, progress isolation, exactly-once scheduling, export metadata, and p-value-independent triggers. The full TypeScript/DOM suite passed all 180 tests; the production web build and whitespace checks passed. An isolated Chromium saved-result preview confirmed that one click on the primary simulation action automatically displayed the actual augite Poisson and Gaussian reports together, with an automatic-run explanation and both Monte Carlo classifications. The preview replayed saved numerical results; it did not rerun the 999-spectrum computations. These checks qualify scheduling, rendering, and interpretation behavior; the numerical bootstrap and acceptance rules are unchanged.

## Cautious comparison interpretation and noise sensitivity

The comparison UI now reports statistical evidence separately from physical site identification and never recommends an additional site solely because p < 0.05. A pure interpretation module screens added-component local intensity/fraction and width uncertainties, missing uncertainties, observed rank deficiency, near-bound parameters, widths narrower than two velocity-channel spacings, overlap with simpler-model component profiles, changes in retained fractions, larger-model excess Poisson scatter, and lag-one residual correlation. The screening thresholds and formulas are exported as interpretation rules and descriptions. These are approximate diagnostic heuristics, not independent significance tests, detector-resolution measurements, or automatic physical assignments. Excess scatter in the simpler model alone does not raise the noise-inadequacy flag when the larger model resolves it.

For the saved augite 999-pair reports, automated interpretation reproduces the specific cautions: added relative intensity 5.51% ± 5.21 percentage points; normalized profile overlap 0.983 with the earlier third contribution; retained fraction change from 8.61% to 1.67%; larger-model residual variance 1.19× the Poisson expectation; and residual RMS improvement only 3.50%. The alternate 999-pair Gaussian run estimated std 1,868.3963 from the simpler residuals and returned 43 exceedances, p=0.044, and Monte Carlo interval [0.03211092, 0.05747598]. Its interval spans 0.05, unlike the Poisson interval, so the paired interpretation adds a noise-sensitivity caution. This is an alternative homoscedastic noise assumption, including equal variance at turnaround channels, not evidence that Gaussian noise is the true process; estimated residual noise may also include missing signal or model inadequacy.

The new noise-sensitivity action keeps the first completed result while running the other supported noise assumption with the same simulation count, seed, and model constraints. Cancellation, late messages, or failure of the second test cannot replace the original result or produce a partial second p-value. Exported reports include the original complete result, interpretation and rules, and the second result only when complete. Uncertainties are labeled approximate local std, missing uncertainty is distinguished from fixed parameters, and all original simulation statistics remain visible.

Regressions cover the exact interpretation formulas, weak/absent uncertainties, redistribution, both doubled turnaround directions, residual-noise screening, correlation, count-weighted objective versus RMS, bounds/sampling warnings, nonsignificant results, sensitivity classification, cancellation/failure retention, and exported diagnostics. The full TypeScript/DOM suite passed 173 tests, the JavaScript suite passed 33 tests, and the production web build and whitespace checks passed. The UI was visually checked in an isolated Chromium saved-result preview using both actual augite reports, without changing the user's project or rerunning those numerical simulations. It showed **Extra component needs caution**, the specific warnings and parameter table, and both noise results. Preview/replay evidence qualifies rendering and UI behavior; the earlier native runs provide the numerical simulation evidence.

## Completed 999-pair three-versus-four-site comparison

The saved `augite.dat` three- and four-site models completed all 999 Poisson bootstrap pairs with seed 7812, the doubled first folded channel, and eight fitting workers. Original thin-absorber models, unweighted residuals, bounds, links, fixed parameters, and initial 200-iteration/one-start settings were retained. The observed objectives were 848,289,825.5596 and 789,923,906.4127: a decrease of 58,365,919.1469 (6.8804%). Seventeen of 999 simulated improvements matched or exceeded this decrease, giving the corrected p-value 0.018 and Wilson Monte Carlo interval [0.01065137, 0.02708287]. The descriptive F statistic was 4.41481. The complete interval lies below 0.05, supporting the four-site model under these noise/model assumptions without establishing the physical identity of its added site.

Longer runs exposed additional very narrow noise-fitting doublets. Simulation 236 stalled while approaching its width lower bound; simulation 342 also approached a width smaller than one velocity channel. Recovery now tries existing lower bounds as starting values for free, unlinked widths that are near their bound or narrower than two velocity channels. The widths remain free, fixed values and incoming parameter links are respected, and the original fit checks and best-objective requirement remain in force. A final deterministic search with at least five starts is available if earlier recovery remains unsuccessful; its search diagnostics are recorded and its settings do not propagate to subsequent datasets. The completed run needed recovery for 195 fits, including seven width-bound retries, and did not need this final expanded search. All 999 spectra were retained; 371 pairs reached parameter bounds.

For throughput, this calculation used the same Rust core compiled natively, the production comparison orchestration, and eight Node workers. Native and browser observed objective checks agreed to relative differences below 7e-12; a narrow-width bounded-LM check reproduced its browser objective exactly. These spot checks establish numerical agreement for the checked fits, not bitwise parity of every native/browser optimization trajectory. Successful native checkpoints were retained across interruption and checked against their exact indexed simulated data on resume. The report preserves backend provenance and executable/worker hashes; its completion-pass time excludes previous checkpoint computation and is not a total runtime benchmark.

The local artifact is `test-results/comparison/augite-3-vs-4-poisson-999-workers-8.json` (ignored by Git). An independent audit checked all 999 finite improvements, all 2,000 observed/simulated fit records, accepted termination statuses, simulation ordering, best-attempt objective checks, the exceedance count, p-value, and unchanged saved input-file hash. Targeted comparison, worker-pool, and dialog checks passed all 23 tests; the production web build passed. The result is conditional on the fitted simpler model, Poisson noise, and successful local optimization; it does not establish a global optimum.

## Recovery for the three-versus-four-site Poisson case (preview.16)

The subsequent reported failure was a different comparison: three versus four overlapping Lorentzian doublets, Poisson counts with a doubled first turnaround channel, seed 7812, and 99 simulations. Simulation 33 was reproduced exactly. Repeated continuation, including an alternative bounded LM optimizer alone, remained in a slowly evolving split of existing components. Reinitializing the added doublet at unexplained negative residual peaks converged in 29 iterations to objective 644,169,536.6624, below the stalled objective near 668 million, with stationarity approximately 4.95e-7. Fixed parameters, physical/user bounds, links, observations, and fit-quality checks were preserved.

Recovery now uses the original TRF start, a simpler-fit start with 5% added area, a residual-based start for added singlets/doublets, and bounded Levenberg–Marquardt continuation as the final fallback. Residual seeding changes only free, unlinked values and clips them to the existing bounds. Every attempt records its start, solver, budget, objective, and termination diagnostics. The default fitting action and source calibration retain their original TRF solver. This improves optimization rather than admitting unconverged fits. It can find lower null-model objectives than earlier versions, so cross-version individual fit results may change even though changing the worker count within a version remains reproducible.

The full three-versus-four-site test completed all 99 pairs on eight workers in 68.152 seconds, with 26 fits requiring recovery and no discarded spectra. It reported one simulated improvement at least as large as observed, p=0.02, and Monte Carlo interval [0.0017853, 0.0550153]. The UI therefore identifies the Monte Carlo decision as borderline and recommends more simulations, rather than confusing this with the stronger two-versus-three-site result. The complete artifact is `test-results/comparison/augite-3-vs-4-poisson-99-workers-8.json` (ignored by Git). New regressions verify the residual-start recovery path on identical data with unchanged constraints and the bounded LM backend's fixed values, exact linked intensity ratios, effective linked bounds, and input immutability. The same case also completed in an isolated Chromium browser with Auto/eight workers. Its exported report retained all 99 outcomes and 200 fit-attempt records, reproduced p=0.02 and the same Monte Carlo interval, and showed simulation 33 converged. The new recommendation, statistic explanations, themed graph, and expandable calculation logs were visually inspected. The full suite passed 14 Rust, 29 JavaScript, and 159 TypeScript/DOM tests; production build and diff checks passed.

## Parallel comparison and explained results (preview.16)

Independent bootstrap fit pairs now run in a bounded worker pool. Auto uses up to eight fitting workers, reserving one reported logical processor when possible; manual choices include serial execution. A coordinator prepares the observed fits once and generates the original seeded spectra sequentially off the UI thread. Jobs are assigned dynamically to available workers and final outcomes/diagnostics are restored to simulation order. No random stream is derived from worker assignment. Recovery and acceptance rules are unchanged. Cancel, a worker crash, a rejected fit, or an invalid/duplicate outcome terminates all workers and prevents a partial p-value. Exported reports record the fitting-worker count.

The actual production comparison-worker bundle was exercised through the production client using a Node worker_threads adapter for the browser Worker/message APIs. The complete 999-spectrum augite test (Gaussian noise, seed 7811, original constraints) took 138.884 seconds with eight fitting workers, versus the prior 752.192-second serial run: 5.416× faster on this 14-core machine (10 performance cores). All nine workers (coordinator plus eight fitters) were terminated. After excluding execution metadata and normalizing the earlier diagnostic label “observed-fit start” to “supplied model start,” the entire result matched the serial artifact exactly: observed fitted models, all 999 improvements, all fit diagnostics and recovery attempts, warnings, p=0.001, and the Monte Carlo interval. This is a local benchmark rather than a universal speed guarantee. The artifact is `test-results/comparison/augite-999-workers-8.json`.

New tests cover CPU-count selection, dynamic scheduling with out-of-order completion, monotone global progress, result ordering, cancellation, worker crashes, rejected fits, duplicate results, and complete pool cleanup. Actual Gaussian and Poisson WASM comparisons also reproduce the serial results exactly when every fit pair executes in reverse order. Missing and duplicate outcomes are rejected rather than changing the denominator.

The result panel leads with a recommendation and explains fitting-error reduction and the noise-only simulation comparison. Visible p-value, Monte Carlo interval, objective decrease, exceedance count, and F statistic each include a plain-language interpretation. Ambiguous Monte Carlo intervals prompt more simulations; unsupported extra sites favor the simpler model. Solver/recovery logs remain expandable.

## Comparison layout and simulated-fit recovery (preview.15)

Compare models now sits at the bottom of the Models section, outside its scrolling model list, with a readable filled button in both themes. Load example was removed from the project sidebar. The comparison dialog uses a plot/statistics pane beside the simulation controls, stacking on narrow screens. The graph measures its SVG viewport, shares MossA's rounded ticks and axis/grid classes, and uses a dark canvas, brighter curves, and observation colors in dark mode. Both graph and statistics remain visible at the checked desktop size.

The reported augite failure was reproduced exactly with the exported two-/three-site models, Gaussian simulations, seed 7811: simulation 21's larger fit reached MaxIter after 200 iterations with normalized stationarity approximately 0.001414. Continuing that same candidate eventually converged; a start built from the fitted simpler model with 5% added-site area found a lower objective in 53 iterations. The comparison now makes up to three bounded recovery attempts on the same observations, preserving all model constraints and the configured starting-model search. It records the original failure, each alternative or continued start, its iteration budget, objective, and termination diagnostics. If all candidates remain unreliable, the entire run still fails without a p-value.

The original augite seed completed 99 simulations in both Node/WASM and Chromium after this change; Chromium used recovery for six fits and reported p=0.01, with no discarded spectra. A full 999-spectrum Node/WASM run with the same model pair, Gaussian noise, and seed 7811 subsequently completed in 752 seconds. It retained all 999 paired outcomes and all 2,000 observed/simulated fit-attempt records, with recovery needed for 43 fits. It reported zero exceedances, p=0.001, and Wilson Monte Carlo interval [0, 0.0038305744]. The original input models were verified unchanged. The complete local validation result is `test-results/comparison/augite-999-seed-7811.json` (ignored by Git). This longer check used Node/WASM; the browser end-to-end run used 99 spectra. The browser report was exported before reloading the final layout. The user's project models and saved fit parameters were retained, and the dialog was restored to Gaussian/999/seed 7811 for another run. The exported diagnostic project and measured-data validation reports stay outside tracked source files.

A regression verifies recovery of a stalled simulated fit on identical observations, matching nested-model constraints, recorded bounded budgets, unchanged inputs, and all requested output pairs. Persistent failures are still rejected. The full suite passed 14 Rust, 24 JavaScript, and 144 TypeScript/DOM tests; production builds and the updated comparison/dialog checks passed.

## Model comparison and parametric bootstrap (preview.15)

The comparison dialog evaluates two models of the same spectrum, overlays their total curves and data-minus-model residuals, and reports site/parameter counts, dof, objective, reduced objective, and convergence status. The bootstrap conservatively verifies appended-site nesting, including common fixed values, bounds, links, background, weighting, and physics settings, then independently checks the zero-added-intensity embedding through WASM. Unsupported model pairs remain visually comparable.

Twelve new tests cover nested-model eligibility, random-sampler moments and integer support across low/high Poisson means, Gaussian moments, doubled self-paired turnaround variance, seeded reproducibility, Monte Carlo resolution, actual compiled-WASM Gaussian signal/null comparisons, actual Poisson count-weighted comparisons, failure/no-convergence/incomplete-search/worse-fit rejection, active-bound stationarity, zero-count rejection without clipping, dialog result invalidation and stale-message handling, unmount cancellation, and the worker client. The Gaussian signal test repeats the complete 99-pair run and verifies identical results and unchanged input models. These are regression examples and algorithm checks, not a broad empirical calibration of false-positive rates across all Mössbauer models.

The core now reports a separate normalized, bound-projected residual-gradient stationarity diagnostic. NumericalNoProgress/SolverFailed fits may be accepted by the comparison only when that diagnostic is finite and ≤1e-6. Solver flags/codes remain unchanged; MaxIter is not accepted through this exception. Simulation reports retain objectives and convergence/termination/stationarity/rank diagnostics for every pair. No synthetic datasets are silently excluded.

An in-app Chromium check loaded an isolated synthetic two-site workspace, completed a 99-spectrum Gaussian test, displayed p=0.01 with 95% Monte Carlo interval [0, 0.037353], canceled a separate 4,999-spectrum run, reran successfully, and downloaded the JSON report. Inspection confirmed 99 improvements and 99 paired diagnostic records, explicit noise/seed, and observed data. The dark comparison layout and residual overlays were visually inspected. The test did not modify either project model.

Before automatic recovery was added, a more demanding check using the freely fitted synthetic sextet+doublet example deliberately exercised failure handling: the one-start run rejected an unresolved fit, and an eight-start/1,000-iteration run stopped at simulation 13 when the larger fit reached MaxIter with stationarity approximately 0.084. Neither run reported a p-value. Some nonlinear alternatives therefore require tighter scientifically justified constraints or more successful optimization before a significance test is available; this feature does not guarantee that every proposed comparison will complete.

Validation: Rust/WASM and TypeScript/Vite production build passed; the full suite passed 14 Rust, 24 JavaScript, and 143 TypeScript/DOM tests. The preexisting Vite large-chunk advisory remains.

## In-place names and persistent workspace controls (preview.15)

Spectrum/model names now edit directly in their rows. Double-click selects the existing name; Enter or blur commits a trimmed nonempty name, Escape cancels, and an empty edit retains the previous name. Renaming an inactive model targets that model and preserves the current plot, completed fit, and uncertainties. Spectrum/model headers use +/− controls, and model context-menu actions remain available. Both sidebar toggles use one mirrored icon component; Undo/Redo use drawn SVG icons.

Fresh sessions start with the project browser collapsed and fitting options open. Explicit panel choices still restore from autosave. Fitting options remain docked even in narrower windows and do not close on plot clicks; Edit xVBF distributions reopens the panel when hidden. Persistent scrollbar tracks/thumbs are rendered for overflowing sidebar areas because macOS can fade native scrollbars even when styled. Their positions follow native scrolling, resize, clipping, and panel visibility; dragging, wheel scrolling, and track clicks are supported.

New DOM tests cover inline-name commit/cancel/focus behavior and persistent-scrollbar drag/wheel/track scrolling plus removal when overflow ends. Chromium checks passed for in-place spectrum/model rename, inactive targets, Enter/Escape/blur, Undo/Redo, rename flush before reload, default dock states, +/− removal and Undo, docked options across plot clicks and window resizing, reopening xVBF, eight-component scrolling, idle scrollbar visibility, and scrollbar dragging. The synthetic layout fixture still contains 15 spectra and 10 models per spectrum. Light/dark and inline-edit screenshots are `test-results/sidebar-d/refined-light.png`, `refined-dark.png`, and `inline-rename.png`.

## Collapsible project and options sidebars (preview.14)

Layout D is implemented: the project browser spans the editor/results height, with independently scrolling spectrum and model lists separated by a draggable divider. Arrow keys/Home/End resize the focused divider; double-click resets it. The browser collapses to a slim rail. The right fitting-options sidebar collapses independently and opens as an overlay at widths of 1,100 px or less. Both collapse states and the split are retained by browser autosave; older sessions acquire default panel settings. Model context menus, inactive-model targeting, selection, completed fits, uncertainties, and whole-project saving are retained.

Two new regressions cover divider dragging/keyboard limits/reset, project collapse/restore, spectrum keyboard selection, independent panel flags, layout migration/round trips, and invalid split sanitization. The complete suite passes 14 Rust, 24 JavaScript, and 96 TypeScript/DOM tests (134 total). The production Rust/WASM and TypeScript/Vite build passes.

Chromium workflow checks with 15 synthetic spectra and 10 models per spectrum passed for divider dragging/reset/reload persistence, independent collapse/restore and reload, spectrum search/selection/rename, model keyboard selection, inactive-model duplicate/remove/rename and Undo, full-project export, narrow-window overlay opening/header-close/outside-close, and absence of document-width overflow at 800×700. The saved scientific workspace and current objective were unchanged by panel adjustments. At 1440×900, collapsing the project browser increased the spectrum SVG width from 720 to 902 px; hiding fitting options gave the plot another 250 px. At 800×700 with navigation expanded and options hidden, the SVG retained approximately 385×294 px. No page errors were observed. Light/dark, collapsed, compact, and overlay screenshots are under `test-results/sidebar-d/`.

## Multiple spectra and model alternatives (preview.13)

Model tabs now provide a context menu with Duplicate, Rename, and Remove, also available through Shift+F10. Actions explicitly target the clicked model, including inactive alternatives; opening the menu does not switch models. Removing an inactive model preserves the current selection, and removal remains undoable. A DOM regression covers targeting, keyboard navigation, Escape/outside dismissal, disabled actions, and last-model protection. The complete suite now passes 14 Rust, 24 JavaScript, and 94 TypeScript/DOM tests.

The navigation study under `test-results/navigation-study/` compares the current horizontal strips with three visual mockups: a compact spectrum picker plus wrapped model buttons, a vertical project tree, and stacked spectrum/model lists. All use the same synthetic project with 15 spectra and 10 models per spectrum (identical example data repeated for layout testing, not a simulated temperature dependence). Screenshots were inspected at 1440×900; the vertical variants were also inspected at 1280×800. The alternative layouts are presentation mockups, not implemented navigation modes.

The project collection stores observations/raw counts and velocity calibration once per spectrum. Named models own their sites, bounds/links, background, source settings/reference, completed-fit diagnostics/uncertainties, selected site, and elapsed time. Shared folding/velocity-axis changes invalidate all affected models while other spectra retain their fits. Model edits remain independent. New empty models clear background links that would otherwise refer to removed sites.

Ten compiled-WASM-backed collection regressions cover independent duplication/editing, spectrum/model selection, recalibration invalidation, source-setting isolation, numerical-model identity for curve caching, empty-model link cleanup, whole-project round trips, tampered inactive fits/data, legacy single-spectrum import, undoable removal, and malformed collection rejection. New project files retain the established per-model scientific binding; every model is checked on reopen without optimization. Counts are not duplicated inside model entries.

The complete suite passes: 14 Rust tests, 24 JavaScript tests, and 93 TypeScript/DOM tests. The Rust/WASM and TypeScript/Vite production build passes.

Headless Chromium checks against the production build passed for fitting and duplicating the synthetic example, independent edits/fits, preserving focused edits when switching models, restoring each fit/objective, retaining zoom between models of one spectrum, importing two spectra together, searching/selecting spectra, renaming a project/model, whole-project download/reopen, empty models, removal/Undo, and IndexedDB reload recovery. Additional browser checks passed for migration of a fitted legacy session with its rounded nuclear constants unchanged, retaining the old local-storage entry, committing a focused site name before immediate reload, fallback when IndexedDB is unavailable, and a visible autosave warning when both storage mechanisms fail. No browser page errors were observed.

Light/dark screenshots were inspected at 1440×900, 1280×720, and 800×700. Compact navigation reduces its height on shorter windows; the 800×700 spectrum SVG retains approximately 214 px of height, with no document-width overflow. Screenshots are under `test-results/multi-project/`. These are workflow/layout checks, not new scientific validation of spectral models. Batch, sequential, and global fitting remain outside this change.

- Production build: Rust/WASM, TypeScript checks, and Vite static build passed.
- Rust: 12 tests passed (including loops over all 12 site/profile combinations).
- JavaScript/WASM: 21 tests passed.
- UI, numeric-input, snapshot-history, and session tests: 25 tests passed.
- Actual in-app browser: production worker loaded without console errors; synthetic thin-absorber fit converged in 8 iterations (91 ms observed on this machine, not a benchmark).
- Actual in-app browser: full-transmission fit showed intermediate accepted parameters/curves (iteration 3 observed while the solver was running), then converged in 9 iterations (445 ms observed).
- Browser project save/reopen preserved the model and numerical parameter values; loaded projects deliberately clear active fit diagnostics.
- Browser checks exercised rectangle zoom, right-click unzoom, deleting every site, two-click singlet definition, and the first two steps of doublet definition. Full doublet/sextet initialization is covered by parameter tests; pointer handling is covered by DOM tests.
- Final rendered layout: document height and viewport height both 1,314 px; no page-level vertical overflow. DOM bounding boxes confirmed that axis titles do not overlap tick labels. Rounded axes were inspected visually.
- MATLAB reference checkout is unchanged at d201482b7990afbd0e2dcc23e306bfc8d60a5049.

No MATLAB runtime or measured reference spectra were available. Expression fixtures are independently transcribed, not MATLAB execution outputs. See PORTING.md for scientific conventions, differences, and unported features.

## GUI refinement

- Duplicate fit diagnostics and explanatory text were removed from the plot area; detailed notes remain in Help.
- A named doublet was redefined in the real browser. Its name and site count stayed unchanged; the second site was replaced in place. Unit tests also verify preservation of fit flags, bounds, links, and sextet QS.
- The graph's bounding rectangle was identical before, during, and after peak placement (774 × 318.5625 px in the tested viewport).
- Three site rows were fully visible without scrolling: row bounds 570–604, 604–638, and 638–672 px inside a table viewport ending at 714 px.
- With five sites, the table body scrolled 27 px while the sticky header stayed at the top (540 → 539 px, the 1 px table border).
- Dragging the divider increased the results pane from 216 to 306 px. DOM tests cover pointer and keyboard resizing and the 196 px minimum.
- The document and viewport heights were both 720 px: no page-level vertical scrolling.
- Updated suite: 11 Rust, 17 JavaScript/WASM, and 4 DOM tests passed (32 total).

Final GUI check: three site rows visible, no duplicated plot status blocks, no axis-title/tick overlap, no page overflow, and no browser console warnings/errors. Updated screenshot: ../mossa-gui-refined.png.

## Site controls, residual points, and picking navigation

- Site rows have distinct selection and trash controls. Browser deletion of the unselected first site kept the selected doublet and correctly moved its selection index. Unit tests cover link remapping and deleting the final site.
- Selected site curves are drawn last, at 2.8 px versus 1.3 px for other sites. Browser inspection confirmed the selected group is the last plotted layer. Full-transmission absorber overlays are explicitly display-scaled (see PORTING.md).
- Residuals are circles, not a connected path. The 512-point example rendered 512 residual markers.
- Rectangle zoom, wheel zoom, right-click unzoom, and double-right-click reset were exercised while picking remained active. The phase stayed 1/3 after navigation; subsequent peak clicks advanced normally, and the doublet definition completed after zooming between its clicks. DOM tests additionally exercise right-drag panning in picking mode.
- The lower-right picking hint overlays the plot with pointer events disabled. Plot geometry before and during picking stayed 774 × 318.5625 px at the same position.
- The final browser fit converged in 7 iterations (94 ms observed). No console warnings/errors, axis overlap, or page vertical overflow were observed.
- Updated suite: 11 Rust + 19 JavaScript/WASM + 7 DOM tests = 37 passed. Production TypeScript/Vite build passed.
- Screenshots: ../mossa-site-controls.png and ../mossa-picking-popup.png.

## Selected-site editor and total curve

- The site list has a separate compact scroll area. Numeric parameters come first in the editor; the gear opens site metadata, the Add button opens creation choices, and background controls are in Gen.
- At 1280 × 720, all eight sextet/pseudo-Voigt value fields were fully visible at editor scrollTop 0. The last field ended at 391.734 px inside an editor ending at 394.406 px. The document height matched the 720 px viewport.
- Browser editing changed CS to 0.04 and updated the results table. Changing the line profile through the settings popup exposed the eighth parameter. Starting Singlet creation through Add and canceling preserved the two existing sites.
- The total model path and legend are black; the selected site remains colored and thicker. The DOM plot check asserts the total path stroke.
- Production TypeScript/Vite build passed. All 38 checks passed: 11 Rust, 19 JavaScript/WASM, and 8 DOM tests.
- Screenshot: ../mossa-parameter-panel.png.

## Numeric display, adjustable site list, spectrum hint, and history

- Numeric labels are right-aligned. Fields show up to five significant digits and reveal full values on focus. Tests cover unchanged focus/blur preserving exact precision, edited values committing once, Escape cancellation, invalid input, and very small values.
- With five sites loaded at 1280 × 720, the default list was 104 px high (four full rows). Keyboard resizing expanded it to 130 px and all five rows were fully visible. Pointer and keyboard resizing are covered by a UI test; selected rows scroll into view. Results default to 200 px and retain the 196 px minimum.
- With four list rows and the default results height, all eight sextet/pseudo-Voigt fields fit at editor scrollTop 0: the last field ended at 429.734 px, inside the editor ending at 432.406 px. The page height remained equal to the 720 px viewport.
- The picking hint is positioned from the spectrum plot's bottom coordinate, above the residual region. Browser bounds confirmed the hint ended at 336.531 px while the spectrum ended at 344.516 px in the tested initial geometry. Navigation/picking tests assert that the hint remains above the spectrum bottom.
- History tests verify restoration of spectrum data, parameters, fit flags, bounds, links, raw data, and import metadata; the 50-step limit, redo branching, and no-op behavior are covered.
- Browser checks verified exact CS 0.123456789 displayed as 0.12346, full-value focus, unchanged blur adding no history entry, and Undo/Redo of parameter changes and site deletion. Keyboard undo worked outside numeric fields.
- A completed fit converged in 8 iterations (90 ms observed). One Undo restored its starting CS of 0.02; Redo restored the fitted CS of 0.12043576274943121. Importing 128 raw channels and undoing/redoing restored the dataset, filename, raw-control availability, and fold-center values (256.5 versus 64.5).
- Full suite: 43 passed (11 Rust, 19 JavaScript/WASM, 13 UI/history/formatting). Production TypeScript/Vite build passed; affected UI tests also passed after final layout adjustments. Browser console had no warnings or errors.
- Screenshots: ../mossa-editing-history.png and ../mossa-spectrum-hint.png.

## Local autosave, inline naming, and duplication

- Versioned local autosave retains the current project and preprocessing, selected site, option tab, panel dimensions, and completed-fit summary. Curves are recomputed after reload; spectrum/component arrays are not duplicated in fit metadata. Undo history starts fresh after reload.
- Tests cover full-precision round trips, zero-site projects, invalid versions/data, missing or unavailable storage, layout sanitization, fit-summary serialization, and committing a focused name before the pagehide save. Storage errors leave manual project export available and produce a visible local-save warning.
- Browser checks renamed a site, verified list/table updates, and used Undo/Redo. The name field is now visible above the selected parameters; type/profile remain under the gear.
- The Duplicate control is an icon without visible text. Browser duplication selected a new site with the copied name and values; one Undo removed it. Unit tests verify independent parameter objects, exact values and settings, internal-link remapping, external-link preservation, unique names, invalid selections, and the 16-site limit.
- An immediate reload while the name was still focused preserved “Reload during edit.” A focused numeric draft of 0.345678912345 also survived reload exactly. The selected third site, Bnds tab, 224 px results preference, and 130 px site-list preference were restored; Undo correctly started empty.
- A fit converged in 8 iterations (92 ms observed). Reload retained its full-precision CS, all eight uncertainty values, convergence status, and enabled parameter export. Raw import and reload retained history-counts.txt, the 64.5 fold center, raw-control availability, and the folded background value. Deleting every site and reloading restored a zero-site project with duplication disabled.
- Before testing, the original current project was exported. After testing, it was restored; exported name, full project data/parameters, and preprocessing matched the checkpoint exactly. The original browser tab was upgraded to the new version and restored this project. Its document and viewport heights were both 1,211 px, with no page overflow or browser console warnings/errors.
- Production build and all 50 automated checks passed: 11 Rust, 21 JavaScript/WASM, and 18 UI/session/history checks.
- Screenshot: ../mossa-autosave-duplicate.png.

## Quieter parameter inputs

- Selected-site numeric fields use faint bottom separators instead of full idle outlines. The 18 px fields sit in the existing 20 px rows, leaving 2 px between adjacent fields without increasing editor height.
- Hover/focus emphasizes only the active field. Keyboard focus uses an inset outline, so it does not overlap neighboring rows; invalid values retain the red error treatment.
- Production TypeScript/Vite build passed. Browser inspection confirmed field heights, spacing, transparent idle top borders, and inset focus styling. Document and viewport heights both remained 1,211 px.
- Screenshot: ../mossa-quiet-inputs.png. This change is CSS only; numeric editing and model calculations are unchanged.

## Shared fields and adaptive fit details

- Numeric fields and dropdowns now share the same idle separators, hover styling, inset focus, disabled appearance, and invalid-value treatment. Existing compact left-panel heights and larger right-panel heights are retained. Browser inspection confirmed transparent top borders and matching separators for site parameters, background, general options, and bounds.
- Fit diagnostics use normal flow inside the status card instead of an absolutely positioned details popup. The status text stays above the toggle and diagnostic body. A ResizeObserver measures spare parameter-editor space; automatic expansion compensates for its own height to avoid open/close oscillation.
- A DOM test covers compact manual expansion/collapse, automatic expansion when more space is available, repeated stable measurements, and collapse when space is reduced. The complete UI/session/history test suite passed (19 tests), and the production TypeScript/Vite build passed. Numerical code was unchanged.
- Browser fitting on an isolated QA origin converged in 8 iterations (90 ms observed). Details appeared automatically in the default 1280 × 720 layout. Expanding the results pane to 340 px collapsed details; manual expansion/collapse then worked normally. The current status ended at 301.469 px, the toggle started at 306.469 px and ended at 322.469 px, and diagnostic content started at 328.469 px. The page height remained 720 px.
- The user's existing fitted project was preserved when updating the main preview: CS remained 0.12043576274943121, all eight uncertainty values remained visible, and convergence status retained 8 iterations/89 ms. Details appeared automatically in the taller viewport. No browser warnings/errors or page overflow were observed.
- Screenshots: ../mossa-consistent-inputs-fit-details.png and ../mossa-fit-details-restored.png.

## Parameter errors and intensity fractions

- The live main project had no current fit result after a site deletion; its retained parameter values were starting values for the changed model. The table now explicitly shows Fit for errors in this state, while fixed/unavailable std values are distinguished. Fitted errors appear on their own readable line with two significant digits. Three sites remain fully visible at the default results height (row bounds 586–625, 625–664, 664–703 px; viewport ends at 714 px).
- Fraction (%) follows the MATLAB intensity normalization. Raw intensity remains a separate column. The Rust fit output now includes percentage values and correlated std estimates; it stores the derived results without serializing the full covariance matrix.
- An analytic Rust test checks propagation against a known correlated 2×2 covariance, omitted uncertainties for active bounds/rank deficiency, exact linked ratios, and zero total intensity. Fixed/single-site percentages and compiled-WASM percentage output are also checked. UI/helper tests cover normalization, links, missing errors, metadata-only edits, displayed uncertainty/fraction cells, and row selection. Session tests retain the new percentage results while allowing older fit summaries.
- Production Rust/WASM/TypeScript/Vite build and all 56 tests passed: 12 Rust, 21 JavaScript/WASM, and 23 UI/session/history checks. Affected table/session tests also passed after final formatting refinements. The MATLAB checkout remains unchanged.
- Browser fitting yielded 76.93 ± 0.10% and 23.07 ± 0.10% for the synthetic example (std in percentage points; full fraction std 0.10434292616995686). Eight parameter errors and two fraction errors were visible and survived reload. Renaming and Undo/Redo of the name preserved them; adding a duplicate cleared the current fit and exposed the refit indicator.
- CSV export contains both raw intensities and full-precision intensity_fraction_percent rows; exported percentages sum to 100, and propagated std values are present. The main project's site names and exact selected CS value (1.1793475614453397) were preserved when updating its view. Its existing unfitted state was retained with the new Fit for errors indicator; no refit was silently applied to the user's project. No page overflow or browser console warnings/errors were observed.
- Screenshot: ../mossa-results-uncertainties.png (isolated synthetic QA fit).

## Undo/Redo of completed fits

- Fit summaries and elapsed time now live in the same history snapshots as project/data state. This keeps uncertainties, normalized-intensity errors, warnings, rank/dof/convergence metadata, and the matching parameters together. Large evaluated curve/component arrays are not copied into each history state; graph evaluation is separate from fitting. Autosave serializes the active fit once and restores it into the initial snapshot; history remains session-local.
- Two history tests cover fitted→edited→Undo/Redo, site deletion, complete fit steps, refits with unchanged parameters but changed errors/diagnostics, and metadata/selection changes. A session test verifies that history-only fit fields are not duplicated in serialized autosave. All 25 UI/session/history tests and the production TypeScript/Vite build passed. Rust/WASM numerical code was unchanged.
- Browser Undo restored the original table, model SVG path, status, and elapsed time exactly after editing CS. Exported model/data, preprocessing, and complete fit metadata matched the baseline JSON exactly. Redo restored the edited unfitted state.
- An explicit new fit converged in 8 iterations (102 ms observed). Undo returned to the edited starting state; Redo restored this fit's table and diagnostics exactly, without optimization. Deleting the doublet changed the remaining site's percentage to 100.00; Undo restored two sites, ten displayed parameter/percentage errors, and the same 102 ms completed-fit status.
- Undoing a raw-data import restored the exact prior fitted table and status. Undo/Redo of calibration controls retained graph visibility even when the underlying project object was unchanged. Reload retained the restored fit and ten displayed errors.
- The intensity percentages were already being calculated; their previous generic Fraction label could be confused with L fraction. Intensity (%) is now the first numeric column, while the unrelated pseudo-Voigt parameter is explicitly labeled Lorentz mix. The current main project displays 76.93% and 23.07%. Updating the main preview preserved its site names and exact selected CS (1.1793475614514846). No browser warnings/errors were observed.
- Screenshot: ../mossa-undo-fit-results.png (isolated synthetic QA state restored through Undo).

## Source-control checkpoint

- The prototype is a standalone Git repository. The unchanged MATLAB reference is a submodule pinned to d201482b7990afbd0e2dcc23e306bfc8d60a5049; development instructions initialize it explicitly. Generated builds, WASM bindings, dependencies, caches, and test artifacts are excluded from version control.
- Final full test run passed all 58 checks: 12 Rust, 21 JavaScript/WASM, and 25 UI/session/history tests. The production build had already passed for this implementation. Whitespace checks passed after removing incidental trailing whitespace and extra blank lines at the ends of the copied license files.

## Integration into CPrescher/MossA

- The `mossa2` branch combines the initial browser implementation history with the original MATLAB history. The legacy MATLAB branch is named `main` and retains commit d201482b7990afbd0e2dcc23e306bfc8d60a5049 unchanged.
- `reference/MossA` is now ordinary tracked source rather than a submodule pointing back to this repository. Its complete Git tree is exactly 0dcc27b4acb4f8f418ab1827f14e2e2cf74339b0, matching the original MATLAB commit, including file contents and modes. No recursive submodule checkout is required.
- The production build and all 58 tests passed from the relocated working checkout. The existing preview continued serving the same build through its compatibility path; its browser address was preserved.


## Measured SYNCmoss SMS transmission comparison

The measured α-Fe SMS standard and its embedded three-Gaussian source profile were taken from SYNCmoss commit `b712fbc1521004a47409b964b9ab012fe5c5e255`. The exact, unmodified upstream `models.TI` engine was executed with verified source hashes. Source width/area, response handedness, centroid, optical-depth area, and magnetic line-position conventions were explicitly converted. Identical absorber parameters were evaluated without independent optimization; native SYNCmoss Sextet/Doublet calculations also agreed with the explicitly matched-line representation.

For the measured standard’s 511 velocities, the maximum MossA–SYNCmoss difference was 0.000128 counts (2.13e-8 of the continuum), with RMS 0.0000143 counts. Mixed-site and more strongly saturated controls also passed a 1e-7 continuum-relative maximum-error criterion. The common-grid control differed by at most 1.21e-10 counts. SYNCmoss convergence was checked from 64 through 2048 nodes. A deliberately reflected source differed by up to 311 counts.

This comparison identified up to 0.21 counts of off-grid interpolation error in the initial Gaussian-source path. Six-point local polynomial interpolation replaced PCHIP for that source family; legacy interpolation is retained. The regression fixture contains actual upstream output, and a reproducible harness pins and verifies the upstream engine. Full provenance, predictions, figures, and a reopenable MossA project are in [validation-data/syncmoss-sms/README.md](validation-data/syncmoss-sms/README.md).

The representative natural-width powder sextet gives reduced χ² approximately 0.975. This validates the numerical full-transmission calculation for the tested scalar isotropic Lorentzian cases. It does not validate source extraction from a measured singlet, sample phase assignments, polarization, texture, relaxation, or general Voigt parity.


## Automatic limits include displayed spectrum curves

Automatic spectrum Y limits now include the observations, total model, background, and the same display-scaled site arrays used to draw the curves. Only points inside the current velocity range and visible site curves participate. Manual Y limits remain fixed; Reset view and complete unzoom restore automatic limits.

All seven plot DOM tests passed, including regression checks for an elevated full-transmission baseline, site curves extending below the data, Reset view/Unzoom, site visibility and temporary highlighting, and preservation of manual Y zoom. The TypeScript/Vite production build passed. In the user's existing full-transmission browser project, the background was above the old automatic upper limit. After reloading the updated build and using Reset view, the baseline, model, and all three site paths were inside the main clipping region. Visible parameter values, their full-precision titles, and the completed fit table matched the pre-update state exactly.


## SMS tutorial, checked import, and velocity reversal (preview.16)

The SMS tutorial now uses the four original supplied measurements without conversion or byte changes. SPEC MCA import checks channel declarations and continued count rows and retains acquisition headers, including the unresolved 01GPa/02GPa filename discrepancy. The supplied five-column singlets select the recorded velocity/total columns 1–2 after consistency checks; import selection is visible and saved with references.

New regressions cover malformed/truncated/extra/multiple SPEC blocks, channel declarations, five-column selection and rejection, original measurement parsing, paired velocity negation, ascending axes, raw-count retention, recalibration/folding after reversal, fit invalidation across model alternatives, Undo, portable projects/autosave, format guards, and changed preprocessing detection. Poisson simulations follow the doubled self-paired turnaround when reversal moves it to the last observation; variance and dialog wiring are tested. The final complete suite passed 14 Rust, 29 JavaScript, and 157 TypeScript/DOM tests (200 total). The app build and combined Pages build passed; the manual's 896 internal links passed its generated-link check.

New browser-core source fits with fixed absorber width 0.215 mm/s give approximately 0.41597 and 0.45599 mm/s, averaging 0.43598 mm/s, reproducing the original tutorial's quoted ~0.436. All five sample model stages converged, and all seven ordinary model fits in the combined project survived save/open using the current compiled WASM. The dedicated source-calibration fits are retained separately from fixed-source display fits. These are new browser refits, not direct MATLAB execution outputs or certified reference values. The sample pressure labels remain unresolved, and source/calibration uncertainties are not propagated into its sample-fit std.

Actual-browser checks passed for original MCA file import and accepted extension, preserved 1,024 raw counts and headers in downloaded projects, reversal with Undo/Redo, reload persistence, retained reversal after preset recalibration, original five-column reference import in the source dialog, both source fits, and saved column-selection provenance. Eleven SMS screenshots illustrate velocity/source calibration, detected columns, MCA headers, reversal, progressive sextet models, intensity links, and the final fit. Screenshot capture metadata identifies the local browser build; numerical worked results remain separately labeled.

The rendered SMS chapter was also checked on desktop and at 390 × 844 pixels. Manual search returned the chapter, screenshot enlargement and Escape/Close worked at both sizes, and the temporary viewport override was reset. The final chapter preview is recorded in `test-results/sms-tutorial/manual-preview.png` (local validation artifact).

## Manual screenshot themes (2026-11-07)

All 31 application screenshots now have actual dark-mode captures paired with the original light versions. The Markdown build supplies 37 paired placements across the manual; each pair retains the same descriptive alt text, and a missing dark capture fails the build. No screenshot was inverted or recolored. The app's publication figure preview retains its white page inside the dark interface.

The manual build and its 933 local links pass. Browser checks verified Light, Dark, and Auto selection, matching full-size preview links for both themes, the first-fit image outside the screenshots directory, and the dark preview at 390 × 844 pixels. The viewport override was reset. Print CSS selects the light capture. Capture provenance is recorded in the screenshot ledger; local chapter previews are `test-results/manual-preview/manual-light.jpg` and `manual-dark.jpg`.

## SYNCmoss tutorial and physics foundations (2026-11-07)

The new SYNCmoss tutorial redistributes three byte-identical inputs and the MIT notice from pinned upstream commit `b712fbc1521004a47409b964b9ab012fe5c5e255`. The generation script checks all four Git blob hashes. `Calibration.dat` and `Standard_CMS.dat` have identical numerical observations and are explicitly identified as the same dataset. Generated projects, source-conversion records, provenance, and fit-result records include the complete upstream copyright/permission notice and the Yaroslavtsev (2023) reference.

Two independent measured standards have four new production-WASM teaching fits: empirical CMS Lorentzian/pseudo-Voigt sextets and SMS transmission with supplied three-Gaussian / fixed squared-source control. All converged without warnings, and every fit survived reopening with its model/data binding. The CMS reduced observed-count objectives (~17.49 and ~17.21) remain poor and are described accordingly. The supplied-source SMS case gives ~0.97482; the deliberate fixed-source control gives ~3.09719. These are new MossA results, not exported SYNCmoss author fits or reproductions of the paper's component model. Full source/velocity/geometry limits remain explicit.

Actual-browser checks passed for direct original CMS/SMS import, preservation of all 511 supplied SMS velocity/count pairs, refitting both starting projects, and saving the SMS fit with all three source components. Eight new app screenshots were captured independently in each theme. Two additional original calculated figures have separately rendered theme variants and are labeled as calculations, not measured data or screenshots. Their scripts and capture provenance are retained.

Three linked foundations chapters explain recoil-free absorption, Doppler velocity, hyperfine interactions, line profiles, and the scalar full transmission integral. The mapping to current code includes normalization of the sextet's six line areas, legacy squared-profile FWHM, the source-centering convention, finite-grid/interpolation behavior, the background formula, and observed-count weighting. The squared-profile half-maximum relation was checked in compiled WASM, and source normalization/centroid and sextet-area identities were checked separately (`test-results/syncmoss-tutorial/equation-audit.json`). All seven targeted source/actual-SYNCmoss regression tests pass.

The browser rendered all 27 display equations in the foundations with zero KaTeX errors. Desktop and 390 × 844 layouts were inspected, with page width equal to viewport width for the wide sextet expressions. Original SMS download bytes match the supplied file, theme-specific enlargement links select the appropriate capture, and search finds the new physics pages. Search indexing excludes duplicate MathML/TeX copies while retaining accessible math on the page. The viewport override was reset. Source-access limits and exact evidence locations are recorded in `manual/RESEARCH.md`.

The final combined Pages build passes, including the application TypeScript/Vite build and 1,283 local-link checks across 21 generated HTML files. Static output checks verified 50 paired image placements, matching alt text, no KaTeX errors, original input hashes, full embedded license text, and exact browser-imported SMS velocity/count arrays. Local review screenshots are `test-results/syncmoss-tutorial/physics-light.jpg` and `manual-dark.jpg`. All changes remain local.


## Manual Pages publication and reserved classroom exercises (2026-11-07)

The latest manual adds the detailed F-test/simulation explanation, arithmetic
control, production-WASM bootstrap replay, worked reports and projects, and
completed comparison screenshots in both themes. The separate classroom
exercises, their raw data, solutions, combined project, and dedicated screenshots
are excluded from source and generated output. Shared workspace/import/folding
screenshots now use the almandine-only project. The public course-data generator
exports only almandine. Original course files remain unchanged.

Documentation updates were prepared in isolated checkouts of the newly established
main/develop release layout, preserving their application source and Pages
workflow. Stable and preview manuals each build 21 pages; local-link checks pass
1,308 and 1,297 links respectively. The main checkout's full suite passes 14 Rust,
35 JavaScript, and 162 TypeScript/DOM tests (211 total). Seven targeted preview
routing, storage, and lesson tests also pass in the develop checkout. Application
TypeScript/Vite and combined Pages assembly pass for main.

Generated output checks confirm local replay/script/download paths in each base,
no KaTeX errors in the new chapter, and no reserved classroom paths or textual
references on either site. Relative replay URLs keep the animation within its
own manual, and the preview link processor supports data-source attributes.
No application source, desktop release workflow, or version tag is changed.

## Visible manual link in app header (2026-11-07)

The app header now includes a labelled Manual link beside Help. It opens the
bundled manual in a separate tab, retaining the current analysis. Its relative
`./manual/` URL follows the release, develop-preview, and offline desktop base.
The visible label remains at narrow widths; the book icon is omitted below
480 pixels. Light and dark themes have distinct bordered styles and retain the
existing keyboard-focus outline.

The three desktop routing/export regressions and the TypeScript/Vite build pass.
Browser inspection confirms the header link at 1,280 and 390 pixels, no horizontal
page overflow at 390 pixels, and keyboard activation opens the local manual in
another tab. The viewport override was reset. Local screenshots are retained in
`test-results/manual-link-qa/` in the shared working checkout.

## F-test and added-site teaching chapter (2026-11-07)

The new foundations chapter explains nested models, independent parameter counts,
SSE and residual degrees of freedom, the extra-sum-of-squares F formula, and the
regular linear-Gaussian setting for its exact reference distribution. It explains
boundary intensities and unidentified shape parameters, and distinguishes the
classical F tail from the current app's parametric-bootstrap objective-gain tail.
Primary evidence and the audited implementation locations are in `manual/RESEARCH.md`.
No app inference code was changed for this documentation work.

An interactive arithmetic control and a pausable bootstrap replay use local assets
and the manual theme. Three original synthetic fixed-shape examples use actual
production-WASM fits: absent extra line p = 0.28, weak line p = 0.04 (Monte Carlo
interval crosses 0.05), and clear line p = 0.005. Each retains all 199 simulated
fit pairs, observed and simulated warnings, full numerical reports, and a portable
project. All six observed model fits survived reopening. The replay data are saved
results, not a second fitting implementation or an analysis of user data.

Four new lesson tests pass for the arithmetic, histogram tail accounting, actual
replay data/results and case resets, reduced-motion completion, and fetch-failure
fallback. All 23 targeted comparison, dialog, and worker-pool regressions pass.
The combined Pages build passes its TypeScript/Vite and manual checks, including
1,408 internal links across 22 generated pages. Generated output checks verify
both custom components, local replay assets, exact project download bytes, two
new screenshot theme pairs, and no KaTeX errors in the new chapter.

Actual-browser checks verify single stepping, play/pause, final histograms for all
three cases, the F calculator buttons and keyboard slider, Light/Dark themes,
search for F-test, and theme-specific full-size screenshot previews. Repeating
the absent and weak comparisons in the real app gives the exact same exceedance
counts, p-values, and intervals as the saved lesson reports; maximum simulated
gain difference is below 6e-12 from refitting saved starts. The two completed
results have separately captured light and dark screenshots with build provenance
in the capture ledger. Local checks and previews are under
`test-results/comparison-tutorial/`.

The browser's requested 390 × 844 viewport override did not change its actual
1,280-pixel viewport in this session, so a narrow-screen visual check is not
claimed for this addition; the override was reset. Reduced motion was checked in
the DOM tests, not through an emulated browser media preference. The local manual
preview remains available on port 4176 for trying the animation. No publishing,
commit, or push was performed.

## Classroom exercises excluded from manual (2026-11-07)

At the instructor's request, the augite/omphacite chapter, navigation and cross-links,
raw measurements, dedicated foil, worked solutions, and combined three-sample
project were removed from the manual build sources. The public course-data
script now exports only almandine. Regeneration completes all four almandine
model stages and verifies their saved fit bindings on reopening. Its two original
input hashes still match the retained provenance record.

Workspace, raw-count-import, and folding illustrations now use a real almandine-only
project, captured separately in light and dark mode. The capture ledger and
captions were updated. Removed manuscript/data/image copies and the previous
full exercise generator are backed up under ignored
`test-results/reserved-class-exercises/`, outside public and build sources.
The three original classroom measurements in Dropbox retain their exact SHA-256
hashes. Original handouts and course materials were not edited.

The revised manual builds 21 pages and passes 1,308 local-link checks. It was
reassembled into the existing app Pages artifact without rebuilding or changing
app code. Both `manual/dist/` and `dist/manual/` were scanned for retired chapter,
asset and data paths and textual references; none remain. Both contain an
almandine-only downloadable project with four model alternatives. The change
remains local and has not been committed, pushed, or deployed.
