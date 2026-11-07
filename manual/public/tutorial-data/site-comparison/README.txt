MossA site-comparison teaching replay

Original synthetic data and fits generated for the MossA manual. No measured
spectra or external datasets are used. Run, with Node 26 and compiled WASM:

node --import tsx scripts/prepare-comparison-tutorial.ts

The generator uses the actual production comparison functions and numerical
core: prepareComparison, comparisonGenerator, fitComparisonSimulation, and
completeComparison. Each case has 199 Gaussian bootstrap trials, seed 12345.
The three observed examples use generation seed 42 and true Gaussian noise
std 2. The true extra intensities are 0, 1, and 8, selected as teaching cases
with no clear support, a borderline result, and a clear result.

81 points span -4 to +4 mm/s. Two singlet centers are fixed at -0.6 and
+1.1 mm/s, with fixed Lorentzian widths 0.45 and 0.40 mm/s. The main intensity
is generated as 80 and the constant background as 1000. Fits vary background
and main intensity, and add a nonnegative free extra intensity in the larger
model: two versus three independent parameters. Absorber mode is thin,
weighting is unweighted, and one current-model start is used. Free line
positions/widths in real site comparisons add further complexity that this
deliberately simplified example does not reproduce.

The bootstrap noise std is estimated independently from the fitted simpler
model for EACH observed case. All bootstrap spectra, even for the clear-line
case, are generated from that case's fitted ONE-LINE model, not from the
two-line truth used to construct the observations. Both models are refitted
to every trial with their original constraints. The complete reports retain
full-precision results, diagnostics, and all fitting attempts. The .mossa
projects retain the observed models and fits and were verified on reopening.

The browser replay uses saved simulated observations and fitted parameters.
Observation values are rounded to six decimals for display; full-precision
statistics and records are in each report. replay.json records the numerical
core hash. No simulations are discarded from the denominator.

This is a plug-in parametric bootstrap, not the ordinary F-distribution test
and not the Bayesian posterior-predictive method in Protassov et al. (2002).
That paper is cited for why naive distributional tests of additional spectral
components can fail. Its text, figures, and datasets are not redistributed.

Absent case: 55/199 exceedances, p=0.28, Wilson interval 0.218928-0.342305.
Weak case: 7/199 exceedances, p=0.04, interval 0.017142-0.070816.
Clear case: 0/199 exceedances, p=0.005, interval 0-0.018938.

These examples do not estimate a physical site population, certify a phase,
guarantee global optimization, or include uncertainty in source/calibration.
