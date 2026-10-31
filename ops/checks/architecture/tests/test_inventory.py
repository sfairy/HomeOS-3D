"""模块盘点脚本的解析规则测试（不依赖被分析代码）。"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ARCH_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ARCH_DIR))

import inventory


class ModuleGroupingTest(unittest.TestCase):
    def test_python_relative_import_resolution(self) -> None:
        self.assertEqual(
            inventory.resolve_python_import("api/system/backup.py", 3, "platform.core"),
            "platform.core",
        )
        self.assertEqual(
            inventory.resolve_python_import("domains/agent/service.py", 2, "platform.core"),
            "domains.platform.core",
        )
        self.assertEqual(
            inventory.resolve_python_import("api/foo.py", 1, "schemas"),
            "api.schemas",
        )

    def test_module_grouping(self) -> None:
        self.assertEqual(inventory.backend_module_for("api/system/backup.py"), "api.system")
        self.assertEqual(inventory.backend_module_for("api/__init__.py"), "api")
        self.assertEqual(
            inventory.backend_module_for_dotted("src.domains.agent.runtime.service"), "domains.agent"
        )
        self.assertEqual(
            inventory.frontend_module_for("features/settings/index.ts"), "features.settings"
        )
        self.assertEqual(
            inventory.frontend_module_for("studio/app/3d-studio/boot.ts"),
            "studio.app.3d-studio",
        )
        self.assertEqual(
            inventory._resolve_ts_target("views/SettingsView.vue", "@/features/settings"),
            "features/settings",
        )


if __name__ == "__main__":
    unittest.main()
