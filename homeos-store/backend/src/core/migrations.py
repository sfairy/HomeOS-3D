"""启动时的数据库迁移。

与主应用 ``homeos/backend/src/core/migrations.py`` 同一套约定（锁 → 备份 → upgrade）。
"""
from __future__ import annotations

import logging
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

from .file_lock import locked_file
from ..config import StoreSettings

if TYPE_CHECKING:
    # 仅用于 `_schema_drift` 的返回类型标注：真正 import 放在函数内，避免加载期就把
    # security 层拉起来（迁移执行器要在最早的启动阶段可用）。
    from ..security.schema_guard import SchemaDrift

logger = logging.getLogger("src.migrations")

MIGRATION_LOCK_SUFFIX = ".migrate.lock"
MIGRATION_BACKUP_LABEL = "migrate"
MIGRATION_BACKUP_KEEP = 3

#: 结构基线版本号。发行产物不带迁移脚本，新库直接按 ORM 元数据建好后
#: 写入这个版本号；开发期存在 ``db/migrations`` 时，会校验它与 Alembic head 一致，
#: 防止有人加了新 revision 却忘了同步这个常量（产物会退回「只建旧基线」，缺表）。
SCHEMA_REVISION = "0006"


class MigrationBackupError(RuntimeError):
    """迁移前的快照写不出来，因此拒绝继续迁移。"""


class LegacyDatabaseError(RuntimeError):
    """库是压缩基线之前的老结构，不能直升，也不会被自动改写。"""


def _migrations_dir(settings: StoreSettings) -> Path | None:
    """Alembic 脚本目录；源码/开发布局有，发行产物里没有（那时改走 ORM 建库）。
    """
    candidate = settings.project_root / "db" / "migrations"
    return candidate if candidate.is_dir() else None


def _migration_config(settings: StoreSettings, script_dir: Path) -> Config:
    """构造 Alembic 配置：脚本目录与数据库 URL 都从 Settings 推导。
    """
    config = Config(str(settings.project_root / "alembic.ini"))
    config.set_main_option("script_location", str(script_dir))
    config.set_main_option("sqlalchemy.url", settings.database_url)
    return config


def _head_revision(config: Config) -> str:
    """当前脚本目录的 head revision。"""
    return str(ScriptDirectory.from_config(config).get_current_head())


def _create_schema(settings: StoreSettings) -> None:
    """按 ORM 元数据建出全新库，并打上基线版本号。

    ``0001`` 基线是照着 ``Base.metadata`` 自动生成的，两者结构等价（``ops/check_schema.py``
    会比对结构指纹），所以 create_all 与跑一次迁移得到的是同一个库。
    """
    from . import models, models_engagement  # noqa: F401  # 注册到 Base.metadata  # pyright: ignore[reportUnusedImport]
    from .database import Base, create_store_engine

    engine = create_store_engine(settings)
    try:
        Base.metadata.create_all(engine)
        with engine.begin() as connection:
            connection.exec_driver_sql(
                "CREATE TABLE IF NOT EXISTS alembic_version ("
                "version_num VARCHAR(32) NOT NULL, "
                "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))"
            )
            connection.exec_driver_sql("DELETE FROM alembic_version")
            connection.exec_driver_sql(
                "INSERT INTO alembic_version (version_num) VALUES (?)", (SCHEMA_REVISION,)
            )
    finally:
        engine.dispose()


def _has_business_tables(connection: sqlite3.Connection) -> bool:
    """库里除 Alembic 自己的版本表之外，还有没有别的表。"""
    row = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' "
        "AND name != 'alembic_version' LIMIT 1"
    ).fetchone()
    return row is not None


def _recorded_revision(database_path: Path) -> str | None:
    """读取库内记录的 revision。

    ``None`` 表示全新安装（没有库文件，或文件里连业务表都没有）；``"unversioned"`` 表示
    Alembic 之前的老结构（有业务表，却没有 alembic_version 记录）。
    """
    if not database_path.is_file() or database_path.stat().st_size == 0:
        return None
    with sqlite3.connect(f"file:{database_path}?mode=ro", uri=True) as connection:
        table = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'alembic_version'"
        ).fetchone()
        if table is None:
            return "unversioned" if _has_business_tables(connection) else None
        row = connection.execute("SELECT version_num FROM alembic_version LIMIT 1").fetchone()
        if row:
            return str(row[0])
        return "unversioned" if _has_business_tables(connection) else None


def _set_recorded_revision(database_path: Path, revision: str) -> None:
    """直接改写 ``alembic_version``。

    库内记录的旧 revision 已不在脚本目录里，``alembic stamp`` 会因为解析不了它而失败，所以这里
    只改那一行记录 —— 前提是调用方已经确认过库结构与 ORM 一致（见 :func:`_schema_matches_orm`）。
    """
    with sqlite3.connect(database_path) as connection:
        connection.execute("DELETE FROM alembic_version")
        connection.execute("INSERT INTO alembic_version (version_num) VALUES (?)", (revision,))
        connection.commit()


def _script_knows_revision(config: Config, revision: str) -> bool:
    """当前脚本目录里是否存在这个 revision。"""
    try:
        ScriptDirectory.from_config(config).get_revision(revision)
        return True
    except Exception:
        return False


def _validate_database(database_path: Path, expected_revision: str) -> None:
    """升级后完整性 + 外键检查 + 版本号核对。"""
    if not database_path.is_file():
        raise RuntimeError(f"Database missing after migration: {database_path}")
    with sqlite3.connect(f"file:{database_path}?mode=ro", uri=True) as connection:
        integrity = connection.execute("PRAGMA integrity_check").fetchone()
        if integrity is None or integrity[0] != "ok":
            detail = integrity[0] if integrity else "no result"
            raise RuntimeError(f"SQLite integrity check failed: {detail}")
        fk_violations = connection.execute("PRAGMA foreign_key_check").fetchall()
        if fk_violations:
            sample = "; ".join(str(row) for row in fk_violations[:5])
            raise RuntimeError(f"SQLite foreign_key_check failed: {sample}")
        row = connection.execute("SELECT version_num FROM alembic_version LIMIT 1").fetchone()
        actual = str(row[0]) if row else "unversioned"
        if actual != expected_revision:
            raise RuntimeError(f"Database revision is {actual}, expected {expected_revision}.")


def _schema_drift(settings: StoreSettings) -> SchemaDrift:
    """库结构相对 ORM 元数据的缺口（缺表/缺列/缺索引）。

    与 :func:`_schema_matches_orm` 同源，只是把明细带出来：启动期报
    ``缺列 device_bindings.account_name`` 远比后面某次查询抛 ``no such column`` 有用。
    """
    from .database import Database
    from ..security.schema_guard import inspect_schema

    database = Database(settings)
    try:
        return inspect_schema(database.engine)
    finally:
        database.dispose()


def _schema_matches_orm(settings: StoreSettings) -> bool:
    """库结构是否已满足 ORM 元数据（只查「缺表 / 缺列 / 缺索引」，多出来的历史对象不算差异）。

    结构链压缩后，老链末端建出来的库与本基线 ``0001`` 在 ORM 口径上是同一个结构，只是
    ``alembic_version`` 记录还停在旧编号。这种情况可以安全接管：只改记录、不动结构。
    """
    return _schema_drift(settings).clean


def _legacy_error(revision: str) -> LegacyDatabaseError:
    return LegacyDatabaseError(
        f"数据库记录的是压缩基线之前的迁移版本（{revision}），且结构与当前 ORM 不一致："
        "当前版本只保留了 0001 基线，不能从老库直接升级，也不会自动改写老结构。请从数据目录里的 "
        "store.db.pre-migrate-*.bak 快照恢复，或先用旧版本导出数据后再在全新安装上导入。"
    )


def backup_database(database_path: Path) -> Path | None:
    """迁移前留一份可还原的快照；库文件不存在时返回 None。
    """
    if not database_path.is_file() or database_path.stat().st_size == 0:
        return None
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    destination = database_path.parent / f"{database_path.name}.pre-{MIGRATION_BACKUP_LABEL}-{stamp}.bak"
    suffix = 1
    while destination.exists():
        destination = (
            database_path.parent
            / f"{database_path.name}.pre-{MIGRATION_BACKUP_LABEL}-{stamp}-{suffix}.bak"
        )
        suffix += 1

    connection = sqlite3.connect(database_path, isolation_level=None)
    try:
        connection.execute("VACUUM INTO ?", (str(destination),))
    except sqlite3.Error as error:
        destination.unlink(missing_ok=True)
        raise MigrationBackupError(
            f"迁移前备份数据库失败（{database_path} → {destination}）：{error}。"
            "为免在没有退路的情况下改动库结构，本次启动已中止；"
            "请确认该目录可写后重试。"
        ) from error
    finally:
        connection.close()
    logger.warning("改动库结构前已备份数据库：%s（确认结果无误后可自行删除）", destination)
    return destination


def prune_database_backups(
    database_path: Path,
    keep: int = MIGRATION_BACKUP_KEEP,
) -> list[Path]:
    """删掉同库同标签的旧快照，只留最近 ``keep`` 份；返回被删掉的路径。
    """
    pattern = f"{database_path.name}.pre-{MIGRATION_BACKUP_LABEL}-*.bak"
    existing = sorted(database_path.parent.glob(pattern))
    removed: list[Path] = []
    for stale in existing[: max(0, len(existing) - keep)]:
        try:
            stale.unlink()
        except OSError as error:
            logger.warning("迁移前的旧快照删不掉（不影响本次迁移）：%s（%s）", stale, error)
            continue
        removed.append(stale)
    return removed


def run_migrations(settings: StoreSettings) -> list[str]:
    """把数据库带到 head 结构（串行化 + 动结构前留快照），返回本次做过的事。

    发行产物里没有迁移脚本（``_migrations_dir`` 返回 None），此时 head 就是常量
    ``SCHEMA_REVISION``，新库按 ORM 元数据建；只有开发期存在脚本目录时才真正跑 Alembic。
    """
    database_path = settings.database_path
    lock_path = database_path.parent / f"{database_path.name}{MIGRATION_LOCK_SUFFIX}"
    performed: list[str] = []

    with locked_file(lock_path):
        script_dir = _migrations_dir(settings)
        config = _migration_config(settings, script_dir) if script_dir is not None else None
        if config is None:
            head = SCHEMA_REVISION
        else:
            head = _head_revision(config)
            if head != SCHEMA_REVISION:
                raise RuntimeError(
                    f"迁移脚本的 head 是 {head}，但常量 SCHEMA_REVISION 是 {SCHEMA_REVISION}："
                    "发行产物按常量建库，两者不一致会让新库缺表。请同步 core/migrations.py。"
                )
        recorded = _recorded_revision(database_path)

        if recorded == "unversioned":
            raise LegacyDatabaseError(
                "数据库是老版本的旧结构：库里已经有业务表，却没有 alembic_version 记录。"
                "当前版本只支持全新安装的 0001 基线，不能从老库直接升级，也不会自动改写老结构。"
                "请先备份数据目录；需要保留数据时，用旧版本启动导出数据后，再在全新安装上导入。"
            )

        if recorded == head:
            # 版本号到了 head **不等于**结构到了 head：迁移文件被应用之后又被追加过内容时，
            # 版本号早已打上、不会再回退，只信版本号会让应用带着缺列的库启动，崩在业务查询里
            # （主应用 2026-10-07 就是这样被 license_state.activated_by 打死的）。
            # 这里宁可启动前报清楚缺什么，代价是一次只读的 inspector 遍历。
            drift = _schema_drift(settings)
            if not drift.clean:
                raise RuntimeError(
                    f"数据库版本号已是 head（{head}），但结构与 ORM 不一致：{drift.summary()}。"
                    "常见原因：某个迁移在**被应用之后**又追加了内容，而版本号不会再回退。"
                    "请补一个「缺了才加」的修复迁移后重启，"
                    "或从数据目录的 store.db.pre-migrate-*.bak 快照恢复。"
                )
            return performed

        if recorded is None:
            if config is None:
                _create_schema(settings)
                performed.append(f"按 ORM 元数据建库并记录版本 {head}")
            else:
                backup_database(database_path)
                prune_database_backups(database_path)
                command.upgrade(config, "head")
                performed.append(f"应用迁移 {recorded} → {head}")
            _validate_database(database_path, head)
            return performed

        # 有版本号却不是 head：要么是脚本目录认识的历史节点（走正常升级），要么是旧编号
        # （结构一致才允许只改记录）。两条都会改到库文件，先留快照。
        known = config is not None and _script_knows_revision(config, recorded)
        if not known and not _schema_matches_orm(settings):
            raise _legacy_error(str(recorded))
        backup_database(database_path)
        prune_database_backups(database_path)
        if config is not None and known:
            command.upgrade(config, "head")
            performed.append(f"应用迁移 {recorded} → {head}")
            _validate_database(database_path, head)
            return performed
        _set_recorded_revision(database_path, head)
        if _recorded_revision(database_path) != head:
            raise LegacyDatabaseError(f"改写版本记录失败：仍读到 {_recorded_revision(database_path)!r}")
        performed.append(f"接管压缩前的版本记录 {recorded} → {head}（结构已与 ORM 一致，只改记录）")
        _validate_database(database_path, head)

    return performed
