# MossA desktop

Starting with preview.17, the Tauri desktop app uses the native Rust fitting
core. It shares the React interface, numerical models and constants, and `.mossa`
file format with the browser app, which continues to run the WASM build in workers. It embeds the
program, math outlines, searchable manual, manual fonts and screenshots, tutorial
spectra and projects, and license notices. No local HTTP server, Node installation,
Python, MATLAB, or internet connection is needed to run the installed app.

The current desktop source is the **2.0.0-rc.1 release candidate**. See [the qualification record](RELEASE-CANDIDATE.md) for tested behavior and remaining validation limits. [GitHub Releases](https://github.com/CPrescher/MossA/releases)
provide permanent user downloads. `.github/workflows/desktop.yml` builds and tests
the platform packages; [RELEASING.md](RELEASING.md) describes the maintainer command
that collects a complete release with a signed, notarized universal Mac app. CI
artifacts from `develop` remain testing downloads.

## Build and run

Use the Node version from CI (26.12.1), native Rust, and the
[Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
npm ci --prefix manual
npm run desktop:dev
```

The macOS CLI wrapper prioritizes Apple’s system tools over Python shims, which
can otherwise shadow the recursive `xattr` command used by the bundler.

The development command builds the local manual and starts Vite on
port 1420. After editing the manual, restart the command to rebuild its static
copy. The browser development command remains `npm run dev`.

```sh
npm run desktop:build -- -- --locked
```

This builds the engine, interface, and manual, checks links and offline assets,
generates desktop/manual notices from locked dependencies, and produces the
native bundle under `src-tauri/target/release/bundle/`. On macOS the outputs are
`macos/MossA.app` and `dmg/*.dmg`. Use `--target universal-apple-darwin` for a local
universal Mac build after installing both macOS Rust targets. Explicit target
builds go under `src-tauri/target/<target>/release/bundle/`.

When changing the app version, update both `package.json` (and its lockfile) and
`src-tauri/Cargo.toml` (and its lockfile). The bundle version comes from
`package.json`.

Generated desktop files live in `dist-desktop/` and `manual/dist-desktop/`.
`dist/` and the GitHub Pages manual remain separate. The manual retains its
`/MossA/manual/` routes inside the desktop bundle so existing tutorial links and
search indexes work without rewriting scientific source documents.

## Files, documentation, and updates

- ⌘/Ctrl+O opens a project. ⌘/Ctrl+S saves to the current project file; the first save asks for a location. Save As (⌘/Ctrl+Shift+S) always asks for a destination and makes that file the current project. Canceling or failing Save As retains the previous destination.
- Open project and spectrum imports use the operating system file chooser. Opening a desktop project remembers its file for Save after the project has loaded successfully. New project gets a separate destination; Undo/Redo restores the appropriate project association. File associations stay in memory for the editor session and are not embedded in portable projects or browser autosaves.
- Project Save As, CSV, comparison JSON, SVG, PNG, and tutorial downloads use native
  Save As dialogs. Cancel does not report a successful save. Rust writes through
  a temporary file in the chosen directory before replacing the destination.
- Help opens an offline documentation window, leaving the analysis window open.
  Manual search, images, formulas, and tutorial downloads are bundled. External
  references open in the default browser only when selected.
- Local autosave uses persistent webview storage under the stable application
  identifier `de.clemensprescher.mossa`. Browser and desktop autosaves are
  separate. Transfer work by exporting and opening a `.mossa` file; keep those
  files as backups. Undo history is in memory, as in the browser version.
- The version/changelog identifies the embedded desktop build. The desktop does
  not poll GitHub Pages or reload into a website update. Install a newer app to
  update; automatic updates are not configured.
- Desktop calculations call the shared Rust library directly in background jobs.
  Browser calculations continue to use WASM workers. Desktop does not require a
  fitting WASM binary or a `wasm32` Rust target. The manual's Pagefind search may
  still use its own search WASM, independently of numerical fitting.
- Native progress uses Tauri channels. Cancellation reaches both local solvers
  and every active comparison job; closing/reloading the main window also
  cancels its native scopes. A comparison failure never yields a partial p-value.
- Multistart candidates, simulation RNG, recovery attempts, acceptance rules,
  result ordering, and diagnostics use shared execution-independent code.
  Auto/manual comparison worker limits apply to concurrent native Rust jobs.
  Exported comparison results identify `native-rust` and the worker count.

## Platform builds

The desktop workflow runs the scientific test suite, then builds Apple Silicon
and Intel macOS `.app`/`.dmg`, Windows x64 NSIS `.exe`/MSI, and Linux x64
AppImage/DEB artifacts. It also tests native command boundaries. Build artifacts
include `build-info.json`. The `.app` is archived as a tarball to preserve its
executable permissions and symlinks. The workflow can be dispatched manually and
does not create tags or GitHub Releases.

The rc.1 MSI package uses numeric version `2.0.0.10001` because WiX rejects the textual
`rc.1` prerelease. The app and NSIS installer retain `2.0.0-rc.1`.
Preview builds use fourth field N; release candidates use 10000 + N. This field
labels the package; Windows Installer ignores the fourth field when comparing
product versions, so it does not establish prerelease ordering. Export portable
projects before changing versions and include upgrade/reinstallation in Windows
runtime testing. See [Microsoft's ProductVersion documentation](https://learn.microsoft.com/windows/win32/msi/productversion).
A test checks that the MSI version stays synchronized with the app version.

Windows installers embed the WebView2 offline installer. This makes initial
installation independent of downloading WebView2, at the cost of a larger
installer. Linux DEB packages declare their GTK/WebKit runtime dependencies;
those dependencies must already be installed or available to the package
manager, including on disconnected computers. An AppImage still requires a
compatible Linux host and should be tested on the target distribution.

## Signing and public distribution

Ordinary local and cross-platform CI Mac preview builds use an ad-hoc signature.
The separately validated Apple Silicon 2.0.0-preview.16 distribution has now been
Developer ID signed, notarized, and stapled; see [DESKTOP-VALIDATION.md](DESKTOP-VALIDATION.md)
for its files and successful CI runs. For public distribution,
build with a Developer ID Application identity, notarize with Apple, and staple
the notarization ticket. CI currently produces unsigned Windows previews.
Configure platform signing before treating CI artifacts as a polished public
release. Tauri's [macOS signing guide](https://v2.tauri.app/distribute/sign/macos/)
and [Windows signing guide](https://v2.tauri.app/distribute/sign/windows/)
describe the necessary credentials. Do not commit certificates or credentials.

## Sign and notarize locally

Use the Developer ID Application certificate already installed in Keychain. Pass
its identity explicitly so ordinary preview builds can remain ad-hoc signed:

```sh
npm run desktop:build -- --config '{"bundle":{"macOS":{"signingIdentity":"Developer ID Application: Your Name (TEAMID)"}}}' --bundles app,dmg -- --locked
```

Create a Keychain profile once using your developer Apple ID and team ID. This
works from any folder and prompts securely for an **app-specific password**:

```sh
xcrun notarytool store-credentials mossa-notarization --apple-id "YOUR_APPLE_ID_EMAIL" --team-id YOUR_TEAM_ID
```

Generate the password at [account.apple.com](https://account.apple.com/) under
Sign-In and Security → App-Specific Passwords. An App Store Connect API key is
an alternative, not a requirement. Keep credentials out of source and chat.

After the signed build, run the helper with the generated DMG's actual filename:

```sh
python3 scripts/notarize-macos.py --profile mossa-notarization --dmg src-tauri/target/release/bundle/dmg/MossA_2.0.0-preview.16_aarch64.dmg
```

The helper submits the signed app, waits for Apple's acceptance, staples and
validates its ticket, then creates a signed DMG **containing the stapled app**.
It submits and staples that DMG and verifies both artifacts with Gatekeeper.
Submission IDs, hashes, payloads, and logs remain under
`src-tauri/target/notarization/`. For a profile in a CI file-based Keychain, set
`MOSSA_NOTARY_KEYCHAIN` to that Keychain path. Rerun the same command to resume a pending
submission. It does not create tags or publish downloads.

## Validation

See [DESKTOP-VALIDATION.md](DESKTOP-VALIDATION.md) for the local macOS results and
the checks that still require other operating systems or release credentials.

```sh
npm test
npm run build:desktop:web
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run verify:desktop
```

Before public release, check a packaged app on each OS: launch with networking
unavailable; fit the synthetic spectrum; import a tutorial spectrum; save/reopen
a project and confirm fit results; cancel a Save As dialog; export CSV/SVG/PNG;
search the manual and save tutorial files; quit/relaunch and confirm autosave.
Build success alone does not establish native runtime behavior on another OS.

## Project Save verification (2026-11-07)

The desktop file tests cover first Save, reusing a selected target, Save As target
switching, cancellation and write errors, and distinct document identities through
New/Open/Undo/Redo. Native Rust tests cover file replacement, read-only failures,
unknown file capabilities, and invalid/oversized project input.

An isolated macOS validation app with its own application identifier verified the
actual native Save/Open dialogs, both keyboard shortcuts, repeated Save without a
dialog, canceled Save As, switching to a Save As copy, New requiring a destination,
the app's Undo button restoring the earlier file association, opening an existing
project and saving back to it, and a read-only Save failure preserving the file.
The generated original and copy were checked independently on disk. These runtime
checks were on macOS; Windows/Linux receive native command tests and build checks.

## Native/browser parity checks

`npm test` checks the shared core, the browser WASM build, and interface behavior.
`npm run test:native` builds both numerical targets and exercises the production
native adapter/core/session registry through a headless transport. It checks
progress, source calibration, multistart search, cancellation during later search
starts, queued-work cancellation, Gaussian/Poisson comparisons with one and four
workers, failed comparisons, and reopening a browser-fitted project without
losing its saved fit or uncertainties. The desktop packaging check rejects fitting
WASM assets and records `fittingBackend: native-rust` in its build metadata.
