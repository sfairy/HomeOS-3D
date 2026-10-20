"""item-model 拆分等价校验的回归测试。"""
from __future__ import annotations

import json
import shutil
import subprocess
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
SCRIPT = REPO_ROOT / "ops" / "checks" / "studio" / "verify_item_model.mjs"
NODE = shutil.which("node")
NODE_BIN: str = NODE or "node"


class ItemModelEquivalenceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if NODE is None:
            raise unittest.SkipTest("node not available")

    def test_current_tree_matches_baseline(self) -> None:
        result = subprocess.run(
            [NODE_BIN, str(SCRIPT), "--json"],
            cwd=REPO_ROOT, capture_output=True, text=True, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        data = json.loads(result.stdout)
        self.assertEqual(data["branches"], 59)
        self.assertEqual(data["problems"], 0)
        self.assertGreater(data["pre"], 0)
        self.assertGreater(data["post"], 0)


if __name__ == "__main__":
    unittest.main()
