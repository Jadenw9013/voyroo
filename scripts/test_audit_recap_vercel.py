import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("audit", Path(__file__).with_name("audit-recap-vercel.py"))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class RedactionTest(unittest.TestCase):
    def test_values_and_provider_payloads_never_enter_evidence(self):
        sentinel = "DO-NOT-RECORD-THIS-SECRET"
        result = audit.sanitize(
            {"name": "voyroo", "id": "project", "env": [{"value": sentinel}], "secret": sentinel,
             "link": {"productionBranch": "main", "deployHooks": [{"url": sentinel}]}},
            {"envs": [{"key": "KV_REST_API_TOKEN", "target": ["preview", "production"],
                       "value": sentinel, "id": sentinel, "comment": sentinel, "type": "sensitive"}]},
            {"checks": []}, {"membership": {"role": "OWNER", "uid": sentinel}},
            {"deployments": [{"uid": "deployment", "env": sentinel, "meta": {"token": sentinel}}]},
        )
        encoded = json.dumps(result)
        self.assertNotIn(sentinel, encoded)
        self.assertEqual(result["isolationVerdict"], "FAIL_SHARED_SCOPES")
        self.assertEqual(result["deployHookCount"], 1)

    def test_separate_scopes_are_not_claimed_as_backend_isolation(self):
        result = audit.sanitize({"name": "voyroo", "id": "project"}, {"envs": []}, {"checks": []}, {}, {})
        self.assertEqual(result["isolationVerdict"], "REQUIRES_INDEPENDENT_BACKEND_VERIFICATION")


if __name__ == "__main__":
    unittest.main()
