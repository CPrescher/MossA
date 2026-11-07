---
title: Building and fitting models
description: Define sites, choose profiles, constrain parameters, and refine a spectrum.
banner:
  content: "Preview.16 development manual. The public app may be older; check its footer. Some features and project formats are unavailable in older versions."
---

Start with a model that expresses a plausible interpretation of the spectrum. Additional sites and free parameters should answer a specific question about unresolved structure or a physical hypothesis.

## Choose the spectrum model

Under **Gen → Spectrum model**, choose:

- **Thin absorber:** a polynomial background minus the sum of absorption profiles.
- **Full transmission integral:** a source-convolved transmission model with a nonlinear absorber response.

The modes use different raw intensity units. Switching mode rescales current intensities as approximate starting estimates and requires a new fit. Full-transmission source settings are described in [source profiles](/MossA/manual/guides/source-profiles/).

Under **Gen → Background**, select a constant or polynomial of order 1–3. Checked background coefficients vary during fitting. A background-only model with no sites can also be evaluated and fitted.

## Add a site on the graph

1. Choose + in the site panel.
2. Select the new site type and line profile, then choose **Define on graph**.
3. Click the first line's position and depth.
4. Click to set its half-width.
5. For a doublet, click the other line. For a sextet, click the opposite outer line.

The moving preview helps you estimate the starting values. Escape or **Cancel** leaves the model unchanged. Graph navigation remains available while placing points.

**Redefine** repeats this workflow for the selected site while retaining its name, profile, fit flags, bounds, and links. Linked parameters continue following their sources; inconsistent bounds are rejected.

Available site types are **Singlet**, **Doublet**, and **Sextet**. Profiles are **Lorentzian**, **Gaussian**, **PseudoVoigt**, and **LorSquared**. Use the site's gear to inspect type and profile settings. The duplicate icon beside Redefine copies the selected site. The app supports up to 16 sites.

## Understand the parameters

| Parameter | Meaning in the app |
| --- | --- |
| CS | Center shift, in mm/s, on the supplied or calibrated velocity axis |
| FWHM | Line-width parameter, in mm/s; profile-specific conventions matter |
| Intensity | Raw site area/intensity parameter; units depend on spectrum mode |
| QS | Quadrupole parameter, in mm/s; doublet centers are CS ± QS/2 |
| BHF | Magnetic hyperfine field in T for a sextet |
| A12, doublet | First-line area fraction between 0 and 1; 0.5 gives equal areas |
| A12, A13, sextet | First-to-second and first-to-third line-area ratios |
| L fraction | Lorentzian mixing fraction of a pseudo-Voigt profile, between 0 and 1 |

For a magnetic sextet, QS enters the retained magnetic-line shift convention; it should not be interpreted using the nonmagnetic doublet formula. Distribution widths and Lorentzian-squared widths also need their specific conventions. See [the numerical reference](/MossA/manual/reference/conventions-and-validation/).

Site names are labels. You can enter names such as `Fe$^{2+}$` or `$\alpha$-Fe`; the name editor previews supported mathematical notation.

## Fix, bound, or link a parameter

A checked fit box lets a parameter vary. Uncheck it to hold the value fixed. In **Bnds**, enter lower and upper limits; an empty bound means no user limit, subject to the model's physical restrictions.

For a proportional link, select a target in the current site, choose a source parameter and factor, then choose **Apply link**:

$$
p_{\mathrm{target}} = f\,p_{\mathrm{source}}.
$$

The target follows its source instead of being optimized independently. Target bounds also constrain the source. Cycles, missing sources, or inconsistent bounds are invalid.

![Bnds tab showing lower and upper parameter bounds and the proportional-link controls beside the fitted almandine model.](../../../assets/screenshots/bounds-and-links.png)

*Select the intended site first. A link is entered as target = factor × source; entering ordinary bounds does not create a link.*

## Choose fitting options

Under **Opt**, set residual weighting, starting-model search, and the iteration limit.

- **Unweighted** minimizes the sum of squared observed-minus-model residuals.
- **1 / observed counts** minimizes squared residuals divided by the observations. Every observation must be strictly positive.
- **1 · Current model** refines the current starting parameters.
- **4–32 starts** explores deterministic alternative starts and retains the lowest objective found. Fixed values, bounds, links, and site types are preserved.

More starts cost more time and can reduce dependence on starting estimates. They do not prove a global optimum or identify a physically correct model.

![Opt tab showing residual weighting, number of starting models, and iteration limit for the measured almandine model.](../../../assets/screenshots/fit-options.png)

*Record these settings with the model. This measured worked example uses unweighted refinement from the current start.*

Choose **Fit spectrum**, then inspect the termination status, residuals, parameters, and uncertainty diagnostics together. If a fit stops poorly, first inspect its model and starting estimates. Increase the iteration limit when the fit is still progressing toward a plausible solution.
