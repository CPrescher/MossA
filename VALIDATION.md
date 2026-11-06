# Validation — November 6, 2026

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
