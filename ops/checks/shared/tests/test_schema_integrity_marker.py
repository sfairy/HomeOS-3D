"""启动体检强度的回归：「干净关闭才 quick_check，异常退出后必须逐页全查」。

为什么这条要有测试：档位是**按上一次退出是否干净**自动选的，选错的后果不对称 ——
多扫一遍只是慢 0.6 秒，少扫一遍却可能把半写页的库当健康库放行。所以这里锁住三件事：

1. 没有「干净关闭」标记（含崩溃退出、标记被消费后再次启动）→ 一律 ``integrity_check``；
2. 标记存在 → ``quick_check``，且标记**读即删**（否则一次干净关闭会永久降档）；
3. 降档只降「逐页」这一项：外键校验与必需表核对在任何档位下都必须照常报错。

运行：node ops/lib/py.mjs -m unittest discover -s ops/checks/shared/tests -v
"""

from __future__ import annotations

import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
SHARED_PY_ROOT = REPO_ROOT / "packages" / "shared-py"
sys.path.insert(0, str(SHARED_PY_ROOT))

from homeos_shared.schema_core import (
    SchemaError,
    clean_shutdown_marker,
    mark_clean_shutdown,
    validate_database,
)


class IntegrityTierTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.db = Path(self._tmp.name) / "app.db"
        with sqlite3.connect(self.db) as connection:
            connection.execute("CREATE TABLE t (id INTEGER PRIMARY KEY)")

    def test_unclean_exit_runs_full_check(self) -> None:
        report = validate_database(self.db, {"t"})
        self.assertEqual(report.pragma, "integrity_check")
        self.assertFalse(report.clean_shutdown)

    def test_clean_exit_downgrades_and_consumes_marker(self) -> None:
        mark_clean_shutdown(self.db)
        self.assertTrue(clean_shutdown_marker(self.db).is_file())

        report = validate_database(self.db, {"t"})
        self.assertEqual(report.pragma, "quick_check")
        self.assertTrue(report.clean_shutdown)
        # 读即删：本次启动中途再崩，下次不会被误判成「上次干净关闭」。
        self.assertFalse(clean_shutdown_marker(self.db).exists())

        again = validate_database(self.db, {"t"})
        self.assertEqual(again.pragma, "integrity_check")
        self.assertFalse(again.clean_shutdown)

    def test_explicit_tier_ignores_marker(self) -> None:
        mark_clean_shutdown(self.db)
        forced = validate_database(self.db, {"t"}, integrity="full")
        self.assertEqual(forced.pragma, "integrity_check")
        self.assertIsNone(forced.clean_shutdown)
        quick = validate_database(self.db, {"t"}, integrity="quick")
        self.assertEqual(quick.pragma, "quick_check")

    def test_unknown_tier_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            validate_database(self.db, {"t"}, integrity="fast")


class DowngradeKeepsOtherChecksTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.db = Path(self._tmp.name) / "app.db"
        with sqlite3.connect(self.db) as connection:
            # 默认 foreign_keys=off，因此可以先落一条悬空的子行，再让 foreign_key_check 抓它。
            connection.execute("CREATE TABLE parent (id TEXT PRIMARY KEY)")
            connection.execute(
                "CREATE TABLE child (id TEXT PRIMARY KEY, parent_id TEXT REFERENCES parent(id))"
            )
            connection.execute("INSERT INTO child VALUES ('c1', 'missing-parent')")

    def test_quick_check_still_reports_foreign_key_violations(self) -> None:
        mark_clean_shutdown(self.db)
        with self.assertRaises(SchemaError) as caught:
            validate_database(self.db, {"parent", "child"})
        self.assertIn("foreign_key_check", str(caught.exception))

    def test_missing_tables_still_fail_in_quick_tier(self) -> None:
        with sqlite3.connect(self.db) as connection:
            connection.execute("DELETE FROM child")  # 去掉悬空行，让「缺表」成为唯一问题
        mark_clean_shutdown(self.db)
        with self.assertRaises(SchemaError) as caught:
            validate_database(self.db, {"parent", "child", "absent"})
        self.assertIn("absent", str(caught.exception))


class CleanShutdownMarkerTest(unittest.TestCase):
    def test_marker_write_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "app.db"
            mark_clean_shutdown(db)
            mark_clean_shutdown(db)
            self.assertTrue(clean_shutdown_marker(db).is_file())

    def test_marker_write_failure_is_not_fatal(self) -> None:
        # 目录不存在 / 只读挂载：停机路径上不能因为「写不进去」而以非零码退出。
        with tempfile.TemporaryDirectory() as tmp:
            mark_clean_shutdown(Path(tmp) / "no-such-dir" / "app.db")


if __name__ == "__main__":
    unittest.main()
