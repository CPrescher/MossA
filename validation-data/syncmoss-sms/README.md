# SYNCmoss SMS transmission validation

Upstream snapshot: [`b712fbc1521004a47409b964b9ab012fe5c5e255`](https://github.com/sergey-yaroslavtsev/syncmoss/tree/b712fbc1521004a47409b964b9ab012fe5c5e255).

**Scope:** production MossA WASM versus the actual, unmodified SYNCmoss `models.TI` calculation using the measured SMS α-Fe standard and the instrumental profile embedded in that same file. This is an identical-parameter calculation comparison; the source is held fixed.

## Source and absorber conventions

- SYNCmoss source triples `(a, μ, c)` mean Gaussian std `a² + 0.098/2`, center `μ`, and integrated area `c²`. Convert std to FWHM with `2√(2 ln 2)`.
- SYNCmoss integrates `S(u) T(v+u)`; MossA uses response convolution `R(v-u) T(u)`. The response must be reflected. MossA fixes its centroid to zero, so upstream absorber centers are shifted by the original source centroid.
- Original source centroid: **0.00364996708957 mm/s**. All three supplied components are used; their weights sum to one.
- SYNCmoss thickness `T` becomes MossA optical-depth area `π × 0.098/2 × T`. Common Lorentzian line widths and exact individual line positions are preserved.
- Magnetic constants differ. The primary comparison expands the MossA site into identical SYNCmoss Singlet lines. A second comparison uses native SYNCmoss Sextet/Doublet components; its field and two sextet correction slots are explicitly mapped to preserve all line positions. Those correction values are numerical convention conversions, not inferred second-order physics.
- Both paths use the full exponential of summed optical depth. No channel averaging, texture, relaxation, or nonzero absorber Gaussian broadening is included. The same constant continuum is applied.

## Results

| Case | Maximum difference (counts) | RMS difference (counts) | Maximum / continuum |
| --- | ---: | ---: | ---: |
| measured-standard | 0.000127753 | 1.425539e-05 | 2.13e-08 |
| mixed-sites-control | 8.723612e-05 | 1.12217e-05 | 1.46e-08 |
| saturated-control | 5.326313e-05 | 6.787758e-06 | 8.89e-09 |
| grid-aligned-control | 1.200533e-10 | 1.951045e-11 | 2e-14 |

Acceptance: maximum difference / continuum below `1e-07`. **Passed.**

SYNCmoss was evaluated at 64, 128, 256, 512, 1024, and 2048 nodes. The 1024→2048 change is checked separately; native-component versus expanded-line agreement is also checked. The complete convergence results and parameter mappings are in `summary.json` and `upstream-comparison.json`.

The measured standard has 511 velocity/count pairs. A representative natural-width powder sextet gives reduced χ² = 0.974817 in MossA. Its fitted values select a realistic absorber for the numerical comparison; this is not an independent determination of the sample composition or a reproduction of the author's final fit.

The deliberately reflected source control differs by up to **311.167 counts**, showing that the comparison detects an incorrect asymmetry convention.

The original Gaussian-source implementation used PCHIP on the 0.01 mm/s convolution grid. Initial shared-grid evaluations agreed with SYNCmoss to about 1e-8 counts, while off-grid evaluations differed by up to 0.21 counts. Gaussian-source evaluation now uses six-point local polynomial interpolation; legacy source interpolation remains unchanged. The earlier prediction arrays are retained in `before-interpolation-fix.json`.

## Reproduce

Run from the repository root after installing Python `numpy scipy numba matplotlib`:

```sh
npm run wasm
python scripts/validate-syncmoss-sms.py
npx tsx --test tests/syncmoss-transmission.test.tsx
```

Upstream source is cached under the system temporary directory and verified against pinned Git blob hashes. No expressions in the upstream physics modules are patched or replaced. The serial pool implements only the same `starmap` interface used by the upstream tests. The Qt-bearing GUI is not imported.

Use `--write-fixture` only when intentionally refreshing the pinned regression fixture after inspecting the results. The fixture lets normal MossA tests verify the external calculation without downloading or installing SYNCmoss.

## Files and limitations

- `inputs/Standard_SMS.dat`: exact upstream measured data and embedded source parameters; `UPSTREAM_LICENSE.txt` retains its repository license.
- `inputs/source-profile.json`: exact supplied parameters and conversion into the MossA response convention.
- `standard-fit-results.json`: actual production-WASM fit and diagnostics.
- `SMS-standard.mossa.json`: reopenable measured standard at the fitted parameter values; source provenance is retained. Saved fit diagnostics are in the separate results file.
- `comparison.png` / `comparison.pdf`: measured spectrum, shared predictions, residuals, and engine difference.
- `summary.json`: acceptance checks, environment, source hashes, and runtime/core hashes.
- `upstream-comparison.json`: all sampled predictions and exact upstream inputs.

- Fixed supplied source; source extraction from a measured singlet was not tested.
- Scalar, isotropic random-powder absorption; polarized/texture/relaxation/Voigt parity is not established.
- Channel averaging and drive/finite-source smearing are disabled in both engines.
- The measured source parameters and natural absorber width are treated as exact.
- The source and sample conventions are explicitly converted; equal numerical BHF values across packages are not assumed.
