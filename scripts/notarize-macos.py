#!/usr/bin/env python3
"""Notarize an already Developer ID-signed app and create a stapled DMG.

Credentials stay in an existing notarytool Keychain profile. Submission IDs and
payloads are retained, so rerunning resumes a pending request instead of uploading
the same binary again. This script does not create tags or publish releases.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time


def run(*args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f"{args[0]} {args[1]} failed:\n{result.stderr or result.stdout}")
    return result.stdout + result.stderr


def digest(path):
    checksum = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            checksum.update(chunk)
    return checksum.hexdigest()


def write_state(path, state):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(state, indent=2) + "\n")
    temporary.replace(path)


def authentication(profile):
    args = ["--keychain-profile", profile]
    if os.environ.get("MOSSA_NOTARY_KEYCHAIN"):
        args.extend(["--keychain", os.environ["MOSSA_NOTARY_KEYCHAIN"]])
    return args


def notary(arguments, profile, log):
    result = subprocess.run(
        ["xcrun", "notarytool", *arguments, *authentication(profile),
         "--output-format", "json"], capture_output=True, text=True)
    log.write_text(result.stdout)
    log.with_suffix(".stderr.txt").write_text(result.stderr)
    for output in (result.stdout, result.stderr):
        try:
            response = json.loads(output)
            if isinstance(response, dict):
                return result.returncode, response
        except ValueError:
            pass
    raise RuntimeError(f"Notary service did not return JSON; see {log} and its stderr log")


def notarize(payload, profile, directory, name):
    state_path = directory / f"{name}-state.json"
    fingerprint = digest(payload)
    if state_path.exists():
        state = json.loads(state_path.read_text())
        if state["sha256"] != fingerprint:
            raise RuntimeError(f"{payload} changed after submission; use a new state directory")
    else:
        code, response = notary(["submit", str(payload)], profile, directory / f"{name}-submit.json")
        if code or not response.get("id"):
            raise RuntimeError(f"Apple upload failed; see {name}-submit.json")
        state = {"id": response["id"], "sha256": fingerprint, "payload": str(payload), "status": "In Progress"}
        write_state(state_path, state)
    print(f"{name}: Apple submission {state['id']}", flush=True)
    while state["status"] not in ("Accepted", "Invalid", "Rejected"):
        code, response = notary(["wait", state["id"], "--timeout", "45s"], profile, directory / f"{name}-wait.json")
        if response.get("status"):
            state["status"] = response["status"]
            write_state(state_path, state)
        elif code:
            raise RuntimeError(f"Apple status could not be read; resume using the saved submission in {state_path}")
        print(f"{name}: {state['status']}", flush=True)
    run("xcrun", "notarytool", "log", state["id"], *authentication(profile), str(directory / f"{name}-issues.json"))
    if state["status"] != "Accepted":
        raise RuntimeError(f"Apple rejected {name}; see {name}-issues.json")
    return state


def staple(path):
    for operation in ("staple", "validate"):
        for attempt, delay in enumerate((0, 5, 15, 30)):
            if delay:
                time.sleep(delay)
            result = subprocess.run(["xcrun", "stapler", operation, str(path)], capture_output=True, text=True)
            if not result.returncode:
                break
            if result.returncode != 68 or attempt == 3:
                raise RuntimeError(f"Stapler {operation} failed:\n{result.stderr or result.stdout}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", default=os.environ.get("MOSSA_NOTARY_PROFILE"))
    parser.add_argument("--app", type=Path, default=Path("src-tauri/target/release/bundle/macos/MossA.app"))
    parser.add_argument("--dmg", type=Path, required=True, help="Destination disk image; replaces an existing generated DMG")
    parser.add_argument("--state-dir", type=Path)
    args = parser.parse_args()
    if not args.profile:
        parser.error("--profile or MOSSA_NOTARY_PROFILE must name an existing Keychain profile")
    app, dmg = args.app.resolve(), args.dmg.resolve()
    run("codesign", "--verify", "--deep", "--strict", str(app))
    details = run("codesign", "--display", "--verbose=4", str(app))
    identity = re.search(r"^Authority=(Developer ID Application:.+)$", details, re.M)
    cdhash = re.search(r"^CDHash=(\w+)$", details, re.M)
    if not identity or not cdhash or "Timestamp=" not in details or not re.search(r"flags=.*\bruntime\b", details):
        raise RuntimeError("The app needs a timestamped Developer ID signature with hardened runtime")
    directory = (args.state_dir or Path("src-tauri/target/notarization") / cdhash[1]).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    archive = directory / "MossA-signed.zip"
    if not archive.exists():
        run("ditto", "-c", "-k", "--keepParent", str(app), str(archive))
    notarize(archive, args.profile, directory, "app")
    staple(app)
    run("spctl", "--assess", "--type", "execute", "--verbose=2", str(app))
    # Build the installer after stapling, so its contained app also works offline.
    dmg_state = directory / "dmg-state.json"
    if not dmg_state.exists():
        dmg.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="mossa-notarized-dmg-") as stage:
            run("ditto", str(app), str(Path(stage) / app.name))
            (Path(stage) / "Applications").symlink_to("/Applications")
            run("hdiutil", "create", "-volname", "MossA", "-srcfolder", stage,
                "-format", "UDZO", "-ov", str(dmg))
        run("codesign", "--force", "--timestamp", "--sign", identity[1], str(dmg))
    state = json.loads(dmg_state.read_text()) if dmg_state.exists() else None
    if not state or not state.get("stapled"):
        state = notarize(dmg, args.profile, directory, "dmg")
        staple(dmg)
        state["sha256"] = digest(dmg)
        state["stapled"] = True
        write_state(dmg_state, state)
    elif digest(dmg) != state["sha256"]:
        raise RuntimeError("The completed notarized DMG has changed")
    run("codesign", "--verify", "--deep", "--strict", str(app))
    run("codesign", "--verify", "--strict", str(dmg))
    run("spctl", "--assess", "--type", "open", "--context", "context:primary-signature", "--verbose=2", str(dmg))
    run("hdiutil", "verify", str(dmg))
    print(f"Accepted, stapled, and verified:\n{app}\n{dmg}\nLogs: {directory}", flush=True)


if __name__ == "__main__":
    main()
