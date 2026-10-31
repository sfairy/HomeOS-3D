"""前端域边界门禁的合成用例测试。"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

GATE = Path(__file__).resolve().parents[4] / "ops" / "checks" / "frontend" / "check_frontend_deps.mjs"
NODE = shutil.which("node")
NODE_BIN: str = NODE or "node"


def run_gate(root: Path, *extra: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [NODE_BIN, str(GATE), "--root", str(root), *extra],
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
            (root / "features" / "bar" / "index.ts").write_text("export { default as Bar } from './Bar.vue'\n")
            (root / "features" / "bar" / "entry.ts").write_text("export { default as BarPage } from './Bar.vue'\n")

            (root / "views" / "Bad.vue").write_text(
                "<script setup lang=\"ts\">\nimport Bar from '@/features/bar/Bar.vue'\n</script>\n"
            )
            bad = run_gate(root)
            self.assertEqual(1, bad.returncode, bad.stderr)
            self.assertIn("views→feature-deep", bad.stderr)

            (root / "views" / "Bad.vue").write_text(
                '<script setup lang="ts">\n'
                "import { Bar } from '@/features/bar'\n"
                "import { BarPage } from '@/features/bar/entry'\n"
                "</script>\n"
            )
            good = run_gate(root)
            self.assertEqual(0, good.returncode, good.stderr)
            self.assertIn("0 violation", good.stdout)

    def test_per_page_entry_is_allowed_but_deep_page_import_is_not(self) -> None:
        """多页域按页分流：`entry-<page>` 放行，直接指向 `*Page.vue` 仍禁止。

        背景：两条路由共用一个 entry 模块时，Rollup 会把两个页面合并进同一 chunk，
        懒加载失效（实测设备列表页会连带下载 91KB 的详情页）。
        """
        with tempfile.TemporaryDirectory(prefix="frontend-deps-") as tmp:
            root = Path(tmp) / "src"
            (root / "views").mkdir(parents=True)
            (root / "features" / "multi").mkdir(parents=True)
            (root / "features" / "multi" / "ListPage.vue").write_text("<template><div /></template>\n")
            (root / "features" / "multi" / "DetailPage.vue").write_text("<template><div /></template>\n")
            (root / "features" / "multi" / "entry-list.ts").write_text(
                "export { default as ListPage } from './ListPage.vue'\n"
            )
            (root / "features" / "multi" / "entry-detail.ts").write_text(
                "export { default as DetailPage } from './DetailPage.vue'\n"
            )

            (root / "views" / "List.vue").write_text(
                '<script setup lang="ts">\n'
                "import { ListPage } from '@/features/multi/entry-list'\n"
                "import { DetailPage } from '@/features/multi/entry-detail'\n"
                "</script>\n"
            )
            allowed = run_gate(root)
            self.assertEqual(0, allowed.returncode, allowed.stderr)
            self.assertIn("0 violation", allowed.stdout)

            (root / "views" / "List.vue").write_text(
                "<script setup lang=\"ts\">\nimport ListPage from '@/features/multi/ListPage.vue'\n</script>\n"
            )
            denied = run_gate(root)
            self.assertEqual(1, denied.returncode, denied.stderr)
            self.assertIn("views→feature-deep", denied.stderr)

    def test_custom_alias_is_resolved_not_silently_skipped(self) -> None:
        """`--alias` 让同一套规则能套到 `homeos-store`（其别名是 `@store/*`）。

        这条用例守的是一个很隐蔽的失效模式：解析不了的前缀会被当成外部包**静默放行**，
        于是门禁照样打印「0 violation」—— 绿色但什么都没检查。
        """
        with tempfile.TemporaryDirectory(prefix="frontend-deps-alias-") as tmp:
            root = Path(tmp) / "src"
            (root / "views").mkdir(parents=True)
            (root / "shared").mkdir(parents=True)
            (root / "views" / "Home.vue").write_text("<template><div /></template>\n")
            (root / "shared" / "bad.ts").write_text("import Home from '@store/views/Home.vue'\nexport default Home\n")

            without = run_gate(root)
            self.assertEqual(0, without.returncode, without.stderr)
            self.assertIn("0 violation", without.stdout)

            with_alias = run_gate(root, "--alias", "@store/=")
            self.assertEqual(1, with_alias.returncode, with_alias.stderr)
            self.assertIn("shared→upper", with_alias.stderr)


if __name__ == "__main__":
    unittest.main()
