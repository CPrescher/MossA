---
title: Folding and velocity calibration
description: Inspect channel alignment, fit an iron reference, and apply named calibration presets.
---

Folding and velocity calibration operate on **raw count channels**. They determine the observations and axis shared by all models of that spectrum. Save the project before revising a calibration used for an important analysis.

## Find calibration first

Open **Fitting options → General → Folding & calibration**. It is the first section in General, above Spectrum model and Background.

- **Wide screen:** use the right panel. If it is hidden, select **Show fitting options** at the right edge of the graph.
- **Laptop:** choose **Fitting options** above the editor shared with Sites, then **General**.
- **Tablet or narrow window:** choose the **Fitting options** view, then **General**. Return to **Spectrum** for the larger graph and results.

**Fit options** is the solver tab. Velocity calibration is in **General**. **Calibrate source…**, under Source profile in full-transmission mode, determines the source line shape; it does not calibrate velocity.

![Current General panel with Folding & calibration first and the folding diagnostic available for newly imported almandine raw channels.](../../../assets/screenshots/importing-raw-counts.jpg)

*A newly imported teaching spectrum before fitting. Check or replace this initial preset using your measurement's reference; the shown import scale is not a calibration result.*

## Decide whether the file needs folding

| Your file contains… | Preparation |
| --- | --- |
| Raw channels containing both acquisition directions | Enable **Fold spectrum** and inspect the alignment of the two halves |
| Raw channels already folded by acquisition software | Uncheck **Fold spectrum** and choose the appropriate velocity scale |
| Two columns of calibrated velocity and counts | Keep the supplied axis; raw-channel folding and calibration do not apply |

Folding combines corresponding channels from the two acquisition halves. Whether it is needed depends on what was exported by the acquisition software. Verify that before applying it; do not fold already folded data again.

Folding is enabled by default for raw-count imports. Use **Fold spectrum** directly in this panel to enable or disable it for the current spectrum. Turning it off restores the original loaded counts without reimporting the file.

For a first raw sample, create a preset from the iron standard and save it. Saving or selecting a preset immediately applies its settings to the current raw spectrum. Use **Use for new imports** if subsequent raw files should use the same preset; the import default is a separate choice.

## Inspect folding

For a raw sample with folding enabled, open **Fitting options → General → Folding & calibration → Inspect this spectrum’s folding…**. This action is hidden when folding is off; check **Fold spectrum** first if the raw channels need folding. The diagnostic view shows:

- Original channels and the chosen center.
- Reversed-left and right counts overlaid.
- Their difference.
- The symmetry scan and its Gaussian refinement, when available.

Fold centers use the original MossA **1-based integer or half-integer channel convention**. The continuous fitted center and the rounded half-channel center are different quantities; both are displayed.

In **Folding alignment**, click a symmetry bar to select another center, enter **Fold center** manually, or choose **Find automatically**. Compare the halves across the whole pattern rather than relying on a single score. Each center change immediately refolds the current spectrum as an undoable change. Choose **Done** to close. Opening the diagnostic computes the automatic estimate without changing the current center; **Find automatically** selects and applies that estimate. After closing, Undo restores the previous folding and fit.

**Pair RMS** measures the left-minus-right mismatch over independent pairs. Its percentage is relative to the average counts per half. The symmetry percentage is relative to the current scan window. Neither number is a probability or a calibrated uncertainty; noise and drift can contribute to the mismatch.

![Measured almandine folding diagnostic with manually selected center 256.5 and the automatic refinement shown separately.](../../../assets/screenshots/almandine-folding.jpg)

*The practical's manual choice and the automatic estimate are separate. Selecting a center immediately updates the sample.*

## Fit an α-Fe velocity reference

1. Under **Fitting options → General → Folding & calibration**, select + (**Add calibration preset**) → **From reference file…** to create a preset from an α-Fe reference.
2. In **Velocity calibration**, choose **Open reference spectrum** and load the reference as one column of counts, or choose **Use current raw spectrum** if it is the standard. Loading a reference here does not replace the sample.
3. Enable **Fold reference channels** for an unfolded reference. Leave it off for an already folded spectrum.
4. Enable **Sinusoidal drive** for a sinusoidal acquisition; leave it unchecked for a linear drive. Enter an approximate **Initial max. velocity**.
5. Enter **Reference BHF (T)** appropriate to the standard and measurement conditions. The default is **33 T**, retained from the MATLAB workflow; it is an input assumption, not a field measured by the calibration fit.
6. Choose **Fit reference** and inspect the six-line curve, residuals, fitted maximum velocity, center shift, and warnings.
7. Choose **Continue with calibration** when the reference fit is satisfactory. In the preset editor, enter **Preset name** and choose **Save preset**. Saving immediately applies it to the current raw sample. Set the import default separately as described below.

The reference model is a Lorentzian sextet with zero QS and a linear background. Partial six-line patterns can be fitted, but an unsuitable initial velocity range can lead to incorrect line assignments. The workflow does not support arbitrary calibration materials or a nonlinear correction from individually assigned peaks.

Changing a reference's folding center invalidates its previous reference fit. Refit before accepting the calibration.

![Velocity calibration of the measured almandine iron foil with linear drive, a manually specified folding center, fitted sextet, and residuals.](../../../assets/screenshots/almandine-calibration.png)

*This example uses the Freiburg teaching foil and a fixed reference input of 33 T. The displayed maximum velocity and center shift are fitted browser results.*

## Apply or reuse a preset

| Action | Effect |
| --- | --- |
| Select a preset | Immediately apply its saved velocity and folding settings to the current raw-count spectrum |
| **Fold spectrum** | Immediately enable or disable folding for the current raw spectrum |
| **Use for new imports** | Set the default for subsequent raw-count imports |
| **Edit preset…** | Open the editor; **Save changes to preset** updates the saved preset and immediately calibrates the current raw spectrum |
| **Edit preset… → Recalibrate from reference…** | Refit the saved standard or load a replacement; choose **Use revised calibration**, then **Save changes to preset** |

The ⋯ control (**Manage calibration presets**) opens **Calibration presets**, where you can rename, **Edit**, or **Remove** presets. The panel identifies the applied calibration. For a velocity-column file it shows **File velocity axis retained**; folding is disabled and selecting a preset preserves the supplied axis.

Applying a changed calibration clears obsolete fits in every model of that spectrum. Reapplying an identical scale retains matching completed fits. Other spectra remain unchanged.

Applied spectra retain their own copy of the calibration and the preset name at application time. Saving an edited preset updates the current raw spectrum; other spectra keep their copies. Renaming or deleting a preset preserves applied calibrations. If an edited preset is the import default, its saved changes also affect future imports. Saving and applying to the current spectrum form one Undo/Redo step.

![Calibration preset editor with separate velocity scale, folding controls, reference-calibration action, and Save/Cancel controls.](../../../assets/screenshots/calibration-preset.png)

*Saving a preset immediately calibrates the current raw spectrum. The editor identifies the saved reference used for this measured teaching example.*

Automatic sample fold centers are found afresh for each import. They do not simply reuse the reference's measured automatic center. A manual preset center is retained when automatic centering is disabled.

## Reverse a sample's velocity direction

Use **General → Velocity direction → Reverse velocity axis** when the acquisition requires the opposite direction, as in the [SMS exercise](/MossA/manual/tutorials/sms/). It negates the complete calibrated velocity, including the applied center-shift correction, and preserves count/velocity pairs while ordering the result by increasing velocity.

The direction belongs to the selected spectrum, applies to all its models, and survives later folding or recalibration. Other spectra and import defaults retain their own settings. Changing it invalidates that spectrum's completed fits and can be undone. Site starting values are not transformed; inspect them before refitting.

![The measured SMS sample with Reverse velocity axis enabled and original MCA metadata retained in the fitting-options panel.](../../../assets/screenshots/sms-reversed-axis.png)

*The saved checkbox describes a preprocessing choice for this spectrum. Its raw acquisition counts remain available for later recalibration.*

## Keep conventions consistent

Calibration presets also carry the magnetic-coefficient convention. An older preset can therefore preserve older coefficients in new raw-count imports. Existing analyses are not silently converted to newer constants. See [numerical conventions](/MossA/manual/reference/conventions-and-validation/).
