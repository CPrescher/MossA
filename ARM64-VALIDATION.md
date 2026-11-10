# ARM64 desktop builds for 2.0.0-rc.1

The additional Linux and Windows ARM64 packages use the published RC's exact
application source, `9b756e67f55c27249723687ef5ffe3d5d6ac1e65`. The published
`v2.0.0-rc.1` tag and existing installer files are retained. Desktop fitting is
native Rust on both architectures; browser fitting remains WebAssembly.

## Build and automated checks

[Corrected ARM64 RC build run](https://github.com/CPrescher/MossA/actions/runs/42762793235)
uses workflow revision `4de07c6`, with the
application checkout pinned separately to the published tag. Both jobs passed
on native ARM64 runners:

| Target | Runner | Packages |
| --- | --- | --- |
| `aarch64-unknown-linux-gnu` | Ubuntu 22.04 ARM64 | `aarch64.AppImage`, `arm64.deb` |
| `aarch64-pc-windows-msvc` | Windows 11 ARM64 | `arm64-setup.exe`, `arm64_en-US.msi` |

Each target passed 97 core tests, 8 desktop command tests and 22 native adapter
integration tests. Integration cases cover native/WASM parity, progress,
cancellation, source calibration, saved projects and model comparisons. The
platform-independent reference WASM was built and tested on the scientific-test
runner, then downloaded after each clean desktop build. It is a test reference,
not the installed desktop fitting backend.

The build checks require native ARM64 Node/Rust hosts, PE ARM64 or ELF AArch64
executables, a clean source identity and `fittingBackend: native-rust`.
`target-info.json` records the application source, workflow source and original
executable hash. Packaging changes the Tauri bundle marker, and Linux packaging
also adjusts ELF layout. Packaged executable hashes are therefore recorded
separately from the original build hash. Release provenance retains both
identities and the additional CI run; the
extended checksum manifest includes every old and new download.

Independent package inspection extracts the application from each of the four
downloads and checks PE ARM64 or ELF AArch64. Code sections match within each
platform's installer pair; read-only data differs only in Tauri's bundle marker.
Both Windows packages' embedded runtime hashes also match the signed ARM64
runtime recorded by CI. This is payload inspection, not installation testing.

The [expanded six-target matrix](https://github.com/CPrescher/MossA/actions/runs/42759871385)
passed the updated workflow and release helper at `e0379a4`, including existing
macOS and x64 builds. Release-helper tests reject incomplete ARM64 installer sets
and mismatched native architecture/source receipts.
Eight release/notarization helper tests passed locally after adding the runtime
receipt gate, and the updated workflow passes `actionlint`.

## Windows offline-runtime correction

The [initial ARM64 run](https://github.com/CPrescher/MossA/actions/runs/42759513956)
passed all native tests, but final package inspection found the x86 WebView2
offline installer in its Windows packages. Those Windows packages were not
published. [Tauri CLI 2.12.4's downloader](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.12.4/crates/tauri-bundler/src/bundle/windows/util.rs#L62)
selects x64 explicitly and falls back to x86 for every other architecture.

The corrected workflow changes exactly one URL byte in the locked Windows ARM64
CLI build tool: Microsoft's x86 offline link `2099617` becomes its ARM64 link
`2099616`. This changes no application source or Rust fitting code. The step
requires CLI 2.12.4 and exact original/patched tool SHA-256 hashes, and fails for
any different binary. A CLI upgrade therefore requires reviewing/removing this
workaround; it must not silently bypass those guards.

After packaging, CI extracts the WebView2 installer from both NSIS and MSI and
requires both hashes to match Microsoft's separately downloaded ARM64 installer.
It verifies the ARM64 download filename, Microsoft download host and valid
Microsoft Authenticode signature. Runtime URL/hash/signature and tool hashes are
included in the target receipt. Release collection rejects missing or mismatched
ARM64 runtime receipts. This verifies the bundled installer, not its execution
on a clean machine. Local Windows ARM64 packaging with the unmodified upstream
CLI also needs this correction until upstream fixes the architecture selection.

## Runtime limits

These checks execute the core and desktop commands, not the packaged GUI.
Installation, offline launch/help, file dialogs, exports, autosave/relaunch and
upgrade/reinstallation still require checks on both Windows and Linux ARM64.
Windows installers remain unsigned. The ARM64 NSIS installer uses an x86 stub
under Windows emulation; its installed application is native ARM64. The MSI
targets ARM64, and both installers include the ARM64 WebView2 offline installer.
See [Tauri's Windows installer guide](https://v2.tauri.app/distribute/windows-installer/).

Linux packages were built on Ubuntu 22.04. A compatible distribution and runtime
libraries are still required; DEB dependencies must be installed or available
to the package manager. AppImage packaging does not establish compatibility with
every ARM64 distribution or device.

The [RC scientific limits](RELEASE-CANDIDATE.md) continue to apply, including
experimental xVBF/source extraction, incomplete MATLAB execution comparisons
and conditional local-Jacobian std estimates. ARM64 regression success adds
platform execution evidence; it does not extend measured-data validation.
