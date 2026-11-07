SYNCmoss measured-standard tutorial for MossA

Upstream: https://github.com/sergey-yaroslavtsev/syncmoss
Pinned commit: b712fbc1521004a47409b964b9ab012fe5c5e255
Original author: Sergey Yaroslavtsev, ESRF
Copyright (c) European Synchrotron Radiation Facility (ESRF)
License: MIT. The complete upstream notice is in UPSTREAM_LICENSE.txt.

Please credit the original software and data:
Yaroslavtsev, S. (2023). SYNCmoss software package for fitting Mossbauer
spectra measured with a synchrotron Mossbauer source.
Journal of Synchrotron Radiation 30, 596-604.
https://doi.org/10.1107/S1600577523001686

Standard_CMS.dat, Standard_SMS.dat, and Calibration.dat are byte-identical
copies of syncmoss/parameters/ files at that commit. All headers and all
velocity/count rows are retained. Calibration.dat and Standard_CMS.dat
contain the same numeric observations and are not independent datasets.
Per-file URLs, Git blob hashes, SHA-256 hashes, and header records are in
provenance.json. The pinned upstream LICENSE is also byte-identical.

cms-start.mossa and sms-start.mossa contain unfitted teaching models.
syncmoss-worked.mossa contains two independent spectra and four NEW MossA
fits, including deliberate approximations with poor residuals. The fits
are not the author's SYNCmoss results and do not reproduce a published
figure model. fit-results.json retains complete MossA fit outputs.

The SMS starter/worked project supplies the three-Gaussian response
converted from the original #@INSexp header. source-profile.json records
the original values, response reflection, normalization, and centering.
It is a supplied source response, not a new singlet-source calibration.
Opening the raw .dat in MossA imports observations only; it does not
interpret #@INSexp, #@INSint, or #@GCMS as MossA settings.

CMS models are empirical thin-model line-shape comparisons; they do not
implement the original GCMS instrument model. SMS uses a scalar random
powder sextet and a fixed 0.098 mm/s intrinsic absorber width. It does not
model arbitrary polarization/texture, relaxation, or propagate fixed-source
and calibration uncertainties. The squared-source model is a deliberate
fixed-width control, not an optimized source or a formal model-selection
test. See provenance.json and the tutorial for assumptions and limits.

Regenerate worked files, using Node 26 and the production compiled WASM:
node --import tsx scripts/prepare-syncmoss-tutorial.ts

Original tutorial text, new MossA fits, and new screenshots/plots are
prepared for the MossA manual. No SYNCmoss screenshots or paper figures
are redistributed. Attribution does not imply author or ESRF endorsement.
