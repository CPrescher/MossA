# MossA desktop

The Tauri desktop app shares the React interface, Rust/WebAssembly worker,
numerical constants, and `.mossa` file format with the browser app. It embeds the
program, math outlines, searchable manual, manual fonts and screenshots, tutorial
spectra and projects, and license notices. No local HTTP server, Node installation,
Python, MATLAB, or internet connection is needed to run the installed app.

The desktop is a preview. Platform installers are built by
`.github/workflows/desktop.yml`; those build artifacts are not public releases.

## Build and run

Use the Node version from CI (26.12.1), Rust, `wasm32-unknown-unknown`, and the
[Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
npm ci --prefix manual
rustup target add wasm32-unknown-unknown
npm run desktop:dev
```

The macOS CLI wrapper prioritizes Apple’s system tools over Python shims, which
can otherwise shadow the recursive `xattr` command used by the bundler.

The development command builds the local manual and engine, then starts Vite on
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

- ⌘/Ctrl+O opens a project and ⌘/Ctrl+S opens Save As.
- Open project and spectrum imports use the operating system file chooser.
- Project, CSV, comparison JSON, SVG, PNG, and tutorial downloads use native
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
- No native fitting backend is introduced: both targets execute the same WASM.

## Platform builds

The desktop workflow runs the scientific test suite, then builds Apple Silicon
and Intel macOS `.app`/`.dmg`, Windows x64 NSIS `.exe`/MSI, and Linux x64
AppImage/DEB artifacts. It also tests native command boundaries. Build artifacts
include `build-info.json`. The `.app` is archived as a tarball to preserve its
executable permissions and symlinks. The workflow can be dispatched manually and
does not create tags or GitHub Releases.

The MSI package uses numeric version `2.0.0.16` because WiX rejects the textual
`preview.16` prerelease. The app and NSIS installer retain `2.0.0-preview.16`.
A test checks that the MSI version stays synchronized with the app version.

Windows installers embed the WebView2 offline installer. This makes initial
installation independent of downloading WebView2, at the cost of a larger
installer. Linux DEB packages declare their GTK/WebKit runtime dependencies;
those dependencies must already be installed or available to the package
manager, including on disconnected computers. An AppImage still requires a
compatible Linux host and should be tested on the target distribution.

## Signing and public distribution

Local and CI Mac preview builds use an ad-hoc signature. For public distribution,
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
`src-tauri/target/notarization/`. Rerun the same command to resume a pending
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
