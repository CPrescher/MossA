#!/usr/bin/env python3
"""Save or verify the complete local fitting benchmark evidence."""
import argparse
import hashlib
import json
import lzma
import re
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "validation-data/performance"
ARCHIVE = DEST / "fitting-evidence.tar.xz"
MANIFEST = DEST / "evidence-manifest.json"


def stream_digest(stream):
    value = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        value.update(chunk)
    return value.hexdigest()


def digest(path):
    with path.open("rb") as stream:
        return stream_digest(stream)


def verify():
    manifest = json.loads(MANIFEST.read_text())
    assert digest(ARCHIVE) == manifest["archive_sha256"], "Archive checksum differs"
    seen = set()
    with tarfile.open(ARCHIVE, "r|xz") as archive:
        for member in archive:
            assert member.isfile() and member.name in manifest["files"], member.name
            assert member.name not in seen, member.name
            stream = archive.extractfile(member)
            assert stream_digest(stream) == manifest["files"][member.name], member.name
            seen.add(member.name)
    assert seen == set(manifest["files"]), "Archive members differ"
    print(f"Verified {len(seen)} evidence files and archive SHA-256.")


def create():
    files = []
    log_names = set()
    for verifier in (ROOT / "scripts").glob("verify-*.mjs"):
        log_names.update(re.findall(r"/tmp/(mossa-[A-Za-z0-9_.-]+\.log)", verifier.read_text()))
    for directory in [DEST, ROOT / "validation-data/benchmark"]:
        for path in directory.rglob("*"):
            if not path.is_file() or path in [ARCHIVE, MANIFEST] or path.name.endswith(".tar.xz.tmp"):
                continue
            if path.parent == DEST / "logs" and path.name not in log_names:
                continue
            if path.suffix == ".md":
                continue  # Reports are tracked as ordinary reviewable text.
            files.append(path)
    files.sort()
    hashes = {}
    temp = ARCHIVE.with_suffix(ARCHIVE.suffix + ".tmp")
    with lzma.open(temp, "wb", preset=3) as compressed:
        with tarfile.open(fileobj=compressed, mode="w|", format=tarfile.PAX_FORMAT) as archive:
            for i, path in enumerate(files):
                name = path.relative_to(ROOT).as_posix()
                hashes[name] = digest(path)
                info = tarfile.TarInfo(name)
                info.size = path.stat().st_size
                info.mode = path.stat().st_mode & 0o777
                with path.open("rb") as stream:
                    archive.addfile(info, stream)
                if i and i % 250 == 0:
                    print(f"Archived {i}/{len(files)} files", flush=True)
    temp.replace(ARCHIVE)
    MANIFEST.write_text(json.dumps({
        "format": "tar.xz", "archive": ARCHIVE.relative_to(ROOT).as_posix(),
        "archive_sha256": digest(ARCHIVE), "archive_bytes": ARCHIVE.stat().st_size,
        "description": "Complete raw fitting benchmark records, historical native/WASM builds and source snapshots, input benchmark data, and preserved logs. Reports are tracked separately.",
        "files": hashes,
    }, indent=2) + "\n")
    print(f"Saved {len(files)} files in {ARCHIVE.stat().st_size / 2**20:.1f} MiB.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true")
    options = parser.parse_args()
    verify() if options.verify else create()
