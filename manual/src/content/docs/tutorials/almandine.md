---
title: Almandine — from calibration to a two-doublet fit
description: Follow the Freiburg practical's conventional-source tutorial with measured garnet data in MossA 2.
banner:
  content: "Preview.16 development manual. The public app may be older; check its footer. Some features and project formats are unavailable in older versions."
---

This tutorial adapts the conventional-source MossA tutorial used in the Freiburg **Geowissenschaftliche Analytik** practical. You will calibrate a linear velocity scale with an iron foil, fit the dominant doublet of a natural almandine, inspect its residuals, add a second doublet, and refine the background.

The required part corresponds to **steps 1–7 of the original tutorial**, as specified by the practical. Freeing a line-area ratio is an optional extension, followed by saving and exporting.

## Download the measured data

| Download | Original course filename | Contents |
| --- | --- | --- |
| [Almandine iron foil](/MossA/manual/tutorial-data/freiburg/almandine-iron-foil.dat) | `Alm Fe-Foil.dat` | 512 raw count channels |
| [Almandine sample](/MossA/manual/tutorial-data/freiburg/almandine.dat) | `Alm sample.dat` | 512 raw count channels |

The download names are simplified; the file contents are unchanged. Both are **one-column raw-count files**. Load the foil in the calibration dialog and the sample with Add spectra. Do not import them as already calibrated velocity/count pairs.

:::note[Keep your current work]
Save any existing project before starting. You can begin with **New project**, or retain other spectra and give the tutorial a clearly named model. Existing sample sites are copied to newly imported spectra, so remove unwanted sites from the tutorial model before building its doublets.
:::

## 1. Calibrate the velocity scale

1. Open **Gen → Folding & calibration → + → From reference file…**.
2. In the preset editor, open the reference calibration if it is not already visible, then load `almandine-iron-foil.dat`.
3. Select the **linear** drive; leave sinusoidal drive off.
4. Enable **Fold reference channels**. Disable **Automatic fold center** and enter **256.5**, following this practical's specified manual-folding workflow.
5. Use an initial maximum velocity of **5 mm/s** and a reference field of **33 T** for this worked example. The reference field is a fixed calibration input; use a value established for your own standard in research analyses.
6. Choose **Fit reference**. Inspect the line positions, residuals, and warnings. Some outer lines lie at or beyond the measured range; MossA fits the complete sextet model.
7. Accept the reference result, name the preset **Almandine reference**, and save it. Select **Use for new imports** before importing the sample.

![Velocity-reference dialog after fitting the almandine iron foil, with manual folding, the linear drive, fitted curve, and calibration result.](../../../assets/screenshots/almandine-calibration.png)

*Use the foil acquired with this sample. A reference from another acquisition may have a different calibration even when its velocity range is similar.*

With the current browser implementation, the 33 T reference assumption, modern magnetic coefficients, and manual center 256.5, the example calibration gives a maximum velocity of about **5.02155 mm/s** and a standard center shift of **−0.10859 mm/s**. These are newly calculated browser results, not values transcribed from the original MATLAB tutorial. Subtracting this center shift is part of constructing the sample's velocity axis.

## 2. Load the sample

Use **Add spectra** to import `almandine.dat`. Confirm that the intended preset is the import default and that manual folding remains enabled at **256.5**. In **Gen**, choose **Thin absorber** and a **Constant** background. In **Opt**, use **Unweighted** residuals.

The dominant absorption pair has a center near 1.3 mm/s and a splitting near 3.5 mm/s. These are starting estimates from this example, not constraints that should replace an inspection of the graph.

## 3. Fit one Lorentzian doublet

1. Remove inherited sites from the tutorial's selected model if necessary.
2. Choose **+ → Doublet → Lorentzian → Define on graph**.
3. Click one line's position and depth, set its half-width with the second click, and click the other line.
4. Keep **A12 = 0.5 fixed**, so the two lines have equal areas.
5. Choose **Fit spectrum**.
6. Rename this model **1 doublet · constant background**.

![Almandine fitted with one Lorentzian doublet and a constant background, showing residual structure that remains near the central velocity range.](../../../assets/screenshots/almandine-one-doublet.png)

*Inspect the residual rather than deciding from the total curve alone. The remaining structure motivates testing another component.*

## 4. Add the weaker doublet

Duplicate the fitted model so you retain the one-doublet result. Append another Lorentzian doublet to describe the weak residual absorption near the center of the pattern. A starting CS of approximately **0.2–0.4 mm/s**, QS around **0.6 mm/s**, and width around **0.3 mm/s** is useful here. Keep its A12 fixed at 0.5 and fit again.

The lower-CS component is the candidate ferric component in the teaching interpretation. Its name does not establish that assignment. Check CS, splitting, sample context, and model dependence together.

## 5. Allow a linear background

Duplicate the two-doublet model, choose **Gen → Background → Order 1**, and fit again. Both background coefficients should be checked if you intend to refine them. Name this model **2 doublets · linear background**.

![Almandine with two Lorentzian doublets and a linear background; the results table includes fitted site percentages and uncertainties.](../../../assets/screenshots/almandine-two-doublets.png)

*The required tutorial ends here. Compare this model with the simpler alternatives before interpreting the remaining differences.*

The downloadable worked project uses CS bounds −0.5 to 2 mm/s, QS bounds 0.05 to 5 mm/s, FWHM bounds 0.03 to 1.5 mm/s, nonnegative intensities, fixed equal doublet areas, unweighted residuals, and up to 1,000 iterations. These bounds and iteration settings are explicit choices for this browser example; the original handout does not prescribe them.

<details>
<summary>Inspect one newly calculated worked result</summary>

Under the stated settings, the required two-doublet/linear-background example gives approximately:

| Component, teaching assignment | CS (mm/s) | QS (mm/s) | FWHM (mm/s) | Intensity (%) |
| --- | --- | --- | --- | --- |
| Fe²⁺ candidate | 1.2945 | 3.5383 | 0.2603 | 95.23 |
| Fe³⁺ candidate | 0.1221 | 0.5790 | 0.2307 | 4.77 |

These are a reproducible example fit, not certified composition values or an official answer key. The project retains full precision, constraints, calibration reference, and fit diagnostics.

[Download the almandine worked project](/MossA/manual/tutorial-data/freiburg/almandine.mossa).

</details>

## Optional: free the dominant doublet's area ratio

The practical explicitly says to skip the original tutorial's steps 8 and 9 for its required analysis. To explore them separately, duplicate the linear-background model, select the dominant doublet, check **Fit A12**, and refit.

For a doublet, A12 is the **first-line area fraction**, not an unconstrained ratio. A12 = 0.5 means equal areas. Inspect whether freeing it changes the residuals and the weaker component's intensity fraction. In the supplied worked fit, the weaker fraction changes from about **4.77% to 5.68%**. This illustrates model dependence; a better fit alone does not identify preferred orientation or a Goldansky–Karyagin mechanism.

## Save and continue

Save the whole project, export parameters, and prepare a figure with **Export graph**. The original tutorial's MATLAB report and Save Sites controls are replaced here by the browser's project, CSV, SVG, and PNG exports.

Continue with [comparing models](/MossA/manual/guides/comparing-models/) to learn how to assess added components.
