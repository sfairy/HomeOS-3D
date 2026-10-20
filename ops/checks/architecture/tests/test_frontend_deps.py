"""前端域边界门禁的合成用例测试。"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

GATE = (
    Path(__file__).resolve().parents[4]
    / "homeos"
    / "frontend"
    / "scripts"
    / "check-frontend-deps.mjs"
)
NODE = shutil.which("node")


def run_gate(root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [NODE, str(GATE), "--root", str(root)],
        capture_output=True,
        text=True,
        check=False,
    )


@unittest.skipUnless(NODE, "node 不在 PATH")
class FrontendDepsGateTest(unittest.TestCase):
    def test_deep_import_is_rejected_and_barrel_is_allowed(self) -> None:
        with tempfile.TemporaryDirectory(prefix="frontend-deps-") as tmp:
            root = Path(tmp) / "src"
            (root / "views").mkdir(parents=True)
            (root / "features" / "bar").mkdir(parents=True)
            (root / "features" / "bar" / "Bar.vue").write_text("<template><div /></template>\n")
            (root / "features" / "bar" / "index.ts").write_text(
                "export { default as Bar } from './Bar.vue'\n"
            )
            (root / "features" / "bar" / "entry.ts").write_text(
                "export { default as BarPage } from './Bar.vue'\n"
            )

            (root / "views" / "Bad.vue").write_text(
                "<script setup lang=\"ts\">\n"
                "import Bar from '@/features/bar/Bar.vue'\n"
                "</script>\n"
            )
            bad = run_gate(root)
            self.assertEqual(1, bad.returncode, bad.stderr)
            self.assertIn("views→feature-deep", bad.stderr)

            (root / "views" / "Bad.vue").write_text(
                "<script setup lang=\"ts\">\n"
                "import { Bar } from '@/features/bar'\n"
                "import { BarPage } from '@/features/bar/entry'\n"
                "</script>\n"
            )
            good = run_gate(root)
            self.assertEqual(0, good.returncode, good.stderr)
            self.assertIn("0 violation", good.stdout)


if __name__ == "__main__":
    unittest.main()
