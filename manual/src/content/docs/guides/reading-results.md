---
title: Reading results
description: Interpret residuals, objectives, parameter uncertainties, and intensity fractions.
---

A completed optimization gives a fitted model under the chosen constraints and numerical assumptions. Evaluate its residuals, parameter plausibility, and diagnostics before interpreting the sites physically.

## Residuals and objective

The app's analysis residual is **observed − model**. With observations $y_i$ and predictions $\hat y_i$, the unweighted objective is

$$
S = \sum_i (y_i - \hat y_i)^2.
$$

Observed-count weighting instead uses

$$
S_w = \sum_i \frac{(y_i - \hat y_i)^2}{y_i}, \qquad y_i > 0.
$$

Compare objective values only with their observations, weighting, and fitted range in view. The reduced objective divides the objective by the residual degrees of freedom. It is not, by itself, evidence that a physical interpretation is correct.

Residual structure can expose a wrong peak shape, inadequate background, unresolved components, or preparation problems. A smaller objective after adding parameters is expected; the decrease needs interpretation.

## Parameter uncertainties

The results table reports approximate **1 std** from a local-Jacobian covariance estimate, scaled by the residual variance. It is a local approximation for the chosen model and observations.

![Completed two-doublet almandine fit, observed-minus-model residuals, and the table of values with approximate 1 std and fixed-parameter labels.](../../../assets/screenshots/almandine-two-doublets.png)

*In this measured teaching example, intensity percentages and their std appear separately from raw intensity parameters. The fitted label is a candidate iron assignment, not an automatic chemical identification.*

| Display | Meaning |
| --- | --- |
| A value with ± std | A symmetric local uncertainty is available |
| **Fixed** | The parameter was held fixed |
| **± —** | An uncertainty is unavailable; hover for the reason |
| **Fit for errors** | There is no current completed fit with applicable uncertainties |

Active bounds and unidentifiable parameter directions prevent a suitable symmetric uncertainty. Strong parameter correlations can make values poorly determined even when the fitted curve looks convincing. Linked-parameter errors propagate through their proportional links.

These errors are not MATLAB confidence intervals. They also do not propagate uncertainty in fixed calibration inputs, fixed source shape, or the shared magnetic constants.

Changing data or numerical model settings clears obsolete uncertainties. Renaming a site or model preserves matching fits. Undo can restore an earlier completed fit and its uncertainties without optimizing again.

## Intensity percentages

For site intensity parameters $I_j$, the table's percentage is

$$
F_j = 100\frac{I_j}{\sum_k I_k}.
$$

**Intensity (raw)** remains available separately. The percentage uncertainty uses the full fitted covariance and is reported in **percentage points**. A ratio fixed exactly by the specified model can have zero std. A zero total intensity gives undefined fractions.

In full transmission, these are **absorber-intensity fractions**. The individual site overlays are display-scaled absorber profiles, not additive transmitted components. Their plotted areas should not be used to reconstruct the transmitted total.

An intensity fraction is not automatically a mineral abundance, mass fraction, or atom fraction. Such an interpretation needs additional physical assumptions and, where applicable, corrections beyond the percentage definition.

## Record the fit status

Read warnings as part of the result. Reaching an iteration limit, rank deficiency, and a parameter at a bound are distinct problems. A numerical stopping code is not silently relabeled as convergence. Keep the completed project and its provenance alongside exported tables and figures.
