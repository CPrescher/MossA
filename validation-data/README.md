# Measured spectra for MossA validation

Ten public measured spectra are prepared in `ready-to-open/`. Use **Open spectrum** in MossA to load one CSV at a time. Start with [hematite](ready-to-open/14959531/MS_Fe2O3.csv), then [magnetite](ready-to-open/14959531/MS_Fe3O4.csv), then the three mixtures and the natural ore. All ten files passed the current `src/io.mjs` importer on November 6, 2026. The subsequent [fitting audit](benchmark/REPORT.md) includes 144 actual WASM fit runs, source-curve comparisons, independent optimizer checks, and reopenable fitted projects. Empirical reference fits are comparison evidence, not physical ground truth.

The [unrounded-coefficient follow-up](benchmark/unrounded-refit/REPORT.md) adds 44 paired refits of the same physical models, compares all magnetic fields with the earlier MossA fits, and compares the six matched room-temperature sites with the CONFIT tables. It preserves the earlier numerical outputs and supplied velocity axes; modern fitted projects and a complete BHF CSV are saved separately.

## Sources and suggested tests

| Dataset | Files | Suggested use in MossA |
| --- | --- | --- |
| Praetz, Schlesiger, Motz, Heinrich, Heppke, Klimke, and Jahns, v2 (2025), [Zenodo 14959531](https://zenodo.org/records/14959531), DOI [10.5281/zenodo.14959531](https://doi.org/10.5281/zenodo.14959531) | Hematite, magnetite, three hematite–magnetite mixtures, Mexican magnetite; 256 points each | Progress from one to two to three sextets. Compare residuals and fitted total curves with the supplied Recoil Lorentz fits. Examine links, bounds, overlap, and stability from different starting values. |
| Geymond, v2 (2025), [Zenodo 15331051](https://zenodo.org/records/15331051), DOI [10.5281/zenodo.15331051](https://doi.org/10.5281/zenodo.15331051) | Starting assemblage `dk23287v` and reacted assemblage `dk23289v`, both in `296K` folders; 512 points each | Candidate mixed doublet/sextet and magnetic-site tests. The original archive contains CONFIT parameter/area tables and other analysis files. Reconcile their parameter conventions before numerical comparison. |
| Same Geymond archive | `dk23297v` from `Additional_LHT0T`, `dk23302v` from `Additional_LHT6T`; 512 points each | Advanced model challenges. The archive includes distributions, SpectrRelax outputs, and a Hamiltonian component; simple-site agreement is not an established expectation. An excellent fit is not required to identify a model limitation. |

Both records explicitly specify **CC BY 4.0** in the downloaded Zenodo metadata. Credit the creators and dataset DOI when reusing original or converted spectra, and identify the CSV column extraction as a modification. Source licenses are independent of MossA's software license.

The Praetz record's nominal mixture labels are 30–70, 50–50, and 70–30. Its documented achieved hematite/magnetite mass percentages are 31.8/68.2, 50.6/49.4, and 70.5/29.5. These are mass fractions, not direct targets for MossA site intensity percentages. A quantitative composition comparison requires consistent treatment of Fe content, recoil-free fractions, thickness effects, and the authors' phase model. The two 70–30 filenames in the ZIP contain byte-identical data; the manifest records the alias and includes only one spectrum.

## Original and converted data

- `public/zenodo-*/record.json`: complete downloaded source metadata and licensing.
- `public/zenodo-*/*.zip`: unmodified archives, verified against their Zenodo MD5 checksums. Unrelated XRD/XAFS, chromatography, and simulation files remain inside the original ZIPs.
- `public/zenodo-*/selected-originals/`: unmodified original files corresponding to the selected spectra. Reference fitted curves remain in the Recoil `.fit` files; they were not used as observations.
- `ready-to-open/14959531/`: first two Recoil columns, `v (mm/s)` and `Iobs`, with the three-line preamble removed. The data are supplied observed count intensities, already velocity calibrated.
- `ready-to-open/15331051/`: calibrated velocity and relative observed intensity selected from CONFIT fixed fields. These are normalized intensities, not newly recovered raw counts. Use **unweighted** fits initially; observed-count weighting does not represent their original counting statistics. The final field of the `.exp` files is deliberately excluded.
- `manifest.json`: source members, row counts, velocity ranges, transformations, SHA-256 hashes, and weighting notes.

No smoothing, additional folding, rescaling, new calibration, or refitting was applied. Original exports may already reflect upstream processing and finite numeric precision; these CSVs are not untouched detector acquisition files. Calibration and folding should instead be tested with the tutorial's raw count spectra and iron references.

## Reproduce preparation

From the repository root:

```sh
python3 scripts/prepare-public-validation.py
```

The script downloads missing source files for the two version-specific records, verifies archive checksums, and regenerates the CSVs and manifest. It uses only the Python standard library.

## Complementary tutorial coverage

The supplied Freiburg exercise folder contains `cpx Fe-foil.dat`, `augite.dat`, and `omphacite.dat`; the conventional MossA tutorial adds `Alm Fe-Foil.dat` and `Alm sample.dat`. These are useful for measured iron-reference calibration, folding, and overlapping doublets. The separate pyroxene folder duplicates the three top-level spectra.

The SMS tutorial contains a raw iron reference, two five-column single-line files, and `Fe7C3_01GPa.mca`. The current browser importer accepts only one or two numeric columns, so the latter files require explicit format conversion. Source-profile calibration and xVBF are not currently ported. Preserve these as future coverage cases rather than treating their present import/model limitations as solver failures. No tutorial data have been copied into this public collection.

## Scope of the checks

Completed: source archive checksum verification, exact column extraction, source/derived SHA-256 recording, numerical and row-count checks, and import of all ten CSVs through the actual MossA parser.

The subsequent audit fits specified models from multiple initial guesses, compares reference total curves and available parameters, and checks local optimizer stationarity. Physical interpretation and justified regression tolerances still require appropriate source calibration and model assumptions. Reference fit results are comparison evidence, not independently known true parameter values. Synthetic recovery tests remain necessary for known-parameter accuracy and uncertainty coverage.
