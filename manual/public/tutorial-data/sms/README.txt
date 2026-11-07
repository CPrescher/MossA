SMS Fe7C3 tutorial — supplied measured teaching files

Source: MossA tutorial SMS.pdf and its SMS folder, supplied for the Freiburg
teaching practical. Adapted for the MossA 2 manual at the instructor's request.
The original PDF is not redistributed.

Iron foil calibration.txt, singleLineBefore.dat, singleLineAfter.dat, and
Fe7C3_01GPa.mca are copied byte for byte with their original names. See
provenance.json for SHA-256 hashes, input formats, and analysis assumptions.

The tutorial/filename say 1 GPa. The internal MCA #F header names 02GPa.
This source discrepancy is UNRESOLVED. Neither the tutorial adaptation nor
the new fits independently assigns a pressure to this spectrum.

The singlet files contain velocity, total counts, difference, forward counts,
and reverse counts. The app fits original columns 1 and 2. It does not fit
the difference or treat auxiliary columns as additional observations.
The MCA reader retains acquisition headers and all 1,024 raw counts; it does
not interpret #@CALIB as a velocity scale. Reversal negates the complete
calibrated velocity, including its center-shift correction.

sms-start.mossa: calibrated sample in original direction, no sample sites.
sms-worked.mossa: NEW browser worked fits, not MATLAB reference outputs.
source-calibrations.json: both dedicated Lorentzian-squared source fits,
using known absorber width 0.215 mm/s; the arithmetic mean is held fixed
in the sample model. No source/calibration uncertainty is propagated into
the later sample-fit std.

Regenerate after building WASM, from the repository root with Node 26:
node --import tsx scripts/prepare-sms-tutorial.ts /path/to/original/SMS

The code license does not establish a new license for third-party figures
or make these measurements certified reference standards.
