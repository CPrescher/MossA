---
title: Source profiles
description: Set a simple source response or calibrate a source from a known-width singlet reference.
---

Source profiles enter the **Full transmission integral** model. They describe the response convolved with absorber transmission. Thin-absorber fitting does not use these source settings.

For the equations and convolution direction, read [the full transmission integral](/MossA/manual/foundations/transmission-integral/). The [SYNCmoss standards tutorial](/MossA/manual/tutorials/syncmoss/) includes an explicitly supplied asymmetric source; using that response is different from estimating a source from a singlet reference.

## Use a simple source

In **Fitting options → General → Spectrum model**, select **Full transmission integral**. Scroll down to **Source profile** and set **FWHM (mm/s)** and, if appropriate, enable **Lorentzian-squared source**. The squared profile uses the original MossA width convention; do not assume its width parameter has the same interpretation as a Lorentzian's.

## Calibrate from a singlet reference

Choose **Fitting options → General → Source profile → Calibrate source…** to open **Source-profile calibration**.

1. Choose **Open source reference**, or **Use current spectrum** if the selected spectrum is the reference.
2. Set **Known absorber FWHM** to its intrinsic Lorentzian absorber width. The default is 0.097 mm/s; replace it when your reference requires another value.
3. Choose **Source model → Lorentzian**, **Lorentzian-squared**, or **Gaussian mixture**. Set **Initial source width**; for a mixture, also choose the number of **Gaussians**.
4. Choose **Fit source reference** and inspect the reference curve, residuals, source width or complete source shape, and diagnostics.
5. Choose **Apply source profile** when the reference supports it.

Raw reference files use the current folding and velocity controls. Two-column reference files retain their supplied velocity axis.

Applying the result updates the selected model's source settings and retains the reference. It does not replace sample sites, observations, or spectrum mode. Models have independent source settings; velocity calibration remains shared by all models of a spectrum.

![Source-profile calibration dialog with a generated singlet reference, fitted Lorentzian source width, residuals, and the unit-area source-shape preview.](../../../assets/screenshots/source-calibration.png)

*Illustration using a noiseless synthetic reference generated with absorber width 0.097 mm/s and Lorentzian source width 0.17 mm/s. The very small residual and std result from this construction; they do not represent experimental precision or measured source-extraction validation.*

## Gaussian mixtures

The **Gaussian mixture** option fits one to three positive components. Start with the fewest components that can describe the reference. Inspect the full shape, component widths/areas, and reference residuals before adding flexibility.

The calibrated shape is normalized to unit area and zero centroid, then held fixed in subsequent full-transmission sample fits. The complete shape, including asymmetry, is retained in project files and autosave. Under-resolved, rank-deficient, or bound-limited calibrations cannot be applied.

## Interpretation and limits

Use a reference measured under matching source conditions, with comparable or better statistics. The known absorber width and velocity scale are treated as exact. Their uncertainties, and uncertainty in the calibrated source response, are not propagated through later sample-fit errors.

The implementation has selected numerical and measured-transmission checks. Validation of extracting the Gaussian-mixture source from a measured singlet remains outstanding. See the [validation reference](/MossA/manual/reference/conventions-and-validation/) before treating an extracted source as independently established.
