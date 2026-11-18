import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("release", Path(__file__).with_name("prepare-android-release.py"))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseVersionsTest(unittest.TestCase):
    def test_first_release_increments_source(self):
        self.assertEqual(("2.1.3-beta.1", 208), release.allocate("2.1.2", 207, [], "patch", True))

    def test_beta_train_and_stable_promotion_use_new_codes(self):
        existing = [{"tag_name": "v2.1.3-beta.2", "body": "<!-- anivio-version-code:209 -->"}]
        self.assertEqual(("2.1.3-beta.3", 210), release.allocate("2.1.2", 207, existing, "patch", True))
        self.assertEqual(("2.1.3", 210), release.allocate("2.1.2", 207, existing, "patch", False))

    def test_drafts_reserve_versions_and_unrelated_tags_do_not_break_it(self):
        existing = [{"tag_name": "ci-arm64-123", "body": ""}, {"tag_name": "v2.2.0", "draft": True, "body": "<!-- anivio-version-code:300 -->"}]
        self.assertEqual(("2.2.1", 301), release.allocate("2.1.2", 207, existing, "patch", False))

    def test_minor_and_major_reset_lower_components(self):
        self.assertEqual(("2.2.0", 208), release.allocate("2.1.2", 207, [], "minor", False))
        self.assertEqual(("3.0.0", 208), release.allocate("2.1.2", 207, [], "major", False))


if __name__ == "__main__":
    unittest.main()
