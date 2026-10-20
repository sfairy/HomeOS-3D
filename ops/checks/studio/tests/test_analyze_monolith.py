"""checker 版单体分析器的自由变量识别测试。"""
from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
SCRIPT = REPO_ROOT / "ops" / "checks" / "studio" / "analyze_monolith.mjs"
NODE = shutil.which("node")
NODE_BIN: str = NODE or "node"


class AnalyzeMonolithTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if NODE is None:
            raise unittest.SkipTest("node not available")

    def test_free_variables_are_distinguished_from_locals(self) -> None:
        source = """\
function bootX(): void {
  const outer = 1;
  function pure(a: number): number { return a + 1; }
  function usesOuter(a: number): number { return a + outer; }
  void pure; void usesOuter;
}
"""
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "demo.ts"
            out = Path(tmp) / "out.json"
            src.write_text(source)
            result = subprocess.run(
                [NODE_BIN, str(SCRIPT), "--file", str(src), "--boot", "bootX", "--min-lines", "1", "--out", str(out)],
                cwd=REPO_ROOT, capture_output=True, text=True, check=False,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            data = json.loads(out.read_text())
            by_name = {f["name"]: f for f in data["functions"]}
            self.assertEqual(by_name["pure"]["freeCount"], 0)
            self.assertEqual(by_name["pure"]["free"], [])
            self.assertEqual(by_name["usesOuter"]["freeCount"], 1)
            self.assertEqual(by_name["usesOuter"]["free"], ["outer"])


if __name__ == "__main__":
    unittest.main()
