# Source basis for the SYNCmoss and physics chapters

Checked November 7, 2026. These notes record evidence and access limits for
authors; they are not a claim that every referenced paper was reanalyzed.

- The original public SYNCmoss `LICENSE` at commit
  `b712fbc1521004a47409b964b9ab012fe5c5e255` is MIT, copyright ESRF. The pinned
  repository tree and the headers of all three selected `.dat` files were
  inspected; no separate dataset restriction was found there. The exact
  notice is copied with the inputs and embedded in generated project,
  source-conversion, provenance, and fit-result records. No paper figures or
  upstream app screenshots are copied.
- Dataset paths, exact Git blob hashes, SHA-256 hashes, original header
  lines, row counts, and velocity ranges are in
  `public/tutorial-data/syncmoss/provenance.json`. CMS and Calibration numeric
  rows were compared directly and are identical. The SMS source triples
  come from its own `#@INSexp` header, rather than from a figure or a new fit.
- Yaroslavtsev (2023), DOI 10.1107/S1600577523001686: the publisher's full
  HTML was inspected. Section 2 describes extraction of an instrumental
  response and the consequences of replacing it by a symmetric shape;
  Section 3, equation 1 defines effective thickness; Sections 3.1–3.2
  distinguish approximate patterns from combined-Hamiltonian models.
  The tutorial does not reproduce Figure 1 or assign its component model
  to these newer bundled files. The implemented source conversion and
  narrow isotropic comparison are documented independently in
  `validation-data/syncmoss-sms/README.md` and its pinned harness.
- The physical equations in the foundations are original explanatory
  derivations with explicit units and assumptions. Their mapping to MossA
  was checked against `profile`, `site_curve_with_coefficients`,
  `Prepared::curves`, `source_transform`, and `residuals` in the current
  Rust core, and against the retained MATLAB `sextet.m`. In particular,
  the six normalized sextet line areas sum to its raw intensity, the
  Lorentzian-squared actual FWHM is `w * sqrt(sqrt(2)-1)`, and the ordinary
  full-transmission count model is `b0*T + B(v)-b0`. These are implementation
  statements, not conclusions inferred from a fitted spectrum.
- The modern Fe57 magnetic convention and its primary evaluated inputs
  are recorded in `validation-data/constants/RECOMMENDATION.md` and
  `src/nuclear-constants.json`. The Zhao–Sturhahn (2012) publisher HTML
  (DOI 10.1107/S0909049512022339), Section 3, is the transition-energy
  reference already used by that derivation.
- NNDC's adopted 57Fe PDF, evaluation September 1998, first page: ground
  spin 1/2, 14.4-keV spin 3/2, and half-life 98.3(3) ns. The tutorial uses
  those lifetime data only at illustrative precision and distinguishes
  half-life from mean lifetime. Its old magnetic moments are not adopted
  as the current MossA convention.
- Preston, Hanna, and Heberle (1962), DOI 10.1103/PhysRev.128.2207: the
  accessible publisher abstract was inspected for measured iron
  temperature shifts. Full text is subscription-restricted; no detailed
  temperature calibration was reconstructed from it.
- Prescher, McCammon, and Dubrovinsky (2012), DOI
  10.1107/S0021889812004979: publisher metadata/abstract confirm the program
  citation. Full text was not accessible here; current equations were
  audited against the available source code instead.
- Mössbauer's Nobel lecture is linked as primary historical reading.
  Search-indexed lecture text was available, while the direct PDF fetch
  returned HTTP 403. No lecture figures or extended quotations are used.
  The optional Gütlich lecture PDF exceeded the browser retrieval size
  limit and was not used as a full-text source.

The four worked fits are new production-WASM results, with source and
velocity inputs fixed as described. Reopening verifies their numerical
bindings; the CMS approximations deliberately retain poor residuals. The
two original calculated figures have their own scripts and theme variants.
Neither convergence nor a reduced objective near one is presented as
certification of phase assignment, source extraction, or general parity
with SYNCmoss.
