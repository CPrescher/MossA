# Desktop validation

## Native Rust backend — preview.17 (2026-11-07)

The desktop target calls the shared Rust `rlib` through Tauri commands. The
browser retains WASM workers. Model equations, constants, bounds, acceptance
checks, search candidates, comparison RNG, and recovery rules are shared.

Local automated checks passed: 17 core Rust tests, 35 JavaScript tests, 187
TypeScript/DOM tests, 8 desktop Rust tests, and 6 native/browser integration tests.
The integration tests execute the production native core and session registry,
including source calibration, multistart progress, cancellation during a later
search start, queued-work cancellation, failed comparisons, and complete
Gaussian/Poisson comparisons with one and four workers. The native serial and
parallel reports match after removing worker metadata; checked native/WASM
objectives agree within the test tolerances. A browser-fitted portable project
reopens with its saved fit and uncertainties using native evaluation.

The complete desktop payload built with `src/wasm` absent, and its verifier
confirmed no fitting WASM binary. The payload contains 253 files and 350 local
asset references; the manual builds 21 pages and checks 1,308 local links. Pagefind
search has its own bundled WASM and is independent of the fitting engine.

An isolated release-mode macOS app (`MossA Native Validation`, with separate app
storage) was exercised through its actual Tauri IPC and native file dialogs.
The synthetic iron mixture converged in eight iterations. A 4,096-channel,
32-start synthetic fit published live start/iteration progress and canceled
without replacing the previous project. A four-worker comparison completed;
a second 4,999-spectrum run canceled with no simulation p-value. A completed
99-spectrum report was exported through native Save As and independently checked
for 99 outcomes, complete diagnostics, `fittingBackend: native-rust`, and
`execution: { workers: 4, backend: native-rust }`.

These checks qualify the tested implementations and cases. They do not establish
universal optimization equivalence or experimental model accuracy. Native GUI
checks here are macOS only; Windows/Linux are covered by the platform build matrix
and native command tests. Published preview.16 installers retain their original
WASM backend; this change is for preview.17 and later builds.

## Historical WASM desktop preview — 2026-11-06

Built locally on Apple Silicon, macOS 26.6.2, using Node 26.12.1, Rust 1.99.1,
Tauri 2.12.5, and Tauri CLI/API 2.12.4. Application version:
`2.0.0-preview.16`. The embedded metadata identifies commit
`6c821460f752c6b2d00fc8c6285cc1acb949f4b4` with `dirty: true`: this is a build of
the current modified workspace, not a tagged release.

### Automated checks

- Shared scientific and interface suite: 14 Rust, 28 JavaScript, and 155
  TypeScript/React tests passed.
- Native command boundaries: 2 Rust tests passed (bundled documentation routes
  and rejection of remote navigation).
- Production browser build passed alongside the desktop target.
- Final desktop build passed, including 17 manual pages and 893 local links.
- Offline payload verification passed: 181 files and 233 local asset references,
  with embedded fitting WASM, searchable documentation, fonts, screenshot assets,
  all tutorial data including SMS, and license notices.
- `actionlint` passed for `.github/workflows/desktop.yml`.
- Final application passed `codesign --verify --deep --strict` with its ad-hoc
  preview signature; `lipo -archs` reports `arm64`.
- Final DMG passed `hdiutil verify`.

### Native macOS smoke checks

The packaged app launched from `MossA.app`, serving its embedded `tauri://localhost`
assets without a development or calculation server. The synthetic iron mixture
converged in 8 iterations; the displayed BHF was 33.10048533645222 T. These are
results for the built-in synthetic example, not an independent validation of
experimental parameter accuracy or a performance benchmark.

Native Save As wrote a `.mossa` workspace containing the completed fit. SVG and
PNG exports succeeded; the PNG was 2126 × 1417 pixels at the selected 300 dpi.
The bundled manual opened in a separate window. Its local search returned 13
results for “calibration”; selecting a result opened the local tutorial. A
tutorial project download opened the native Save As dialog, and cancellation
returned to the manual without an error.

The final rebuild includes the completed SMS tutorial and its screenshots. The
tests establish local asset use and successful native workflows; they do not
constitute a physical network-disconnection test or qualification of older
macOS releases.

### Remaining distribution checks

Windows and Linux build jobs are configured but have not been executed in this
local macOS session. Their installer/runtime checks remain pending the first CI
runs and testing on those operating systems. Mac preview artifacts are ad-hoc
signed and have not been notarized. Public distribution still needs the
platform signing/release steps described in `DESKTOP.md`. No tag or public
release was created.

### Signed distribution and cross-platform CI — 2026-11-07

This follow-up supersedes the pending signing and platform-build checks above.

The Apple Silicon app and DMG are now Developer ID signed with hardened runtime
and secure timestamps, accepted by Apple, and stapled. The signing identity is
`Developer ID Application: Clemens Prescher (XWZZZ3D9F3)`.

- App submission: `9a1051b8-17aa-43a5-a0ce-4b9876bd5af4` — **Accepted**.
- DMG submission: `4045e2b4-bc6b-4af3-b52b-09c9de991dd1` — **Accepted**.
- [Signing/notarization run](https://github.com/Dioptas/Dioptas/actions/runs/42338198040)
  completed successfully using Dioptas's existing Apple credentials inside its
  GitHub runner. Credentials were not exported to the local machine or copied
  to the MossA repository. No App Store Connect API key was needed.
- The signed application records MossA source
  `adefdee708e2574d827eced40fd354b43dce7c22`, with `dirty: false`.
- Local `codesign --verify --deep --strict`, `stapler validate`, and Gatekeeper
  checks passed for the downloaded app and DMG. Gatekeeper reports
  `accepted`, `source=Notarized Developer ID` for both.
- The DMG was mounted read-only. Its contained app has a valid stapled ticket,
  passes signature verification, and has the same executable SHA-256 as the
  separately distributed app. This verifies that the installer includes the
  stapled app, rather than relying solely on the outer DMG's ticket.

The [corrected desktop CI run](https://github.com/CPrescher/MossA/actions/runs/42337727015)
completed successfully on all four targets: Apple Silicon macOS, Intel macOS,
Windows x64 (NSIS EXE and MSI), and Linux x64 (AppImage and DEB). Every target
also passed the native command tests. The shared test job passed 14 Rust,
29 JavaScript, 160 TypeScript/React, and one notarization-recovery test. The
notarization job additionally passed both updated recovery/keychain tests.

The initial Windows build produced the EXE but failed MSI packaging because WiX
requires a numeric prerelease. `tauri.windows.conf.json` now explicitly maps the
MSI package version to `2.0.0.16`; MossA and its NSIS installer retain
`2.0.0-preview.16`. A test checks this mapping against the application version.
Compiled dependencies are preserved even after a packaging failure, and corrected
CI revisions no longer wait behind an older matrix.

Platform CI uses source `836c2195d62f4d0c59b403c2a4606d4d40a8012c`.
The signed Mac source differs only in the notarization helper and its tests;
analysis and interface source are identical. Ordinary macOS artifacts from the
cross-platform workflow remain ad-hoc previews; the separately notarized Apple
Silicon artifacts come from the signing run linked above.

Final local files, checksums, build identities, and Apple submission receipts are
in `src-tauri/target/distribution/2.0.0-preview.16/`. Windows installers include
the full WebView2 offline installer (approximately 213 MB each). Linux AppImage
and DEB packages were downloaded and their file formats checked. Native GUI
workflows on Windows and Linux remain a separate runtime qualification; build
and command-test success do not establish those GUI workflows.

The source/fixes are on `CPrescher/MossA:codex/tauri-desktop-builds`. The isolated
one-workflow signing branch is `Dioptas/Dioptas:codex/mossa-notarization`, based on
the existing signing setup. No release tag, public release, or live website
update was created.
