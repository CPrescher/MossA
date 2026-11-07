# Desktop preview validation — 2026-11-06

Built locally on Apple Silicon, macOS 26.6.2, using Node 26.12.1, Rust 1.99.1,
Tauri 2.12.5, and Tauri CLI/API 2.12.4. Application version:
`2.0.0-preview.16`. The embedded metadata identifies commit
`6c821460f752c6b2d00fc8c6285cc1acb949f4b4` with `dirty: true`: this is a build of
the current modified workspace, not a tagged release.

## Automated checks

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

## Native macOS smoke checks

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

## Remaining distribution checks

Windows and Linux build jobs are configured but have not been executed in this
local macOS session. Their installer/runtime checks remain pending the first CI
runs and testing on those operating systems. Mac preview artifacts are ad-hoc
signed and have not been notarized. Public distribution still needs the
platform signing/release steps described in `DESKTOP.md`. No tag or public
release was created.
