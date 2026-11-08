---
title: MossA 2 manual
description: Find your way around MossA 2, prepare folding and calibration, then fit and save Mössbauer spectra.
---

MossA 2 fits Mössbauer spectra in a browser or the desktop app. You can prepare a velocity axis, build models from singlets, doublets, and sextets, refine their parameters, and export the results. Calculations run on your device; spectrum files and projects are not uploaded.

[Open MossA 2](https://cprescher.github.io/MossA/). Start with [the workspace tour](/MossA/manual/getting-started/workspace/) to locate the controls in your layout, then [prepare folding and velocity calibration](/MossA/manual/guides/folding-and-calibration/) for your measured data. The [first-fit tutorial](/MossA/manual/getting-started/first-fit/) uses a synthetic example with its velocity axis already prepared.

## Start with the measurement

**Calibration is under Fitting options → General → Folding & calibration**, at the top of General. On a wide screen, use the right panel; on a laptop or tablet, select **Fitting options** above the editing area. If the right panel is hidden, use **Show fitting options** at the edge of the graph.

For raw channels, check the velocity scale, drive type, and folding before building or fitting a sample model. Folding combines the two acquisition halves when your file contains both directions of the drive. Already folded data should not be folded again. A two-column velocity/count file keeps its supplied axis; MossA's raw-channel controls do not recalibrate it.

The **Fitting options** panel contains preparation and model controls. Its **Fit options** tab contains solver settings such as weighting and starting models. Velocity calibration is in **General**. **Calibrate source…**, also in General when using full transmission, determines a source profile and is a separate procedure.

![Current wide-screen MossA workspace with the synthetic iron mixture, site editor, results table, and folding and calibration at the top of General.](../../assets/screenshots/workspace-wide.png)

*The built-in synthetic mixture in the current wide-screen layout. The workspace tour also shows laptop and tablet layouts.*

## Choose a starting point

| You want to… | Read… |
| --- | --- |
| Find sections, modes, and controls in my layout | [The workspace](/MossA/manual/getting-started/workspace/) |
| Prepare raw channels or calibrate velocity with an iron standard | [Folding and velocity calibration](/MossA/manual/guides/folding-and-calibration/) |
| Try the app with a complete example | [Your first fit](/MossA/manual/getting-started/first-fit/) |
| Understand what the spectrum measures | [The physics behind the spectrum](/MossA/manual/foundations/physics/) |
| Find the equations and parameter conventions | [Line shapes](/MossA/manual/foundations/line-shapes/) and [the full transmission integral](/MossA/manual/foundations/transmission-integral/) |
| Decide whether an extra site earns its flexibility | [Understand the F-test and watch the simulation](/MossA/manual/foundations/model-comparison/) |
| Follow a measured-data tutorial from the Freiburg practical | [Almandine](/MossA/manual/tutorials/almandine/) |
| Analyze a synchrotron-source magnetic spectrum | [SMS Fe₇C₃ tutorial](/MossA/manual/tutorials/sms/) |
| Work with SYNCmoss's public measured standards | [SYNCmoss CMS and SMS examples](/MossA/manual/tutorials/syncmoss/) |
| Load measured data | [Importing spectra](/MossA/manual/guides/importing-data/) |
| Add sites, bounds, and parameter links | [Building and fitting models](/MossA/manual/guides/building-models/) |
| Interpret fitted values and errors | [Reading results](/MossA/manual/guides/reading-results/) |
| Save an analysis or prepare a figure | [Saving and exporting](/MossA/manual/guides/saving-and-exporting/) |

## Projects, spectra, models, and sites

A **project** contains one or more spectra. Each **spectrum** stores its observations and velocity axis, and can have several alternative **models**. Each model contains a background, source settings, and a collection of **sites**. A site represents a spectral component; assigning it a mineral or electronic state remains a scientific interpretation.

This structure lets you compare interpretations of the same observations while retaining the parameters and completed fit of each model.

## Scope of this edition

This manual describes the current **MossA 2 interface** shared by the browser preview and desktop app. The desktop app uses native file dialogs; browser saves download files. The original MATLAB application is retained on `matlab-legacy` and under `reference/MossA/`; its interface and file formats differ.

The manual is a first edition under development. It covers the physical foundations and model equations, the current analysis workflow, the Freiburg almandine and SMS tutorials, public SYNCmoss standards, and selected advanced features. General combined-Hamiltonian, polarization, and instrument-specific models remain outside the implemented scope. The app's footer identifies its running version and commit.

Before reporting research results, read [numerical conventions and validation](/MossA/manual/reference/conventions-and-validation/), including the distinction between implementation checks and agreement with measured spectra.
