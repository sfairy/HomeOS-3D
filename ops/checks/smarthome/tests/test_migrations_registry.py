"""迁移注册表回归：已写入数据库的版本不得被删除或改名。

## 为什么需要这条测试

实测踩到过：开发期 `alert_rules` 的三列先拆成两条迁移登记，数据库记下了
``17 / alert-rule-escalation-column / h0017-v1``；后来把三列合并进迁移 15 时删掉了 17，
于是**所有已有该记录的库都拒绝启动**：

    SchemaMigrationError: 数据库记录的迁移版本 17（alert-rule-escalation-column）
    在当前代码中不存在；拒绝启动。

``schema_migrate`` 的判据是「数据库记录的每个版本在当前代码里必须存在，且 checksum 逐字一致」。
这意味着迁移是**只增不减**的契约：删版本、改 name、改 checksum 都会让存量库起不来。

这条测试钉住三件事：

1. 版本号从 1 连续、不重复（避免漏登记或撞号）；
2. name / checksum 非空且唯一（checksum 撞车会让漂移检测失效）；
3. 已发布的历史版本（15/16/17）名称与 checksum 逐字固定 —— 改它们等于要求所有存量库
   手工改库。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from src.platform.core.db.migrations import MIGRATIONS


class MigrationRegistryTests(unittest.TestCase):
    def test_versions_are_contiguous_and_unique(self) -> None:
        versions = [item.version for item in MIGRATIONS]
        self.assertEqual(len(versions), len(set(versions)), f"版本号重复: {versions}")
        self.assertEqual(versions, list(range(1, len(versions) + 1)), f"版本号不连续: {versions}")

    def test_names_and_checksums_are_unique_and_non_empty(self) -> None:
        names = [item.name for item in MIGRATIONS]
        checksums = [item.checksum for item in MIGRATIONS]
        self.assertEqual(len(names), len(set(names)), "迁移 name 重复")
        self.assertEqual(len(checksums), len(set(checksums)), "迁移 checksum 重复")
        for item in MIGRATIONS:
            self.assertTrue(item.name.strip(), f"迁移 {item.version} 缺少 name")
            self.assertTrue(item.checksum.strip(), f"迁移 {item.version} 缺少 checksum")
            self.assertTrue(callable(item.apply), f"迁移 {item.version} 缺少 apply")

    def test_published_versions_are_frozen(self) -> None:
        """15/16/17 已经落进过数据库：名称与 checksum 一旦改动，存量库将拒绝启动。"""
        frozen = {
            15: ("alert-rule-timing-columns", "h0015-v1"),
            16: ("home-mode-conditions-execution", "h0016-v1"),
            17: ("alert-rule-escalation-column", "h0017-v1"),
        }
        by_version = {item.version: item for item in MIGRATIONS}
        for version, (name, checksum) in frozen.items():
            item = by_version.get(version)
            self.assertIsNotNone(item, f"迁移 {version} 被删除：已写入数据库的版本不得移除")
            assert item is not None  # for type checkers
            self.assertEqual(item.name, name, f"迁移 {version} 的 name 被改动")
            self.assertEqual(item.checksum, checksum, f"迁移 {version} 的 checksum 被改动")


if __name__ == "__main__":
    unittest.main()
