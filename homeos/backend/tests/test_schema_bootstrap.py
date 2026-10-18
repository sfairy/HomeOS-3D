"""启动期建库/迁移/自检的集成测试（主应用）。"""

from __future__ import annotations

import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from src.config import Settings
from src.platform.core.migrations import MIGRATIONS
from src.platform.core.schema import prepare_schema


class SchemaBootstrapTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.data_dir = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _connect(self, settings: Settings) -> sqlite3.Connection:
        return sqlite3.connect(settings.database_path)

    def test_fresh_install_applies_all_migrations_and_creates_drafts(self) -> None:
        settings = Settings(data_dir=self.data_dir)
        prepare_schema(settings)
        with closing(self._connect(settings)) as connection:
            versions = [row[0] for row in connection.execute("SELECT version FROM schema_migrations ORDER BY version")]
            self.assertEqual(versions, [0, *(item.version for item in MIGRATIONS)])
            tables = {
                row[0]
                for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
            }
            self.assertIn("studio_drafts", tables)
            self.assertIn("users", tables)

    def test_second_start_is_idempotent(self) -> None:
        settings = Settings(data_dir=self.data_dir)
        prepare_schema(settings)
        prepare_schema(settings)
        with closing(self._connect(settings)) as connection:
            count = connection.execute("SELECT COUNT(*) FROM schema_migrations").fetchone()[0]
            self.assertEqual(count, len(MIGRATIONS) + 1)  # 含 baseline 0

    def test_check_mode_does_not_create_missing_objects(self) -> None:
        settings = Settings(data_dir=self.data_dir)
        prepare_schema(settings)
        with closing(self._connect(settings)) as connection:
            connection.execute("DROP TABLE global_custom_popup_state")
            connection.commit()
        pending = Settings(data_dir=self.data_dir, schema_mode="check")
        with self.assertRaises(Exception) as caught:
            prepare_schema(pending)
        self.assertIn("check 模式发现库结构缺口", str(caught.exception))
        with closing(self._connect(pending)) as connection:
            exists = connection.execute(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'global_custom_popup_state'"
            ).fetchone()
            self.assertIsNone(exists, "check 模式不得用 create_all 补建表")

    def test_check_mode_refuses_pending_migrations_without_writing(self) -> None:
        settings = Settings(data_dir=self.data_dir)
        prepare_schema(settings)
        with closing(self._connect(settings)) as connection:
            connection.execute("DROP TABLE schema_migrations")
            connection.commit()
        pending = Settings(data_dir=self.data_dir, schema_mode="check")
        with self.assertRaises(Exception) as caught:
            prepare_schema(pending)
        self.assertIn("旧库缺少迁移版本表", str(caught.exception))
        with closing(self._connect(pending)) as connection:
            exists = connection.execute(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'"
            ).fetchone()
            self.assertIsNone(exists, "check 模式不得写入 schema_migrations")


if __name__ == "__main__":
    unittest.main()