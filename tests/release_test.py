import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("mossa_release", Path(__file__).resolve().parents[1] / "scripts/release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseGateTest(unittest.TestCase):
    def make_release(self, root):
        version, sha = "2.0.0-rc.1", "a" * 40
        files = {
            "windows": ["x64-setup.exe", "x64_en-US.msi"],
            "linux": ["amd64.deb", "amd64.AppImage"],
            "windows-arm64": ["arm64-setup.exe", "arm64_en-US.msi"],
            "linux-arm64": ["arm64.deb", "aarch64.AppImage"],
            "macos": ["universal.dmg", "universal.app.tar.gz"],
            "browser": ["web.zip"],
        }
        for platform, suffixes in files.items():
            folder = root / platform
            folder.mkdir()
            info = {"version": version, "commit": sha, "dirty": False,
                    "channel": "github-pages" if platform == "browser" else "desktop"}
            (folder / "build-info.json").write_text(json.dumps(info))
            for suffix in suffixes:
                (folder / f"MossA_{version}_{suffix}").write_bytes(b"installer fixture")
            if platform.endswith("-arm64"):
                receipt = {"target": release.DESKTOP_ARTIFACTS[platform], "version": version,
                           "sourceCommit": sha, "workflowCommit": "b" * 40,
                           "hostArch": "arm64", "machine": 0xAA64 if platform.startswith("windows") else 183,
                           "executableSha256": "c" * 64}
                (folder / "target-info.json").write_text(json.dumps(receipt))
        (root / "receipts").mkdir()
        for name in ("app", "dmg"):
            (root / "receipts" / f"{name}-state.json").write_text(json.dumps({
                "id": name, "status": "Accepted", "stapled": True}))
        return version, sha

    def test_complete_release_includes_both_arm64_platforms(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            version, sha = self.make_release(root)
            assets, identities, _ = release.collect_artifacts(root, version, sha)
            self.assertEqual(len((assets / "SHA256SUMS.txt").read_text().splitlines()), 11)
            self.assertIn("linux-arm64", identities)
            self.assertIn("windows-arm64", identities)
            (root / "linux-arm64" / f"MossA_{version}_arm64.deb").unlink()
            (assets / f"MossA_{version}_arm64.deb").unlink()
            with self.assertRaisesRegex(RuntimeError, "incomplete"):
                release.collect_artifacts(root, version, sha)

    def test_arm64_release_rejects_wrong_executable_architecture_or_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            version, sha = self.make_release(root)
            receipt_path = root / "windows-arm64" / "target-info.json"
            receipt = json.loads(receipt_path.read_text())
            for change in ({"machine": 0x8664}, {"hostArch": "x64"}, {"sourceCommit": "d" * 40}):
                receipt_path.write_text(json.dumps({**receipt, **change}))
                with self.assertRaisesRegex(RuntimeError, "ARM64"):
                    release.collect_artifacts(root, version, sha)

    def test_release_artifacts_must_match_clean_tagged_source(self):
        info = {"version": "2.0.0-preview.16", "commit": "a" * 40, "dirty": False, "channel": "desktop"}
        release.validate_identity(info, info["version"], info["commit"])
        for change in ({"dirty": True}, {"commit": "b" * 40}, {"version": "2.0.0"}, {"channel": "github-pages"}):
            with self.assertRaises(RuntimeError):
                release.validate_identity({**info, **change}, info["version"], info["commit"])

    def test_browser_artifact_identity_is_separate_from_desktop(self):
        info = {"version": "2.0.0-rc.1", "commit": "a" * 40, "dirty": False, "channel": "github-pages"}
        release.validate_identity(info, info["version"], info["commit"], "github-pages")
        with self.assertRaises(RuntimeError):
            release.validate_identity(info, info["version"], info["commit"])

    def test_version_cannot_inject_a_ref_or_workflow_expression(self):
        self.assertEqual(release.version_tag("2.0.0-preview.16"), "v2.0.0-preview.16")
        self.assertEqual(release.version_tag("2.0.0-rc.1"), "v2.0.0-rc.1")
        for version in ("main", "2.0.0/evil", "2.0.0;echo", "${{ secrets.APPLE_ID }}"):
            with self.assertRaises(ValueError):
                release.version_tag(version)


if __name__ == "__main__":
    unittest.main()
