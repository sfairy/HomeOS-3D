"""迁移内核的单元测试（不依赖两个后端的 ORM）。"""

from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from homeos_shared.schema_migrate import (
    MIGRATIONS_TABLE,
    Migration,
    MigrationPending,
    SchemaMigrationError,
    prune_backups,
    run_migrations,
)


def _migration(version: int, name: str, checksum: str, sql: str) -> Migration:
    def apply(connection, _context):
        for statement in sql.split(";"):
            if statement.strip():
                connection.execute(statement)

    return Migration(version=version, name=name, checksum=checksum, apply=apply)


class SchemaMigrateTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.db = self.root / "app.db"
        self.schema_calls = 0

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _create_schema(self) -> None:
        self.schema_calls += 1
        with sqlite3.connect(self.db) as connection:
            connection.execute("CREATE TABLE IF NOT EXISTS seed (id INTEGER PRIMARY KEY)")

    def _run(self, migrations, *, mode="auto"):
        return run_migrations(
            database_path=self.db,
            app="test",
            migrations=migrations,
            create_schema=self._create_schema,
            data_dir=self.root,
            mode=mode,
        )

    def _versions(self) -> list[int]:
        with sqlite3.connect(self.db) as connection:
            rows = connection.execute(
                f"SELECT version FROM {MIGRATIONS_TABLE} WHERE app = ? ORDER BY version",  # noqa: S608
                ("test",),
            ).fetchall()
        return [int(row[0]) for row in rows]

    def test_fresh_database_creates_schema_and_baseline(self) -> None:
        migrations = [_migration(1, "create-items", "c1", "CREATE TABLE items (id INTEGER PRIMARY KEY);")]
        report = self._run(migrations)
        self.assertTrue(report.fresh)
        self.assertFalse(report.adopted)
        self.assertEqual(report.to_version, 1)
        self.assertEqual(self._versions(), [0, 1])
        self.assertIsNone(report.backup_path)
        self.assertEqual(self.schema_calls, 1)

    def test_second_run_is_idempotent(self) -> None:
        migrations = [_migration(1, "create-items", "c1", "CREATE TABLE items (id INTEGER PRIMARY KEY);")]
        self._run(migrations)
        report = self._run(migrations)
        self.assertFalse(report.fresh)
        self.assertEqual(report.applied, ())
        self.assertEqual(report.to_version, 1)
        self.assertEqual(self._versions(), [0, 1])

    def test_legacy_database_is_adopted_and_backed_up(self) -> None:
        with sqlite3.connect(self.db) as connection:
            connection.execute("CREATE TABLE legacy (id INTEGER PRIMARY KEY)")
        migrations = [_migration(1, "add-column", "c1", "ALTER TABLE legacy ADD COLUMN note TEXT;")]
        report = self._run(migrations)
        self.assertFalse(report.fresh)
        self.assertTrue(report.adopted)
        self.assertEqual(report.applied, (1,))
        self.assertIsNotNone(report.backup_path)
        self.assertTrue(report.backup_path.is_file())
        self.assertEqual(self.schema_calls, 0)

    def test_checksum_drift_rejects_startup(self) -> None:
        self._run([_migration(1, "create-items", "c1", "CREATE TABLE items (id INTEGER PRIMARY KEY);")])
        with self.assertRaises(SchemaMigrationError):
            self._run([_migration(1, "create-items", "c1-changed", "CREATE TABLE items (id INTEGER PRIMARY KEY);")])

    def test_failed_migration_rolls_back(self) -> None:
        migrations = [
            _migration(1, "create-items", "c1", "CREATE TABLE items (id INTEGER PRIMARY KEY);"),
            _migration(2, "broken", "c2", "CREATE TABLE should_rollback (id INTEGER); INSERT INTO missing VALUES (1);"),
        ]
        with self.assertRaises(sqlite3.Error):
            self._run(migrations)
        self.assertEqual(self._versions(), [0, 1])
        with sqlite3.connect(self.db) as connection:
            names = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        self.assertNotIn("should_rollback", names)

    def test_check_mode_reports_pending_without_writing(self) -> None:
        with sqlite3.connect(self.db) as connection:
            connection.execute("CREATE TABLE legacy (id INTEGER PRIMARY KEY)")
        migrations = [_migration(1, "add-column", "c1", "ALTER TABLE legacy ADD COLUMN note TEXT;")]
        with self.assertRaises(MigrationPending):
            self._run(migrations, mode="check")
        with sqlite3.connect(self.db) as connection:
            tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        self.assertNotIn(MIGRATIONS_TABLE, tables)

    def test_off_mode_does_not_create_database(self) -> None:
        report = self._run([_migration(1, "create-items", "c1", "CREATE TABLE items (id INTEGER);")], mode="off")
        self.assertEqual(report.to_version, 0)
        self.assertFalse(self.db.exists())

    def test_duplicate_versions_are_rejected(self) -> None:
        with self.assertRaises(SchemaMigrationError):
            self._run([
                _migration(1, "a", "c1", "CREATE TABLE a (id INTEGER);"),
                _migration(1, "b", "c2", "CREATE TABLE b (id INTEGER);"),
            ])

    def test_prune_backups_keeps_latest(self) -> None:
        backup_dir = self.root / "backups"
        backup_dir.mkdir()
        for index in range(12):
            (backup_dir / f"app-before-migrate-20260101-0000{index:02d}.db").write_bytes(b"x")
        prune_backups(backup_dir, "app", keep=10)
        self.assertEqual(len(list(backup_dir.glob("app-before-migrate-*.db"))), 10)


if __name__ == "__main__":
    unittest.main()
