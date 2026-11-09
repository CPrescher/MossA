# MossA 2.0.0-rc.1 qualification

This prerelease is intended for evaluation before stable MossA 2.0.0. Its scope
and limitations are also included in the [release notes](release-notes/2.0.0-rc.1.md)
and the bundled manual's [validation reference](manual/src/content/docs/reference/conventions-and-validation.md).

## Candidate scope and review

The candidate starts from `c56ddaf`, including the fixed-policy F-test changes
and compact native comparison/preparation implementation. Remaining tracked
workspace changes refresh the manual screenshots, capture scripts and navigation
help, plus the beginner-video link/player and its styling. The browser manual
retains the online player; the offline desktop manual keeps the explicit video
link and omits the remote iframe. All 92 screenshot records matched their recorded SHA-256 values during
review. Captures identify their original source/engine revision and are not
presented as new rc.1 numerical measurements.

Release preparation synchronizes package/Cargo versions and lockfiles, adds an
rc.N numeric MSI mapping, pins desktop-manual source links to the build commit,
uses reviewed release notes in the staging helper, packages a matching browser/manual
ZIP without deploying it, and shortens the README.
A packaged macOS smoke test exposed late native progress callbacks overwriting
completed values in the editor/results display while the saved model remained
correct. Request-scoped channel guards and completed-fit token invalidation fix
that race; a failing-before/passing-after editor regression covers the callback
order. Existing analysis conventions and portable projects are retained.

Local `output/` and `assessments/` directories, untracked exploratory datasets,
expanded benchmark runtimes and raw evidence archives are not candidate source
or installer payload. Tracked regression fixtures, benchmark summaries and hash
receipts remain available. Reproducing historical complete timing studies can
require the separately recorded raw archives and the original platform.

## Checks on this candidate

Local checks below passed before tagging on Apple Silicon macOS with Node
26.12.1 and Rust 1.99.1. CI artifacts and the draft release's
`build-provenance.json` provide the immutable distribution source/build identity.

| Check | Result |
| --- | --- |
| Shared Rust/core and compiled WASM regression suite | Passed: 97 Rust tests plus compiled-WASM cases |
| JavaScript/React regression suite | Passed: 468 JavaScript/UI tests |
| Native backend integration/parity/cancellation | Passed: 22 tests after the progress fix |
| Release/notarization helper tests | Passed: 5 tests; all workflows and the signing template lint cleanly |
| Browser build | Passed; app/manual ZIP verified (289 files, matching embedded build identity) |
| Manual build and local links | Passed: 21 pages and 1,381 local links |
| Desktop payload/offline-asset verification | Passed: 284 files and 365 local asset references; native fitting backend; no remote iframe |
| macOS native command tests and package build | Passed: 8 command tests and release-mode app bundle |
| Tagged cross-platform installer matrix | Required for draft assembly; see linked CI and build provenance |
| Universal Mac signing/notarization/stapling | Required for draft assembly; verified by the release helper |

The local GUI smoke test used a separate `MossA RC Validation` application
identifier and storage. It reproduced the late-progress display race, then
verified the fix on the rebuilt app: the synthetic sextet displayed CS
0.12043509231569473 mm/s and BHF 33.10048533639973 T, matching the saved project.
Native Save As and cancellation, restored autosave, local manual access/search
(18 results for “calibration”), and the visible release-candidate limits passed.
These are synthetic workflow checks, not new measured-data validation. The test
app was an ad-hoc-signed modified-worktree build; the separate tagged CI builds
supply the clean distribution identity and signed universal Mac artifacts.

A successful build, headless test or local-asset check does not establish physical
network disconnection, packaged GUI correctness on another OS, or compatibility
with every supported OS version.

## Scientific evidence and limits

- Ordinary profiles, synthetic fits, bounds/links, calibration/folding,
  analytical derivatives, direct transmission convolution, save/reopen and native/WASM
  execution have tracked regression cases. The public measured-data audit and
  selected actual SYNCmoss comparisons add case-specific experimental evidence.
- The [fixed F-test report](validation-data/performance/FTEST-FIXED.md) records
  12 native and five WASM comparisons passing the original minimum/rank/std and
  bootstrap classification gates. The [native pipeline report](validation-data/performance/FTEST-NATIVE-PIPELINE.md)
  records 36 paired stage comparisons with bit-exact public results and worker-count
  determinism. These are finite synthetic cases, not a global convergence proof.
- Broad comparisons with independently executed MATLAB results remain incomplete.
  Formula transcriptions are not MATLAB-generated fixtures; optimizer trajectories
  and uncertainty conventions differ.
- **xVBF and Gaussian-mixture source extraction remain experimental pending
  suitable measured-reference validation.** Numerical/synthetic tests do not fill
  that gap. Supplied-source transmission comparisons do not validate extraction.
- Parameter/fraction std are approximate local-Jacobian estimates. Fixed
  calibration/source inputs and nuclear constants contribute systematic uncertainties
  that are not generally propagated. General statistical coverage is unestablished.
- Local minima, active bounds, rank deficiency and physically inadequate models
  remain possible. Inspect warnings/residuals and compare defensible alternatives.
- The SMS tutorial retains its unresolved filename/header pressure discrepancy.

## Platform runtime checks before stable 2.0

Native GUI evidence currently covers selected macOS workflows. **Windows and
Linux runtime qualification is open** even when their CI matrix passes.
Windows signing is also outstanding. Test a packaged candidate on each target OS:

- Install on a clean system and launch without networking.
- Import measured raw-count and velocity-column spectra; fold/calibrate and fit.
- Save/reopen projects with multiple spectra/models and completed fit/std records.
- Cancel native Open/Save As, test write failures, and confirm file destinations.
- Exercise fit/comparison progress and cancellation without partial saved results.
- Export CSV, figures and PDF reports; inspect the actual exported files.
- Search offline help and save a bundled tutorial project.
- Quit/relaunch and check autosave; replace a prior preview and repeat save/reopen.

Windows Installer compares only the first three ProductVersion fields. The
fourth-field rc label is not an upgrade-order guarantee. Preserve portable
project backups during installation/replacement tests.

## Publication state

The preparation command stages a **draft prerelease** and does not publish it
or promote its source to `main`. The existing root/preview websites remain on
their respective branches. Stable 2.0 requires completion of the release review
and the platform checks above; experimental/unsupported features must keep their
explicit limits unless new evidence supports changing them.
