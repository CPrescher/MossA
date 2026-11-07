"""Exercise restart behavior without contacting Apple or reading credentials."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("notarize_macos", Path(__file__).resolve().parents[1] / "scripts/notarize-macos.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class NotarizationResumeTest(unittest.TestCase):
    def test_ci_can_use_an_existing_ephemeral_signing_keychain(self):
        with patch.dict(module.os.environ, {"MOSSA_NOTARY_KEYCHAIN": "/tmp/signing.keychain-db"}):
            self.assertEqual(module.authentication("existing-profile"), ["--keychain-profile", "existing-profile", "--keychain", "/tmp/signing.keychain-db"])

    def test_interrupted_upload_resumes_saved_id_and_rejects_changed_payload(self):
        with tempfile.TemporaryDirectory() as name:
            directory = Path(name)
            payload = directory / "app.zip"
            payload.write_bytes(b"signed application")
            calls = []

            def service(arguments, profile, log):
                self.assertEqual(profile, "test-profile")
                calls.append(arguments)
                if arguments[0] == "submit":
                    return 0, {"id": "saved-submission-id"}
                raise RuntimeError("Network interrupted")

            with patch.object(module, "notary", side_effect=service):
                with self.assertRaisesRegex(RuntimeError, "Network interrupted"):
                    module.notarize(payload, "test-profile", directory, "app")
            self.assertEqual(json.loads((directory / "app-state.json").read_text())["id"], "saved-submission-id")

            def resume(arguments, profile, log):
                calls.append(arguments)
                self.assertEqual(arguments, ["wait", "saved-submission-id", "--timeout", "45s"])
                return 0, {"id": "saved-submission-id", "status": "Accepted"}

            with patch.object(module, "notary", side_effect=resume), patch.object(module, "run"):
                state = module.notarize(payload, "test-profile", directory, "app")
                self.assertEqual(state["status"], "Accepted")
                self.assertEqual(sum(command[0] == "submit" for command in calls), 1)
                payload.write_bytes(b"different application")
                with self.assertRaisesRegex(RuntimeError, "changed after submission"):
                    module.notarize(payload, "test-profile", directory, "app")
                self.assertEqual(len(calls), 3)


if __name__ == "__main__":
    unittest.main()
