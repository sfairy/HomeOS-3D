"""结构漂移护栏回归（压缩基线 ``0001``）。

守护：版本号已是 head 但缺列时，``run_migrations`` 必须拒启并点名缺列，
而不是走「revision 已对齐 → 静默返回」的快路径。

压缩后不再存在逐步 ``0008→0009`` 修复链；结构落后于 ORM 的中途库走
``LegacyDatabaseError``（要求 bak / 导出导入）。本脚本验证：

1. 全新库升到 head（``SCHEMA_REVISION``，当前 ``0001``）结构完整；
2. head + 缺列 → 启动失败且信息明确；
3. head + 结构匹配 → noop；
4. 多余列不触发漂移；
5. 未知旧 revision（如 ``0009``）且结构已匹配 ORM → stamp 到 head；
6. ``RETIRED_COLUMNS`` 登记的退役列（``users.role``）→ 先备份再删掉，且幂等。

用法：``python scripts/_schema_drift_guard_smoke.py``（在 homeos/backend 下执行）。
"""

from __future__ import annotations

import os
import sqlite3
import tempfile
from contextlib import closing
from pathlib import Path

from _smoke_harness import check, ensure_backend_on_path, report

BACKEND = Path(__file__).resolve().parent.parent
ensure_backend_on_path()


def columns(database_path: Path, table: str) -> set[str]:
    with closing(sqlite3.connect(database_path)) as connection:
        rows = connection.execute(f"PRAGMA table_info({table})").fetchall()
    return {row[1] for row in rows}


def drop_activated_by(database_path: Path) -> None:
    with closing(sqlite3.connect(database_path)) as connection:
        connection.execute("ALTER TABLE license_state DROP COLUMN activated_by")
        connection.commit()


def set_revision(database_path: Path, revision: str) -> None:
    with closing(sqlite3.connect(database_path)) as connection:
        connection.execute("DELETE FROM alembic_version")
        connection.execute("INSERT INTO alembic_version (version_num) VALUES (?)", (revision,))
        connection.commit()


def revision(database_path: Path) -> str:
    with closing(sqlite3.connect(database_path)) as connection:
        row = connection.execute("SELECT version_num FROM alembic_version LIMIT 1").fetchone()
    return str(row[0]) if row else "none"


def main() -> None:
    from alembic import command
    from src.config import load_settings
    from src.platform.core import migrations

    script_dir = BACKEND / "migrations"
    if not script_dir.is_dir():
        print("找不到 migrations 目录，需在 homeos/backend 下执行")
        raise SystemExit(1)

    with tempfile.TemporaryDirectory(prefix="homeos-drift-") as tmp:
        tmp_path = Path(tmp)
        os.environ["HOMEOS_DATA_DIR"] = str(tmp_path / "data")
        os.environ["HOMEOS_DATABASE_URL"] = f"sqlite:///{tmp_path / 'drift.db'}"
        settings = load_settings()
        database_path = settings.database_path
        database_path.parent.mkdir(parents=True, exist_ok=True)
        config = migrations._migration_config(settings, script_dir)
        target = migrations.SCHEMA_REVISION

        print("0. 准备：升到压缩基线 head")
        command.upgrade(config, "head")
        check("库已到 SCHEMA_REVISION", revision(database_path) == target, revision(database_path))
        check("activated_by 列存在", "activated_by" in columns(database_path, "license_state"))

        print("1. 护栏：版本号已是 head 但缺列")
        drop_activated_by(database_path)
        set_revision(database_path, target)
        check("已模拟出漂移", "activated_by" not in columns(database_path, "license_state"))
        try:
            migrations.run_migrations(settings)
            check("必须抛错而不是静默跳过", False, "run_migrations 正常返回了")
        except Exception as error:
            message = str(error)
            check("抛出的错误点名了缺的列", "activated_by" in message, message[:200])
            check(
                "抛出的错误说明是结构漂移",
                "缺列" in message or "不一致" in message or "漂移" in message,
                message[:200],
            )

        print("2. 运维修复：从 ORM 重建一致结构后 stamp 回 head")
        # 压缩基线后无法 downgrade 逐步补列；对齐做法是导出/重建或恢复 bak。
        # 这里用 upgrade 到空库等价物：删库再升 head。
        database_path.unlink(missing_ok=True)
        command.upgrade(config, "head")
        check("修复后列已存在", "activated_by" in columns(database_path, "license_state"))
        check("修复后结构自检为干净", migrations._schema_matches_orm(settings.database_url))
        check("修复后漂移明细为空", migrations._schema_drift(settings.database_url) == [])
        backup = migrations.run_migrations(settings)
        check("一致时不动库（返回 None）", backup is None, backup)

        print("3. 旧 revision 标签 + 结构已匹配 → stamp 到 head")
        set_revision(database_path, "0009")
        migrations.run_migrations(settings)
        check("stamp 后 revision 为 head", revision(database_path) == target, revision(database_path))

        print("4. 护栏不会误报：库里多一列不算漂移")
        with closing(sqlite3.connect(database_path)) as connection:
            connection.execute("ALTER TABLE license_state ADD COLUMN legacy_leftover VARCHAR(16)")
            connection.commit()
        check("多余列不触发护栏", migrations._schema_drift(settings.database_url) == [])
        check("多余列也不影响启动", migrations.run_migrations(settings) is None)

        print("5. 退役列会被清理：先备份再删，且幂等")
        with closing(sqlite3.connect(database_path)) as connection:
            connection.execute(
                "ALTER TABLE \"users\" ADD COLUMN \"role\" VARCHAR(16) NOT NULL DEFAULT 'admin'"
            )
            connection.commit()
        check("已模拟出退役列 role", "role" in columns(database_path, "users"))
        backup = migrations.run_migrations(settings)
        check(
            "删列前留了可回滚的快照",
            backup is not None and backup.is_file(),
            backup,
        )
        check("退役列已被删除", "role" not in columns(database_path, "users"))
        check("删列后结构自检为干净", migrations._schema_matches_orm(settings.database_url))
        check("删列后 revision 仍是 head", revision(database_path) == target, revision(database_path))
        check("再跑一次不再动库", migrations.run_migrations(settings) is None)

    report("结构漂移回归全部通过。")


if __name__ == "__main__":
    main()
