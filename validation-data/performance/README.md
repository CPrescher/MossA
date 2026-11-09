# Fitting performance evidence

The Markdown reports describe each optimization stage, timing method, unchanged scientific acceptance gates, and measured limitations. Verification/provenance receipts are retained as ordinary JSON files for review.

`fitting-evidence.tar.xz` saves the complete raw records, historical native/WASM artifacts and source snapshots, benchmark input data, and preserved execution logs. These expanded records are large and are kept outside the normal source checkout. `evidence-manifest.json` contains the archive SHA-256 and every member's original SHA-256. The archive also preserves unsuccessful and exploratory measurements; use each report to identify its qualified final runs.

The raw archive is retained locally and is not committed to Git. To use the commands below in another checkout, first copy the preserved archive to `validation-data/performance/fitting-evidence.tar.xz`. Normal builds and tests do not need it.

Verify the saved evidence from the repository root:

```sh
python3 scripts/archive-fitting-evidence.py --verify
```

To restore missing historical benchmark files in a fresh checkout:

```sh
tar -xJf validation-data/performance/fitting-evidence.tar.xz
```

The archive contains only paths below `validation-data/performance/` and `validation-data/benchmark/`. Restore it in a fresh checkout to avoid overwriting newer local measurements. Historical binaries retain their original platform; the source snapshots and recorded toolchain information allow rebuilding elsewhere. Normal scientific tests use self-contained test fixtures and do not require unpacking this archive.

The original verification scripts refer to their captured `/tmp/mossa-*.log` names. Their preserved copies are under `validation-data/performance/logs/` after extraction; copy those logs to `/tmp/` when rerunning the historical receipts. New benchmark runs should retain their own logs and artifacts. Browser benchmarking also needs Playwright; scripts accept a `--playwright-module` path.

To replace the archive after a new qualified benchmark run, with the expanded records present:

```sh
python3 scripts/archive-fitting-evidence.py
```
