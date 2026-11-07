import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("mossa_release", Path(__file__).resolve().parents[1] / "scripts/release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseGateTest(unittest.TestCase):
    def test_release_artifacts_must_match_clean_tagged_source(self):
        info = {"version": "2.0.0-preview.16", "commit": "a" * 40, "dirty": False, "channel": "desktop"}
        release.validate_identity(info, info["version"], info["commit"])
        for change in ({"dirty": True}, {"commit": "b" * 40}, {"version": "2.0.0"}, {"channel": "github-pages"}):
            with self.assertRaises(RuntimeError):
                release.validate_identity({**info, **change}, info["version"], info["commit"])

    def test_version_cannot_inject_a_ref_or_workflow_expression(self):
        self.assertEqual(release.version_tag("2.0.0-preview.16"), "v2.0.0-preview.16")
        for version in ("main", "2.0.0/evil", "2.0.0;echo", "${{ secrets.APPLE_ID }}"):
            with self.assertRaises(ValueError):
                release.version_tag(version)


if __name__ == "__main__":
    unittest.main()
