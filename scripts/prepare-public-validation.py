#!/usr/bin/env python3
"""Download and prepare attributed measured spectra, without changing MossA."""

import hashlib
import json
import math
from pathlib import Path
import urllib.request
import zipfile


ROOT = Path(__file__).resolve().parents[1] / "validation-data"
RECORDS = ("14959531", "15331051")


def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()


def checksum(data, specification):
    algorithm, expected = specification.split(":", 1)
    if hashlib.new(algorithm, data).hexdigest() != expected:
        raise ValueError(f"Checksum mismatch: {specification}")


def write_spectrum(record, member, data, rows, ordinate, transformation, **extra):
    for row in rows:
        if len(row) != 2:
            raise ValueError(f"Invalid row in {member}")
        for value in row:
            if not math.isfinite(float(value)):
                raise ValueError(f"Nonfinite value in {member}")
    velocities = [float(row[0]) for row in rows]
    if len(set(velocities)) != len(rows) or len(rows) < 8:
        raise ValueError(f"Invalid velocity grid in {member}")
    destination = ROOT / "ready-to-open" / record / (Path(member).stem + ".csv")
    destination.parent.mkdir(parents=True, exist_ok=True)
    source = f"https://zenodo.org/records/{record}"
    destination.write_text(
        f"# Source: {source}\n# License: CC BY 4.0; see ../../public/zenodo-{record}/record.json\n"
        f"# Archive member: {member}\n# {transformation}\n"
        f"# Velocity unit: mm/s\nvelocity,{ordinate}\n"
        + "".join(f"{x},{y}\n" for x, y in rows)
    )
    return {
        "file": str(destination.relative_to(ROOT)),
        "record": record,
        "source": source,
        "archive_member": member,
        "source_member_sha256": hashlib.sha256(data).hexdigest(),
        "derived_file_sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
        "rows": len(rows),
        "velocity_range_mm_s": [min(velocities), max(velocities)],
        "ordinate": ordinate,
        "transformation": transformation,
        "license": "CC BY 4.0",
        **extra,
    }


def main():
    spectra = []
    aliases = []
    for record in RECORDS:
        directory = ROOT / "public" / ("zenodo-" + record)
        directory.mkdir(parents=True, exist_ok=True)
        metadata_path = directory / "record.json"
        if not metadata_path.exists():
            metadata_path.write_bytes(fetch(f"https://zenodo.org/api/records/{record}"))
        metadata = json.loads(metadata_path.read_text())
        if str(metadata["id"]) != record or metadata["metadata"]["license"]["id"] != "cc-by-4.0":
            raise ValueError("Unexpected record or license")
        for entry in metadata["files"]:
            target = directory / Path(entry["key"]).name
            data = target.read_bytes() if target.exists() else fetch(entry["links"]["self"])
            checksum(data, entry["checksum"])
            if not target.exists():
                target.write_bytes(data)
        archive = directory / ("data.zip" if record == "14959531" else "JGR-SE_Geymond2025.zip")
        seen = {}
        with zipfile.ZipFile(archive) as bundle:
            for member in bundle.namelist():
                if member.startswith("__MACOSX/"):
                    continue
                recoil = record == "14959531" and member.startswith("Moessbauer/") and member.endswith(".fit")
                confit = record == "15331051" and member.endswith("v.exp") and "/MSdata_all/" in member
                if not recoil and not confit:
                    continue
                data = bundle.read(member)
                digest = hashlib.sha256(data).hexdigest()
                if digest in seen:
                    aliases.append({"record": record, "archive_member": member, "identical_to": seen[digest]})
                    continue
                seen[digest] = member
                # Preserve the source fit/analysis file separately from the observations.
                original = directory / "selected-originals" / member
                original.parent.mkdir(parents=True, exist_ok=True)
                original.write_bytes(data)
                lines = data.decode("utf-8-sig").splitlines()
                if recoil:
                    count = int(lines[2])
                    values = [line.split() for line in lines[3:]]
                    if len(values) != count or any(len(row) < 4 for row in values):
                        raise ValueError(f"Unexpected Recoil structure: {member}")
                    spectra.append(write_spectrum(
                        record, member, data, [row[:2] for row in values], "observed_counts",
                        "Selected v (mm/s) and Iobs columns; no rescaling, folding, smoothing, or refitting.",
                        reference_fit_columns=lines[1].split("\t")[2:],
                        suggested_weighting="observed-count or unweighted; compare explicitly",
                    ))
                else:
                    count = int(lines[0][:3])
                    values = lines[2:2 + count]
                    # CONFIT fixed fields: channel[0:3], velocity[3:12], relative intensity[12:21].
                    # The final field is deliberately excluded: do not infer raw counts from it.
                    if len(values) != count or any(int(row[:3]) != i for i, row in enumerate(values, 1)):
                        raise ValueError(f"Unexpected CONFIT structure: {member}")
                    rows = [(row[3:12].strip(), row[12:21].strip()) for row in values]
                    spectra.append(write_spectrum(
                        record, member, data, rows, "observed_relative_intensity",
                        "Selected supplied calibrated velocity and relative observed intensity from CONFIT fixed fields; no new calibration or normalization.",
                        suggested_weighting="unweighted; normalized intensities are not raw Poisson counts",
                        scope="296K folders are initial fit cases; Additional_LHT0T and Additional_LHT6T are advanced model challenges",
                    ))
                print(f"Prepared {spectra[-1]['file']} ({spectra[-1]['rows']} points)")
    manifest = {"spectra": spectra, "byte_identical_aliases": aliases}
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Prepared {len(spectra)} spectra; {len(aliases)} identical alias excluded.")


if __name__ == "__main__":
    main()
