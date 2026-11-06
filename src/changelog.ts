// Newest first. Keep these student-facing notes with each named app version.
export const changelog = [
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
