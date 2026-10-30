"""T8：packages/shared-py 共享内核的三条回归（并发/迁移/编码边界）。

覆盖的缺陷（均先写出「修复前会怎样」再断言现状）：

1. homeos_shared.sqlite_email.normalize_email_column 的重复检测用 Python
   str.strip().lower()（Unicode 大小写折叠），写回却用 SQL lower(trim(email))
   —— SQLite 的 lower() 只折叠 ASCII。于是 "Ü@X.com" 被判重成 "ü@x.com"，
   落库却仍是 "Ü@X.com"；各后端的登录查询都是 func.lower(DB列) == 输入.lower()，
   这类账号从此登录不上。现在写回也走 Python 归一化结果。
2. homeos_shared.schema_migrate.run_migrations(mode="check") 承诺只读探测，但
   「版本表存在且零记录、库中没有业务表」时也会 _stamp_baseline 写库 —— 一个只做
   健康检查的进程会改动业务数据库。现在 check 模式不许写基线。
3. homeos_shared.license_transport.b64url_decode 的 docstring 承诺非法编码抛
   ValueError，实现（base64.urlsafe_b64decode）却静默丢弃非法字符，"@@@@" 被解成
   b""。现在显式按 URL 安全字母表校验，非法输入抛 ValueError 子类。

用 python -m unittest discover -s ops/checks/shared/tests -v 运行。
"""

from __future__ import annotations

import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
SHARED_PY_ROOT = REPO_ROOT / "packages" / "shared-py"

# shared-py 是独立的源码共享包（不带 src/ 层），直接把 packages/shared-py 放进 path。
# 不要放进 packages/ 或仓库根：两个后端各自也有 homeos_shared 构建产物，容易遮蔽。
sys.path.insert(0, str(SHARED_PY_ROOT))

from homeos_shared.license_transport import b64url_decode, b64url_encode
from homeos_shared.schema_migrate import (
    Migration,
    MigrationPending,
    SchemaMigrationError,
    run_migrations,
)
from homeos_shared.sqlite_email import normalize_email_column

ACCOUNTS_ADD_COLUMN = "ALTER TABLE accounts ADD COLUMN email VARCHAR(255) NOT NULL DEFAULT ''"
ACCOUNTS_INDEX = "ix_accounts_email"


def _accounts_db(rows: list[tuple[str, str]]) -> sqlite3.Connection:
    connection = sqlite3.connect(":memory:")
    connection.execute("CREATE TABLE accounts (id TEXT PRIMARY KEY, email TEXT)")
    connection.executemany("INSERT INTO accounts (id, email) VALUES (?, ?)", rows)
    return connection


class NormalizeEmailColumnTest(unittest.TestCase):
    def test_non_ascii_uppercase_is_written_with_python_lower(self) -> None:
        with closing(_accounts_db([("a1", "  Ü@X.com  ")])) as connection:
            normalize_email_column(
                connection,
                table="accounts",
                add_column_sql=ACCOUNTS_ADD_COLUMN,
                index_name=ACCOUNTS_INDEX,
            )
            stored = connection.execute("SELECT email FROM accounts WHERE id = 'a1'").fetchone()[0]
        # 修复前是 "Ü@X.com"（SQLite lower 不折叠非 ASCII 大写），与读路径
        # func.lower(email) == 输入.lower() 对不上。
        self.assertEqual(stored, "ü@x.com")

    def test_ascii_uppercase_still_lowercased(self) -> None:
        with closing(_accounts_db([("a1", "  Foo@Example.COM ")])) as connection:
            normalize_email_column(
                connection,
                table="accounts",
                add_column_sql=ACCOUNTS_ADD_COLUMN,
                index_name=ACCOUNTS_INDEX,
            )
            stored = connection.execute("SELECT email FROM accounts WHERE id = 'a1'").fetchone()[0]
            self.assertEqual(stored, "foo@example.com")
            indexes = {
                str(row[1])
                for row in connection.execute("PRAGMA index_list('accounts')").fetchall()
            }
        self.assertIn(ACCOUNTS_INDEX, indexes)

    def test_duplicate_after_normalization_raises_before_writing(self) -> None:
        with closing(_accounts_db([("a1", "a@x.com"), ("a2", "A@x.com")])) as connection:
            with self.assertRaises(SchemaMigrationError):
                normalize_email_column(
                    connection,
                    table="accounts",
                    add_column_sql=ACCOUNTS_ADD_COLUMN,
                    index_name=ACCOUNTS_INDEX,
                )
            rows = connection.execute("SELECT id, email FROM accounts ORDER BY id").fetchall()
        self.assertEqual(rows, [("a1", "a@x.com"), ("a2", "A@x.com")])

    def test_missing_email_column_is_added_then_normalized(self) -> None:
        connection = sqlite3.connect(":memory:")
        with closing(connection):
            connection.execute("CREATE TABLE accounts (id TEXT PRIMARY KEY)")
            connection.execute("INSERT INTO accounts (id) VALUES ('a1')")
            normalize_email_column(
                connection,
                table="accounts",
                add_column_sql=ACCOUNTS_ADD_COLUMN,
                index_name=ACCOUNTS_INDEX,
            )
            # 补列 SQL 带 NOT NULL DEFAULT ''：空串保留，用部分唯一索引排除。
            stored = connection.execute("SELECT email FROM accounts WHERE id = 'a1'").fetchone()[0]
        self.assertEqual(stored, "")

    def test_multiple_empty_emails_do_not_break_unique_index(self) -> None:
        with closing(_accounts_db([("a1", ""), ("a2", "   ")])) as connection:
            normalize_email_column(
                connection,
                table="accounts",
                add_column_sql=ACCOUNTS_ADD_COLUMN,
                index_name=ACCOUNTS_INDEX,
            )
            stored = connection.execute(
                "SELECT email FROM accounts ORDER BY id"
            ).fetchall()
        self.assertEqual(stored, [(None,), (None,)])

    def test_not_null_column_uses_partial_unique_index(self) -> None:
        connection = sqlite3.connect(":memory:")
        with closing(connection):
            connection.execute(
                "CREATE TABLE accounts (id TEXT PRIMARY KEY, "
                "email VARCHAR(255) NOT NULL DEFAULT '')"
            )
            connection.executemany(
                "INSERT INTO accounts (id, email) VALUES (?, '')", [("a1",), ("a2",)]
            )
            normalize_email_column(
                connection,
                table="accounts",
                add_column_sql=ACCOUNTS_ADD_COLUMN,
                index_name=ACCOUNTS_INDEX,
            )
            stored = connection.execute(
                "SELECT email FROM accounts ORDER BY id"
            ).fetchall()
            index_sql = connection.execute(
                "SELECT sql FROM sqlite_master WHERE type='index' AND name=?",
                (ACCOUNTS_INDEX,),
            ).fetchone()[0]
        self.assertEqual(stored, [("",), ("",)])
        self.assertIn("WHERE", index_sql.upper())


class B64UrlDecodeTest(unittest.TestCase):
    def test_invalid_characters_raise_value_error(self) -> None:
        for raw in ("@@@@", "abc@@", "!!!!"):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                b64url_decode(raw)

    def test_roundtrip_without_padding(self) -> None:
        payload = b"\x00\xffhello-license"
        encoded = b64url_encode(payload)
        self.assertNotIn("=", encoded)
        self.assertEqual(b64url_decode(encoded), payload)

    def test_non_string_raises_type_error(self) -> None:
        with self.assertRaises(TypeError):
            b64url_decode(b"YWJj")  # type: ignore[arg-type]


MIGRATIONS_TABLE_DDL = (
    "CREATE TABLE schema_migrations ("
    "app TEXT NOT NULL, version INTEGER NOT NULL, name TEXT NOT NULL, "
    "checksum TEXT NOT NULL, applied_at TEXT NOT NULL, duration_ms INTEGER NOT NULL, "
    "PRIMARY KEY (app, version))"
)


class RunMigrationsCheckModeTest(unittest.TestCase):
    def _prepare(self, tmp: str) -> tuple[Path, Migration]:
        database_path = Path(tmp) / "app.db"
        with closing(sqlite3.connect(database_path)) as connection:
            connection.execute(MIGRATIONS_TABLE_DDL)
            connection.commit()
        migration = Migration(
            version=1,
            name="create_widgets",
            checksum="c1",
            apply=lambda connection, context: connection.execute(
                "CREATE TABLE widgets (id INTEGER PRIMARY KEY)"
            ),
        )
        return database_path, migration

    def test_check_mode_never_stamps_baseline(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            database_path, migration = self._prepare(tmp)
            with self.assertRaises(MigrationPending):
                run_migrations(
                    database_path=database_path,
                    app="probe",
                    migrations=[migration],
                    create_schema=lambda: None,
                    data_dir=Path(tmp),
                    mode="check",
                )
            with closing(sqlite3.connect(database_path)) as connection:
                count = connection.execute("SELECT COUNT(*) FROM schema_migrations").fetchone()[0]
        # 修复前这里会被写入 version=0 的 baseline 行（check 模式改库）。
        self.assertEqual(count, 0, "check 模式不能写迁移版本表")

    def test_auto_mode_still_creates_baseline_and_applies(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            database_path, migration = self._prepare(tmp)
            report = run_migrations(
                database_path=database_path,
                app="probe",
                migrations=[migration],
                create_schema=lambda: None,
                data_dir=Path(tmp),
                mode="auto",
            )
            with closing(sqlite3.connect(database_path)) as connection:
                versions = [
                    int(row[0])
                    for row in connection.execute(
                        "SELECT version FROM schema_migrations ORDER BY version"
                    ).fetchall()
                ]
                tables = {
                    str(row[0])
                    for row in connection.execute(
                        "SELECT name FROM sqlite_master WHERE type = 'table'"
                    ).fetchall()
                }
        self.assertEqual(report.applied, (1,))
        self.assertEqual(versions, [0, 1])
        self.assertIn("widgets", tables)


if __name__ == "__main__":
    unittest.main()
