---
title: Your first fit
description: Fit the built-in synthetic iron mixture, inspect the result, and save a portable project.
banner:
  content: "Preview.16 development manual. The public app may be older; check its footer. Some features and project formats are unavailable in older versions."
---

This tutorial takes you through a complete analysis using the built-in **Synthetic iron mixture**. It has a sextet and a doublet with deliberately imperfect starting parameters.

:::note[Teaching data]
The example is generated deterministically in the app. It is not a measured iron standard. Its noise is simulated Gaussian noise, so it is also unsuitable for a Poisson-count simulation test.
:::

## 1. Open the example

1. [Open MossA](https://cprescher.github.io/MossA/).
2. If you have an existing analysis, use **Save project** before proceeding.
3. A fresh browser session starts with the synthetic mixture. If you see your previous work instead, [download the synthetic starting project](/MossA/manual/tutorial-data/synthetic-first-fit.mossa) and use **Open project**. Opening replaces the current project, so save your existing work first.
4. Select the example in the spectrum list if necessary.

The spectrum and residuals occupy the center of the window. Site controls are on the left, fitting options on the right, and the results table below the graph. The project sidebar starts collapsed in a fresh session.

## 2. Inspect the starting model

The example starts in **Thin absorber** mode with a constant background. Its two sites are labeled **α-Fe** and **Fe²⁺**. These labels identify the intended teaching components; the app does not infer chemical identities from their names.

Select each site and inspect its CS, FWHM, intensity, and splitting parameters. The sextet also has a magnetic hyperfine field, BHF. A checked parameter varies during refinement. The sextet's QS and the line-intensity ratios are held fixed in this example.

In **Opt**, keep **Residual weighting → Unweighted** and **Starting models → 1 · Current model** for this first fit.

## 3. Fit the spectrum

Choose **Fit spectrum**. The app refines the varying parameters and updates the graph and Status panel. A short fit may finish before you see an intermediate iteration.

Wait for the fit to finish. Read its termination status and warnings. Reaching the iteration limit is different from convergence. **Stop fitting** cancels the calculation and restores its starting model.

![MossA after fitting the synthetic mixture: the sextet and doublet follow the data, residuals appear below the spectrum, and the table reports fitted parameters with approximate 1 std.](../../../assets/first-fit.png)

*The completed example in a local browser build. Elapsed time depends on the device and is not a benchmark.*

## 4. Inspect the result

Check three things together:

- **The total curve:** does it follow the observations over the entire velocity range?
- **The residuals:** do the observed-minus-model differences have structure, especially near the absorption lines?
- **The parameters:** are the widths, shifts, splitting, and field plausible, and are any parameters at a bound?

For this constructed example, the fit should approach the input values below. Small differences arise from the simulated noise; these are generation values, not independently measured reference values.

| Component | Generation values |
| --- | --- |
| Sextet | CS = 0.12 mm/s; BHF = 33.1 T; FWHM = 0.29 mm/s; raw intensity = 2,400 |
| Doublet | CS = 1.18 mm/s; QS = 2.25 mm/s; FWHM = 0.31 mm/s; raw intensity = 720 |
| Background | Constant = 100,000 |

The result table reports approximate **1 std** where an uncertainty is available. **Fixed** indicates a held parameter. **± —** means the app cannot report a symmetric uncertainty; hover over the entry for the reason.

## 5. Try an alternative without losing the fit

Expand the project sidebar, right-click the current model, and choose **Duplicate model**. Rename the copy to describe your test. Change a starting width or shift in the copy, then fit again.

Switch between the models to inspect their saved fits. Duplication retains the original fit and gives the copy independent model settings. Selecting a model does not run an optimization.

## 6. Save and export

1. Use **Save project** to download a `.mossa` file containing all spectra, models, and completed fits.
2. Use **Export parameters** above the results table to save parameter values and uncertainties as CSV.
3. Use **Export graph** in the top toolbar to prepare an SVG or PNG figure.

Browser autosave helps you resume on the same browser and app address. Keep the downloaded project as your portable analysis record.

Next, [import your own spectrum](/MossA/manual/guides/importing-data/) or learn how to [build a model](/MossA/manual/guides/building-models/).
