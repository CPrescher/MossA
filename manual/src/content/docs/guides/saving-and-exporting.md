---
title: Saving and exporting
description: Keep a portable project, export numeric results, and prepare figures.
banner:
  content: "Preview.16 development manual. The public app may be older; check its footer. Some features and project formats are unavailable in older versions."
---

Use a project file to preserve the analysis and exports to communicate its results. They serve different purposes.

## Save a portable project

**Save project** downloads a `.mossa` file containing every spectrum and model, raw channels where available, calibration presets and settings, source information, numerical conventions, and completed fit results. The internal format is versioned JSON.

**Open project** accepts current whole-project files and earlier single-spectrum `.mossa`/`.mossa.json` browser projects. Matching completed fits reopen without optimization. The loader discards invalid or mismatched fit metadata while retaining loadable data and model settings.

![Project sidebar and file controls with the measured almandine spectrum and independent fitted models retained together.](../../../assets/screenshots/workspace.jpg)

*Save project retains all spectra and models shown here. A CSV or figure represents only the selected export and does not replace the project file.*

Current projects can use numerical features that older clients do not understand. Keep the app version/commit with an analysis; an older client may reject a newer file instead of silently ignoring its conventions.

Reversed velocity axes use single-spectrum format **3** and collection/autosave format **2**, so older clients reject unsupported direction handling. Import details, original raw channels, acquisition headers where available, and the saved direction are retained. Nonreversed projects keep their existing format rules.

## Understand local autosave

Autosave retains the whole project and panel layout in this browser, using IndexedDB with a local-storage fallback. It belongs to the **same browser, device, and app address**. Clearing site storage removes it. An autosave warning means you should download a project immediately.

Only completed fits are retained. Unfinished fits and graph-placement previews are not saved. Undo/Redo history stays in memory and starts fresh after reload.

**New project** creates an empty project and replaces the local autosave. Undo can restore the previous project while the page remains open. Download a portable backup before starting a separate analysis you want to keep.

## Export numerical data

- **Export data** in the top toolbar saves the selected spectrum's observations, model, and residuals as CSV.
- **Export parameters** above the results table saves parameter values and available uncertainties, including intensity percentages.

The parameter CSV retains the original source text of mathematical site names. Exported numbers retain full stored precision rather than the shortened input display.

## Prepare a figure

Choose **Export graph** to open the figure studio. Its white-page preview is separate from the analysis workspace.

1. Choose the full velocity range or the current plot view.
2. Select a journal, presentation, or custom size.
3. Choose site fills or outlines and edit labels, colors, visibility, and layer order.
4. Place the legend and choose whether to show data/fit entries.
5. Show residuals above or below the spectrum, or hide them. The export can display either residual sign; state the convention in the figure caption when needed.
6. Download editable **SVG**, or **PNG** at 300 or 600 dpi.

Figure settings do not change observations, fitted parameters, or the analysis objective. Exported curves use the evaluated data grid; the figure studio does not perform another fit or interpolate a new model grid.

![Figure studio for the measured almandine fit, with white-page preview, legend and residual controls, editable labels, and SVG download.](../../../assets/screenshots/figure-export.png)

*Check the preview before downloading. Figure labels, colors, and layout are export settings; they do not alter the fit.*

Full-transmission figures identify site curves as display-scaled absorber profiles. Preserve that distinction in captions and subsequent figure editing.
