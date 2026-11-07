// Newest first. Keep these student-facing notes with each named app version.
export const changelog = [
  {
    version: '2.0.0-preview.16', date: '2026-11-06',
    changes: [
      'Recover difficult simulated fits with residual-based added-component starts and an alternative bounded solver, preserving constraints and fit-quality checks.',
      'Run model-comparison simulations across multiple CPU workers with Auto or a manual count. Seeded spectra and fit diagnostics remain unchanged; cancellation stops the whole pool.',
      'Comparison results now give a plain recommendation and explain each statistic beside its value. Detailed calculation and recovery logs can be expanded.',
      'Import single-spectrum SPEC MCA files directly, with channel-count checks and retained acquisition headers.',
      'Recognize the five-column SMS reference layout and show which velocity/count columns are fitted.',
      'Reverse calibrated velocities in Gen. The direction is saved per spectrum, applies to all its models, and survives recalibration and Undo/Redo.',
      'The manual includes illustrated almandine, clinopyroxene, and SMS tutorials with original teaching files and new browser worked examples.',
      'Reversed analyses use project version 3 and collection/autosave version 2 so older clients reject unsupported preprocessing.',
    ],
  },
  {
    version: '2.0.0-preview.15', date: '2026-11-06',
    changes: [
      'Compare models below the model list uses a theme-matched graph and automatically retries stalled simulated fits on the same data. Load example was removed from the sidebar.',
      'Compare models overlays alternative fits and residuals and tests added sites with reproducible Poisson or Gaussian simulations. Export complete comparison reports; cancel simulations independently of model editing.',
      'New project beside Open and Save starts fresh with no spectra or models. Undo restores the previous project; the empty project is autosaved.',
      'Double-click spectrum or model names to edit them in place. Enter or clicking away saves the name; Escape cancels.',
      'Use + and − above the spectrum/model lists to add or remove entries. Model right-click actions remain available.',
      'The project browser starts collapsed; fitting options stay docked and open until explicitly hidden, including while editing xVBF.',
      'Matching sidebar controls, drawn Undo/Redo icons, and persistent scrollbars make navigation more consistent.',
    ],
  },
  {
    version: '2.0.0-preview.14', date: '2026-11-06',
    changes: [
      'The project sidebar keeps spectra above the selected spectrum’s models, with search and an adjustable divider between the two lists.',
      'Collapse the project browser and fitting-options sidebar independently to give the plot more room; panel states and the divider position are saved locally.',
      'Right-click any model to duplicate, rename, or remove it. Keyboard navigation and Undo remain available.',
      'Fitting options open over the plot in narrow windows and can be closed from their header, with Escape, or by clicking outside.',
    ],
  },
  {
    version: '2.0.0-preview.13', date: '2026-11-06',
    changes: [
      'Keep multiple spectra in one project; add several files at once and switch through a searchable spectrum navigator.',
      'Create named model alternatives for each spectrum. Right-click any model to duplicate, rename, or remove it; switch tabs without refitting or losing uncertainties.',
      'Save and reopen the whole project, including every spectrum, model, calibration, and completed fit. Existing single-spectrum projects still open.',
      'Whole-project browser autosave uses IndexedDB, with migration from existing local sessions. Spectrum/model removal supports Undo.',
    ],
  },
  {
    version: '2.0.0-preview.12', date: '2026-11-06',
    changes: [
      'Automatic plot limits and Reset view include the background and displayed site curves, including full-transmission absorber overlays.',
      'Project downloads use .mossa; existing .mossa.json projects remain readable.',
      'The spectrum stays visible while editing xVBF distributions in the right sidebar.',
      'Use CS and QS for their plots and parameter tables, or Corr for coupling and the joint correlation map.',
      'The standard-width sidebar gives each component two rows: center/width, then weight and action icons.',
    ],
  },
  {
    version: '2.0.0-preview.11', date: '2026-11-06',
    changes: [
      'Switch between CS and QS plots and parameter tables in the main workspace; use Both for comparison or Spectrum to inspect the fit.',
      'Inspect the joint CS–QS correlation map, enlarge it, and export it as SVG.',
      'Component rows scroll with fixed headers; bounds open from each row’s gear icon.',
      'Distribution previews now use matching marginals of the MATLAB joint-density model; numerical fitting is unchanged.',
    ],
  },
  {
    version: '2.0.0-preview.10', date: '2026-11-06',
    changes: [
      'xVBF fitting for Lorentzian doublets: CS/QS Gaussian mixtures, coupling, fixed flags, and component bounds.',
      'Distribution weights stay normalized during fitting; component and mean-parameter std include their constraints.',
      'Edit and preview distributions in xVBF; save projects, export parameters, and restore fits with Undo/Redo.',
    ],
  },
  {
    version: '2.0.0-preview.9',
    date: '2026-11-06',
    changes: [
      'Calibrate the source profile from a known-width singlet standard using the MATLAB transmission calibration model.',
      'Fit an asymmetric source with one to three Gaussians; inspect the complete shape and reuse it unchanged in the full transmission integral.',
      'Inspect live fit curves, residuals, source width, and approximate std before applying Lorentzian or squared source settings.',
      'Source references are retained in project files and local autosave; applying is undoable and preserves sample sites and data.',
    ],
  },
  {
    version: '2.0.0-preview.8',
    date: '2026-11-06',
    changes: [
      'Reopening a saved project restores its completed fit, uncertainties, fractions, and timing without refitting.',
      'Stored results are checked against the model/data; Undo and Redo retain the fit for each project.',
      'Older fitted project files remain readable, with legacy provenance identified in fit warnings.',
    ],
  },
  {
    version: '2.0.0-preview.7',
    date: '2026-11-06',
    changes: [
      'Inspect folding with raw counts, overlaid halves, their difference, and a symmetry-score plot.',
      'Compare centers by clicking symmetry bars; inspect the Gaussian estimate and paired-count RMS.',
      'Apply sample folding in one Undo/Redo step, or inspect it in the velocity-calibration window.',
    ],
  },
  {
    version: '2.0.0-preview.6',
    date: '2026-11-06',
    changes: [
      'Velocity calibration also accepts partial iron patterns; outer lines may be outside the scan.',
      'Find folding centers automatically with the MATLAB symmetry-search method, or override them manually.',
      'Calibration now reports loaded points and folded points separately, including odd-length input.',
    ],
  },
  {
    version: '2.0.0-preview.5',
    date: '2026-11-06',
    changes: [
      'MossA uses the MIT License; updated legal notes and package information.',
      'License text and third-party notices are included with the browser app.',
    ],
  },
  {
    version: '2.0.0-preview.4',
    date: '2026-11-06',
    changes: [
      'A compact footer explains that spectra stay on your device and processing runs locally.',
      'Find privacy information, the Impressum, legal notes, and the version/changelog in the footer.',
    ],
  },
  {
    version: '2.0.0-preview.3',
    date: '2026-11-06',
    changes: [
      'Calibrate the velocity scale from an iron reference under Gen → Velocity calibration.',
      'Preview the reference fit and residuals, then apply the velocity range and center shift.',
      'Keep calibration references with your project; Undo restores the previous scale and fit.',
    ],
  },
  {
    version: '2.0.0-preview.2',
    date: '2026-11-06',
    changes: [
      'Click the version to see what changed in recent versions.',
      'Check for updates and reload when ready from this window.',
    ],
  },
  {
    version: '2.0.0-preview.1',
    date: '2026-11-06',
    changes: [
      'Fit spectra directly in the browser, without MATLAB or installation.',
      'Define sites on the graph; zoom, pan, rename, duplicate, and delete sites.',
      'View fit uncertainties and intensity fractions, with Undo/Redo and local project autosave.',
      'See the running version and receive a notice when a newer build is available.',
    ],
  },
];
