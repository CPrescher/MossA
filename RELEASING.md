# Branches and releases

`main` holds release-ready MossA 2 source. Integrate and test changes on `develop`,
then merge a reviewed release candidate to `main`. Each public download set has
an immutable version tag such as `v2.0.0-preview.16` on the selected commit.

The original MATLAB app is frozen on `matlab-legacy`, at
`cc1198210467b89e7174418a216c0dd1cf71c90d`. That exact tree and its full history
remain available; the original implementation is also retained under
`reference/MossA/` for implementation comparisons. The `mossa2` branch is retained
as a historical development branch.

## Testing and website

- Pull requests targeting `main` or `develop` run scientific tests and desktop
  builds. Pushes to `develop` do the same. CI artifacts are testing downloads.
- Pushes to `main` or `develop` deploy both sites after their checks pass. The
  release app/manual at `/MossA/` always come from `main`; the testing app/manual
  at `/MossA/preview/` always come from `develop`. Preview storage is namespaced
  separately, and both sites record their actual source commit.
- Version tags trigger the desktop build matrix. GitHub Releases provide the
  permanent user downloads, release notes, checksums, and build provenance.
- Versions with `preview`, `rc`, or another prerelease suffix remain marked as
  prereleases. A public download page does not imply completed scientific
  validation or remove the documented model and uncertainty limits.

## Prepare a release

Use a normal checkout with GitHub CLI authenticated as a maintainer. The account
needs write access to `CPrescher/MossA` and access to the existing signing
workflow in `Dioptas/Dioptas`. Apple credentials remain in that signing repository;
they are not copied into this checkout or into MossA repository secrets.

1. Merge the candidate into `main` after the required checks.
2. Update `package.json`, its lockfile, `src-tauri/Cargo.toml`, its lockfile,
   `src-tauri/tauri.windows.conf.json`, and `src/changelog.ts` together when the
   version changes. Run `npm test` and the manual build.
3. From the checkout, stage the release:

```sh
python3 scripts/release.py 2.0.0-preview.16
```

The command fetches the selected source, checks the version, creates and pushes
its annotated tag, and waits for the scientific and desktop CI jobs. It also
starts an isolated signing branch in the existing signing repository, pinned to
the exact MossA commit. That job builds a universal Mac app, verifies both
architectures, signs with Developer ID, notarizes and staples the app and DMG,
and preserves Apple's receipts. No App Store Connect API key is required.

Only after all jobs pass does the command collect the complete installer set:

| Platform | User downloads |
| --- | --- |
| macOS, Apple Silicon and Intel | Signed and notarized universal DMG; app tarball |
| Windows x64 | EXE installer and MSI, including the WebView2 offline installer |
| Linux x64 | AppImage and DEB |
| Browser | Static app/manual ZIP with local-server instructions |
| All | `SHA256SUMS.txt` and `build-provenance.json` |

The helper verifies every build's version, source commit, and clean status,
checks Apple's accepted submissions, and stages a GitHub draft release. Files
and resumable state are retained under `src-tauri/target/releases/<version>/`.
Rerunning the command resumes existing runs rather than moving tags or
replacing published releases. A failed CI job leaves the release unpublished.
Fix a defective tagged candidate using a new version; do not move public tags.

## Publish

Review the draft's notes, installer list, checksums, and provenance. To prepare
and publish the complete release in one maintainer operation, use:

```sh
python3 scripts/release.py 2.0.0-preview.16 --publish
```

The `--publish` step runs only after build and notarization verification. The
same command can publish a fully prepared draft. Prereleases are not designated
as the latest stable release. The README links to the Releases listing so users
can find the first preview even before a stable version exists.

Windows binaries are currently unsigned. Native GUI workflows on Windows and
Linux still require platform runtime testing; successful builds and native
command tests do not qualify every GUI workflow. Record relevant validation
limits in the release notes.

## MossA 2.0 release candidates

Prepare rc.1 on `codex/release-2.0.0-rc.1` without changing either deployed site.
The candidate includes [reviewed release notes](release-notes/2.0.0-rc.1.md) and
[the qualification record](RELEASE-CANDIDATE.md). After the candidate checks pass,
create its tag, installer matrix, notarized universal Mac distribution and draft:

```sh
python3 scripts/release.py 2.0.0-rc.1 --ref codex/release-2.0.0-rc.1 --notes-file release-notes/2.0.0-rc.1.md
```

This stages a draft prerelease. Publishing it and promoting source to `main`
are separate decisions. The root browser site stays on `main`; `/preview/`
stays on `develop`. Packaged manual source links pin the exact candidate commit.
Windows rc.N MSI versions use fourth field 10000 + N. This numeric label does
not guarantee upgrade ordering: Windows Installer compares only three fields.
Before stable 2.0, complete the platform runtime checklist and resolve or clearly
retain the documented experimental/unsupported scope.
