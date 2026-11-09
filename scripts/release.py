#!/usr/bin/env python3
"""Build a complete MossA release from main using existing GitHub credentials.

The default stages a draft. --publish publishes only after every build and
notarization check passes. Apple credentials remain in the signing repository.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
REPO = "CPrescher/MossA"
SIGNING_REPO = "Dioptas/Dioptas"
SIGNING_BASE = "485cbcaf26932534a5394a5c3dd878b3da122461"
WORKFLOW_NAME = "Notarize MossA release"


def command(*args, cwd=ROOT, input=None):
    result = subprocess.run(args, cwd=cwd, input=input, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(f"{args[0]} {args[1]} failed:\n{result.stderr or result.stdout}")
    return result.stdout.strip()


def version_tag(version):
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[a-z0-9]+(?:\.[a-z0-9]+)*)?", version):
        raise ValueError("Use a semantic version such as 2.0.0-preview.16")
    return "v" + version


def validate_identity(info, version, sha, channel="desktop"):
    if info.get("version") != version or info.get("commit") != sha or info.get("dirty"):
        raise RuntimeError("An artifact does not match the clean tagged release source")
    if info.get("channel") != channel:
        raise RuntimeError(f"Expected a {channel} build")


def find_run(repo, branch, name, sha=None, timeout=180):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        runs = json.loads(command("gh", "run", "list", "--repo", repo, "--branch", branch,
                                  "--limit", "50", "--json", "databaseId,workflowName,headSha,status"))
        if repo == SIGNING_REPO:
            for run in runs:
                if run["workflowName"] != name and run["status"] != "completed":
                    subprocess.run(["gh", "run", "cancel", str(run["databaseId"]), "--repo", repo], capture_output=True)
        for run in runs:
            if run["workflowName"] == name and (not sha or run["headSha"] == sha):
                return run["databaseId"]
        time.sleep(10)
    raise RuntimeError(f"No matching {name} run appeared for {branch}")


def wait_run(repo, run_id):
    previous = None
    deadline = time.monotonic() + 7200
    while time.monotonic() < deadline:
        run = json.loads(command("gh", "run", "view", str(run_id), "--repo", repo,
                                 "--json", "status,conclusion,jobs,url"))
        active = "; ".join(f"{j['name']}: " + next((s["name"] for s in j.get("steps", []) if s["status"] == "in_progress"), j["status"])
                           for j in run["jobs"] if j["status"] != "completed")
        if active != previous:
            print(f"{repo} #{run_id}: {active or run['status']}", flush=True)
            previous = active
        if run["status"] == "completed":
            if run["conclusion"] != "success":
                raise RuntimeError(f"Build failed: {run['url']}; no release was published")
            return run["url"]
        time.sleep(20)
    raise RuntimeError("CI is still pending; rerun this command to resume")


def signing_branch(version, sha):
    branch = "codex/mossa-release-" + version
    workflow = (ROOT / ".github/release-templates/macos-signing.yml").read_text()
    for key, value in {"@VERSION@": version, "@SOURCE_SHA@": sha, "@SIGNING_BRANCH@": branch}.items():
        workflow = workflow.replace(key, value)
    path = ".github/workflows/mossa-release-notarize.yml"
    # Reuse an existing attempt only if it pins exactly the same source/template.
    probe = subprocess.run(["gh", "api", f"repos/{SIGNING_REPO}/contents/{path}?ref={branch}"],
                           text=True, capture_output=True)
    if probe.returncode == 0:
        existing = json.loads(probe.stdout)
        if base64.b64decode(existing["content"]).decode() != workflow:
            raise RuntimeError("This signing version already targets different source; use a new version")
        return branch
    # Prepare a one-file branch without changing either working checkout.
    with tempfile.TemporaryDirectory(prefix="mossa-signing-ref-") as directory:
        command("git", "init", "-q", directory)
        command("git", "remote", "add", "origin", f"https://github.com/{SIGNING_REPO}.git", cwd=directory)
        command("git", "config", "credential.helper", "!gh auth git-credential", cwd=directory)
        command("git", "config", "user.name", command("git", "config", "user.name"), cwd=directory)
        command("git", "config", "user.email", command("git", "config", "user.email"), cwd=directory)
        command("git", "fetch", "-q", "--depth", "1", "origin", SIGNING_BASE, cwd=directory)
        command("git", "read-tree", SIGNING_BASE, cwd=directory)
        blob = command("git", "hash-object", "-w", "--stdin", cwd=directory, input=workflow)
        command("git", "update-index", "--add", "--cacheinfo", "100644", blob, path, cwd=directory)
        tree = command("git", "write-tree", cwd=directory)
        commit = command("git", "commit-tree", tree, "-p", SIGNING_BASE, "-m", f"Build and notarize MossA {version}", cwd=directory)
        command("git", "push", "origin", f"{commit}:refs/heads/{branch}", cwd=directory)
    return branch


def download(repo, run_id, name, directory):
    directory.mkdir(parents=True, exist_ok=True)
    if not any(directory.iterdir()):
        command("gh", "run", "download", str(run_id), "--repo", repo, "--name", name, "--dir", str(directory))


def collect_artifacts(work, version, sha):
    output = work / "assets"
    output.mkdir(exist_ok=True)
    identities = {}
    for platform in ("windows", "linux", "macos", "browser"):
        folder = work / platform
        info = json.loads(next(folder.rglob("build-info.json")).read_text())
        validate_identity(info, version, sha, "github-pages" if platform == "browser" else "desktop")
        identities[platform] = info
        for file in folder.rglob("*"):
            if file.is_file() and (file.suffix in (".exe", ".msi", ".deb", ".AppImage", ".dmg", ".zip") or file.name.endswith(".app.tar.gz")):
                shutil.copy2(file, output / file.name)
    expected = {f"MossA_{version}_x64-setup.exe", f"MossA_{version}_x64_en-US.msi",
                f"MossA_{version}_amd64.deb", f"MossA_{version}_amd64.AppImage",
                f"MossA_{version}_universal.dmg", f"MossA_{version}_universal.app.tar.gz", f"MossA_{version}_web.zip"}
    if {p.name for p in output.iterdir()} - {"SHA256SUMS.txt", "build-provenance.json"} != expected:
        raise RuntimeError("The release installer set is incomplete or contains unexpected files")
    receipts = {}
    for name in ("app", "dmg"):
        state = json.loads(next((work / "receipts").rglob(f"{name}-state.json")).read_text())
        if state.get("status") != "Accepted" or (name == "dmg" and not state.get("stapled")):
            raise RuntimeError("Apple has not accepted and stapled the complete Mac distribution")
        receipts[name] = {"id": state["id"], "status": state["status"]}
    hashes = []
    for path in sorted(output.iterdir()):
        if path.name in expected:
            digest = hashlib.sha256()
            with path.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(chunk)
            hashes.append(f"{digest.hexdigest()}  {path.name}")
    (output / "SHA256SUMS.txt").write_text("\n".join(hashes) + "\n")
    return output, identities, receipts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("version")
    parser.add_argument("--ref", default="main")
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--notes-file", type=Path, help="Use reviewed Markdown release notes instead of the generic preview notes")
    args = parser.parse_args()
    tag = version_tag(args.version)
    reviewed_notes = args.notes_file.read_text() if args.notes_file else None
    if reviewed_notes is not None and not reviewed_notes.strip():
        raise ValueError("Release notes must not be empty")
    origin = command("git", "remote", "get-url", "origin").rstrip("/")
    if not re.fullmatch(r"(?:https://github\.com/|git@github\.com:|ssh://git@github\.com/)CPrescher/MossA(?:\.git)?", origin, re.I):
        raise RuntimeError("Run from the CPrescher/MossA checkout; origin points elsewhere")
    command("git", "fetch", "origin", args.ref)
    sha = command("git", "rev-parse", "FETCH_HEAD")
    package = json.loads(command("git", "show", f"{sha}:package.json"))
    if package["version"] != args.version:
        raise RuntimeError("Release version must match package.json at the selected source commit")
    # Never move an existing public tag or overwrite a published release.
    existing = subprocess.run(["gh", "release", "view", tag, "--repo", REPO, "--json", "isDraft"], text=True, capture_output=True)
    if existing.returncode == 0 and not json.loads(existing.stdout)["isDraft"]:
        raise RuntimeError("This release is already published; use a new version")
    remote = command("git", "ls-remote", "--tags", "origin", f"refs/tags/{tag}", f"refs/tags/{tag}^{{}}")
    if remote:
        command("git", "fetch", "origin", f"refs/tags/{tag}:refs/tags/{tag}")
        if command("git", "rev-parse", f"{tag}^{{}}") != sha:
            raise RuntimeError("Existing release tag points to different source")
    else:
        command("git", "tag", "-a", tag, sha, "-m", f"MossA {args.version}")
        command("git", "push", "origin", f"refs/tags/{tag}")
    work = ROOT / "src-tauri/target/releases" / args.version
    work.mkdir(parents=True, exist_ok=True)
    desktop_run = find_run(REPO, tag, "Build MossA desktop apps", sha)
    branch = signing_branch(args.version, sha)
    signing_run = find_run(SIGNING_REPO, branch, WORKFLOW_NAME)
    state = {"version": args.version, "tag": tag, "source_sha": sha, "desktop_run": desktop_run, "signing_run": signing_run, "signing_branch": branch}
    (work / "release-state.json").write_text(json.dumps(state, indent=2) + "\n")
    print(json.dumps(state), flush=True)
    wait_run(REPO, desktop_run)
    wait_run(SIGNING_REPO, signing_run)
    for platform, artifact in (("windows", "MossA-x86_64-pc-windows-msvc"), ("linux", "MossA-x86_64-unknown-linux-gnu")):
        download(REPO, desktop_run, artifact, work / platform)
    download(REPO, desktop_run, "MossA-browser", work / "browser")
    download(SIGNING_REPO, signing_run, "MossA-macOS-universal-notarized", work / "macos")
    download(SIGNING_REPO, signing_run, "MossA-notarization-recovery", work / "receipts")
    assets, identities, receipts = collect_artifacts(work, args.version, sha)
    (assets / "build-provenance.json").write_text(json.dumps({**state, "builds": identities, "notarization": receipts}, indent=2) + "\n")
    notes = f"""MossA {args.version}

Offline desktop apps and the browser app share the Rust/WebAssembly fitting engine and portable .mossa projects. The manual, search, fonts, examples, and tutorial data are bundled.

- macOS: universal DMG for Apple Silicon and Intel, Developer ID signed, notarized, and stapled. Drag MossA to Applications.
- Windows x64: EXE installer or MSI. Both include the WebView2 offline installer. Windows installers are currently unsigned.
- Linux x64: AppImage or DEB. Make the AppImage executable before launching; DEB requires its declared GTK/WebKit dependencies.

This is a scientific preview. Review model assumptions, calibration, residuals, and uncertainty limits before using results in research. Existing MATLAB .map projects require conversion.

[Open the browser app](https://cprescher.github.io/MossA/) · [User manual](https://cprescher.github.io/MossA/manual/) · [Original MATLAB source](https://github.com/CPrescher/MossA/tree/matlab-legacy)

Source: `{sha}`. SHA256SUMS.txt and build-provenance.json identify the downloads and accepted Apple submissions.
"""
    notes_file = work / "release-notes.md"
    notes_file.write_text(reviewed_notes if reviewed_notes is not None else notes)
    # Recheck after CI; never clobber a release somebody published meanwhile.
    existing = subprocess.run(["gh", "release", "view", tag, "--repo", REPO, "--json", "isDraft"], text=True, capture_output=True)
    if existing.returncode == 0 and not json.loads(existing.stdout)["isDraft"]:
        raise RuntimeError("The release was published while CI ran; refusing to replace its assets")
    if existing.returncode:
        create = ["gh", "release", "create", tag, "--repo", REPO, "--verify-tag", "--draft", "--title", f"MossA {args.version}", "--notes-file", str(notes_file)]
        if "-" in args.version:
            create += ["--prerelease"]
        command(*create)
    else:
        command("gh", "release", "edit", tag, "--repo", REPO, "--notes-file", str(notes_file))
    command("gh", "release", "upload", tag, "--repo", REPO, "--clobber", *[str(p) for p in sorted(assets.iterdir())])
    if args.publish:
        command("gh", "release", "edit", tag, "--repo", REPO, "--draft=false", "--latest=false" if "-" in args.version else "--latest=true")
    print(f"{'Published' if args.publish else 'Draft ready'}: https://github.com/{REPO}/releases/tag/{tag}", flush=True)


if __name__ == "__main__":
    main()
