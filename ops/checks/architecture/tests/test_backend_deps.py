"""后端依赖方向门禁（B1/B2/B3）的合成用例测试。"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

GATE = Path(__file__).resolve().parents[1] / "check_backend_deps.py"
BACKEND_SRC = Path(__file__).resolve().parents[4] / "homeos" / "backend" / "src"


def run_gate(root: Path) -> subprocess.CompletedProcess[str]:
    """以 `--json` 跑门禁，便于断言规则名。"""
    return subprocess.run(
        [sys.executable, str(GATE), "--json", "--root", str(root)],
        capture_output=True,
        text=True,
        check=False,
    )


def rules_of(stdout: str) -> set[str]:
    return {item["rule"] for item in json.loads(stdout)}


class BackendDepsGateTest(unittest.TestCase):
    def test_platform_may_not_import_domains(self) -> None:
        """B1：`platform → domains` 是依赖倒置。"""
        with tempfile.TemporaryDirectory(prefix="backend-deps-") as tmp:
            root = Path(tmp)
            (root / "platform" / "core").mkdir(parents=True)
            (root / "platform" / "core" / "bad.py").write_text(
                "from ...domains.ha import entity\n",
                encoding="utf-8",
            )
            result = run_gate(root)
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertEqual({"B1 platform→upper"}, rules_of(result.stdout))

    def test_platform_may_not_import_api(self) -> None:
        """B1：`platform → api` 同样禁止。"""
        with tempfile.TemporaryDirectory(prefix="backend-deps-") as tmp:
            root = Path(tmp)
            (root / "platform").mkdir(parents=True)
            (root / "platform" / "bad.py").write_text(
                "from ..api.router import NestRouter\n",
                encoding="utf-8",
            )
            self.assertEqual({"B1 platform→upper"}, rules_of(run_gate(root).stdout))

    def test_domains_may_not_import_api(self) -> None:
        """B2：`domains → api` 禁止（api 只能被上层装配）。"""
        with tempfile.TemporaryDirectory(prefix="backend-deps-") as tmp:
            root = Path(tmp)
            (root / "domains" / "home_mode").mkdir(parents=True)
            (root / "domains" / "home_mode" / "bad.py").write_text(
                "from ...api.router import NestRouter\n",
                encoding="utf-8",
            )
            self.assertEqual({"B2 lower→api"}, rules_of(run_gate(root).stdout))

    def test_bootstrap_may_import_everything(self) -> None:
        """B2 不约束 bootstrap：README 明写 `bootstrap → 全部`（仅装配）。"""
        with tempfile.TemporaryDirectory(prefix="backend-deps-") as tmp:
            root = Path(tmp)
            (root / "bootstrap").mkdir(parents=True)
            (root / "bootstrap" / "registry.py").write_text(
                "from ..domains.ha import entity\nfrom ..api.router import NestRouter\n",
                encoding="utf-8",
            )
            self.assertEqual(set(), rules_of(run_gate(root).stdout))

    def test_absolute_src_import_is_rejected(self) -> None:
        """B3：绝对 `src.` 导入在 Cython 构建下会炸，必须用相对导入。"""
        with tempfile.TemporaryDirectory(prefix="backend-deps-") as tmp:
            root = Path(tmp)
            (root / "domains" / "ha").mkdir(parents=True)
            (root / "domains" / "ha" / "bad.py").write_text(
                "from src.platform.core.entity.entity_domain import get_entity_domain\nimport src.platform.core\n",
                encoding="utf-8",
            )
            result = run_gate(root)
            self.assertEqual(
                ["B3 absolute-src", "B3 absolute-src"], sorted(item["rule"] for item in json.loads(result.stdout))
            )

    def test_legal_downward_imports_are_clean(self) -> None:
        """合法方向不误报：domains → platform、同层相对导入、stdlib。"""
        with tempfile.TemporaryDirectory(prefix="backend-deps-") as tmp:
            root = Path(tmp)
            (root / "domains" / "home_mode").mkdir(parents=True)
            (root / "domains" / "home_mode" / "good.py").write_text(
                "from __future__ import annotations\n"
                "import asyncio\n"
                "from .presets import resolve_action_kind\n"
                "from ..home_exec.execute_action_sequence import execute_action_sequence\n"
                "from ...platform.core.entity_domain import get_entity_domain\n",
                encoding="utf-8",
            )
            result = run_gate(root)
            self.assertEqual([], json.loads(result.stdout), result.stdout)

    @unittest.skipUnless(BACKEND_SRC.is_dir(), "后端源码树不存在")
    def test_repository_is_clean(self) -> None:
        """当前真实后端源码树必须 0 违规（新增门禁不得自带基线债）。"""
        result = subprocess.run(
            [sys.executable, str(GATE), "--check"],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn("0 violation", result.stdout)

    def test_file_cycle_is_reported(self) -> None:
        """B5：两个模块互相 import 时，任何一方都无法先完成初始化。"""
        with tempfile.TemporaryDirectory(prefix="backend-deps-") as tmp:
            root = Path(tmp)
            (root / "domains" / "ha").mkdir(parents=True)
            (root / "domains" / "ha" / "left.py").write_text(
                "from .right import helper\n\ndef left():\n    return helper()\n",
                encoding="utf-8",
            )
            (root / "domains" / "ha" / "right.py").write_text(
                "from .left import left\n\ndef helper():\n    return left()\n",
                encoding="utf-8",
            )
            result = run_gate(root)
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertEqual({"B5 file-cycle"}, rules_of(result.stdout))

    def test_package_cycle_outside_whitelist_is_reported(self) -> None:
        """B4：包级互依可以存在，但必须显式进白名单，新增即失败。"""
        with tempfile.TemporaryDirectory(prefix="backend-deps-") as tmp:
            root = Path(tmp)
            (root / "domains" / "alpha").mkdir(parents=True)
            (root / "domains" / "beta").mkdir(parents=True)
            (root / "domains" / "alpha" / "a.py").write_text("from ..beta.b import ping\n", encoding="utf-8")
            (root / "domains" / "beta" / "b.py").write_text("from ..alpha.a import ping\n", encoding="utf-8")
            result = run_gate(root)
            self.assertEqual(0, result.returncode, result.stderr)
            rules = rules_of(result.stdout)
            self.assertIn("B4 package-cycle", rules)

    def test_package_init_relative_import_stays_in_own_package(self) -> None:
        """`pkg/__init__.py` 里的 `from .sub import x` 指向自己，不是兄弟包。

        少算这一层（把包文件当成普通模块、用 `parts[:-1]` 当当前包）会让
        `domains/alerts/__init__.py` 的 `from .channels import ...` 被解析成
        `domains.channels` —— 凭空造出一条跨包边，进而伪造出包级环。
        """
        with tempfile.TemporaryDirectory(prefix="backend-deps-") as tmp:
            root = Path(tmp)
            (root / "domains" / "alerts").mkdir(parents=True)
            (root / "domains" / "channels").mkdir(parents=True)
            (root / "domains" / "alerts" / "channels.py").write_text(
                "def resolve() -> int:\n    return 1\n", encoding="utf-8"
            )
            (root / "domains" / "alerts" / "__init__.py").write_text(
                "from .channels import resolve\n", encoding="utf-8"
            )
            (root / "domains" / "channels" / "__init__.py").write_text(
                "from ..alerts.channels import resolve\n", encoding="utf-8"
            )
            result = run_gate(root)
            self.assertEqual([], json.loads(result.stdout), result.stdout)


if __name__ == "__main__":
    unittest.main()
