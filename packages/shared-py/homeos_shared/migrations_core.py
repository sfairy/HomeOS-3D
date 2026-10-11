"""两个后端共享的「启动期 SQLite / Alembic 迁移内核」（**唯一真源**）。

只放**与库结构 / ORM 无关**的叶子逻辑：读写 ``alembic_version``、迁移前快照、完整性核对、
脚本目录校验。这些在两个后端（``homeos`` / ``homeos-store``）里逐字同构，却属于「改一处必须
记得改另一处」的数据安全代码 —— 故下沉到这里（构建期各自内联编译，见
``packages/shared-py/README.md``）。

**不放**（两边确有差异，留在各自 ``core/migrations.py``）：

- ``run_migrations`` 编排：主应用多出「退役列清理」与「数据兼容地板」，返回的也是备份路径；
- ``_schema_drift`` / ``_schema_matches_orm``：依赖各自 ORM ``Base`` 与 ``security.schema_guard``；
- ``_create_schema`` / ``_migrations_dir`` / ``_migration_config``：脚本目录布局不同
  （``migrations/`` ↔ ``backend/migrations/``）；
- ``_legacy_error``：报错文案里点名的备份文件名不同（``store.db.pre-migrate-*`` ↔ 泛指）；
- 主应用独有的 ``restore_database_backup`` / ``_sha256`` / 数据兼容标记 / 退役列逻辑。
"""

from __future__ import annotations

import logging
import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

#: 迁移锁文件名后缀（两后端一致）。
MIGRATION_LOCK_SUFFIX = ".migrate.lock"
#: 迁移前快照的默认标签与保留份数。
MIGRATION_BACKUP_LABEL = "migrate"
MIGRATION_BACKUP_KEEP = 3


class MigrationBackupError(RuntimeError):
    """迁移前快照写不出来，因此拒绝继续迁移。"""


class LegacyDatabaseError(RuntimeError):
    """库是压缩基线之前的老结构，不能直升，也不会被自动改写。"""


def has_business_tables(connection: sqlite3.Connection) -> bool:
    """库里除 Alembic 自己的版本表之外，还有没有别的表。"""
    row = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' "
        "AND name != 'alembic_version' LIMIT 1"
    ).fetchone()
    return row is not None


def read_recorded_revision(database_path: Path) -> str | None:
    """读取库内记录的 revision。

    ``None`` 表示全新安装（没有库文件，或文件里连业务表都没有）；``"unversioned"`` 表示
    Alembic 之前的老结构（有业务表，却没有 ``alembic_version`` 记录）。
    """
    if not database_path.is_file() or database_path.stat().st_size == 0:
        return None
    with closing(sqlite3.connect(f"file:{database_path}?mode=ro", uri=True)) as connection:
        table = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'alembic_version'"
        ).fetchone()
        if table is None:
            return "unversioned" if has_business_tables(connection) else None
        row = connection.execute("SELECT version_num FROM alembic_version LIMIT 1").fetchone()
        if row:
            return str(row[0])
        return "unversioned" if has_business_tables(connection) else None


def set_recorded_revision(database_path: Path, revision: str) -> None:
    """直接改写 ``alembic_version``。

    库内记录的旧 revision 已不在脚本目录里，``alembic stamp`` 会因为解析不了它而失败，所以这里
    只改那一行记录 —— 前提是调用方已经确认过库结构与 ORM 一致。
    """
    with closing(sqlite3.connect(database_path)) as connection:
        connection.execute("DELETE FROM alembic_version")
        connection.execute("INSERT INTO alembic_version (version_num) VALUES (?)", (revision,))
        connection.commit()


def script_knows_revision(config: Config, revision: str) -> bool:
    """当前脚本目录里是否存在这个 revision。"""
    try:
        ScriptDirectory.from_config(config).get_revision(revision)
        return True
    except Exception:
        return False


def validate_database(database_path: Path, expected_revision: str) -> None:
    """升级后完整性 + 外键检查 + 版本号核对。"""
    if not database_path.is_file():
        raise RuntimeError(f"Database missing after migration: {database_path}")
    with closing(sqlite3.connect(f"file:{database_path}?mode=ro", uri=True)) as connection:
        integrity = connection.execute("PRAGMA integrity_check").fetchone()
        if integrity is None or integrity[0] != "ok":
            detail = integrity[0] if integrity else "no result"
            raise RuntimeError(f"SQLite integrity check failed: {detail}")
        # 只读 URI 下外键检查仍可读；写连接侧已开 foreign_keys=ON。
        fk_violations = connection.execute("PRAGMA foreign_key_check").fetchall()
        if fk_violations:
            sample = "; ".join(str(row) for row in fk_violations[:5])
            raise RuntimeError(f"SQLite foreign_key_check failed: {sample}")
        row = connection.execute("SELECT version_num FROM alembic_version LIMIT 1").fetchone()
        actual = str(row[0]) if row else "unversioned"
        if actual != expected_revision:
            raise RuntimeError(f"Database revision is {actual}, expected {expected_revision}.")


def backup_database(
    database_path: Path,
    *,
    label: str = MIGRATION_BACKUP_LABEL,
    logger: logging.Logger | None = None,
) -> Path | None:
    """迁移前留一份可还原的快照；库文件不存在时返回 None。"""
    if not database_path.is_file() or database_path.stat().st_size == 0:
        return None
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    destination = database_path.parent / f"{database_path.name}.pre-{label}-{stamp}.bak"
    suffix = 1
    while destination.exists():
        destination = database_path.parent / f"{database_path.name}.pre-{label}-{stamp}-{suffix}.bak"
        suffix += 1

    connection = sqlite3.connect(database_path, isolation_level=None)
    try:
        connection.execute("VACUUM INTO ?", (str(destination),))
    except sqlite3.Error as error:
        destination.unlink(missing_ok=True)
        raise MigrationBackupError(
            f"迁移前备份数据库失败（{database_path} → {destination}）：{error}。"
            "为免在没有退路的情况下改动库结构，本次启动已中止；请确认该目录可写后重试。"
        ) from error
    finally:
        connection.close()
    if logger is not None:
        logger.warning("改动库结构前已备份数据库：%s（确认结果无误后可自行删除）", destination)
    return destination


def prune_database_backups(
    database_path: Path,
    *,
    keep: int = MIGRATION_BACKUP_KEEP,
    label: str = MIGRATION_BACKUP_LABEL,
    logger: logging.Logger | None = None,
) -> list[Path]:
    """删掉同库同标签的旧快照，只留最近 ``keep`` 份；返回被删掉的路径。"""
    pattern = f"{database_path.name}.pre-{label}-*.bak"
    existing = sorted(database_path.parent.glob(pattern))
    removed: list[Path] = []
    for stale in existing[: max(0, len(existing) - keep)]:
        try:
            stale.unlink()
        except OSError as error:
            if logger is not None:
                logger.warning("迁移前的旧快照删不掉（不影响本次迁移）：%s（%s）", stale, error)
            continue
        removed.append(stale)
    return removed
