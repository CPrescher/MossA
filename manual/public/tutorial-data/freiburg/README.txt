Freiburg Mössbauer practical — measured teaching data

Adapted for the MossA 2 manual at the course instructor's request.
Source: MossA tutorial conv.pdf. Instructor: Clemens Prescher.

The two almandine .dat files are unchanged measurement files from the supplied exercise
folder. Only download filenames were simplified. See provenance.json for the
original filenames, SHA-256 hashes, number of channels, and analysis settings.
No raw channels were trimmed, normalized, or background-subtracted.

The .mossa files are NEW browser-core worked examples, not archived MATLAB
results or certified composition values. They preserve raw counts, reference
measurements, the fixed 33 T reference assumption, manual center 256.5,
modern magnetic coefficients, bounds, model alternatives, and completed fits.

The original PDFs contain third-party figures and have not been redistributed.
The original SMS tutorial is a separate workflow and is not part of this
almandine adaptation.

Regenerate from the supplied course folder with Node 26, after building WASM:
node --import tsx scripts/prepare-course-tutorial.ts /path/to/exercise-folder

The repository's code license does not establish a new license for third-party
figures or imply that these measurements are certified reference standards.
