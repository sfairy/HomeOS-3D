"""启动时的数据库迁移（SQLite）。

约定：锁 → 备份 → upgrade；升级前快照，失败自动回滚。

- 发行产物不带迁移脚本时按 ORM 元数据建库并写入基线版本号；
- 开发期校验脚本 head 与 ``SCHEMA_REVISION`` 一致；
- 有业务表却无 ``alembic_version`` 的库拒绝自动改写。
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

from ..config import Settings
from .file_lock import locked_file

#: 结构基线版本号。发行产物不带迁移脚本，新库直接按 ORM 元数据建好后写入这个版本号。
SCHEMA_REVISION = "0001"
MIGRATION_LOCK_SUFFIX = ".migrate.lock"
DATA_COMPATIBILITY_FILE = "data-compatibility.json"
DATA_COMPATIBILITY_FORMAT = 1

_SIDECAR_SUFFIXES = ("-journal", "-wal", "-shm")


class MigrationBackupError(RuntimeError):
    """迁移前快照写不出来，因此拒绝继续迁移。"""


class LegacyDatabaseError(RuntimeError):
    """库是压缩基线之前的老结构，不能直升，也不会被自动改写。"""


class DataCompatibilityError(RuntimeError):
    """数据目录要求的最低程序版本高于当前二进制，拒绝启动以免破坏数据。"""


def _migrations_dir(settings: Settings) -> Path | None:
    release_scripts = settings.project_root / "alembic_runtime"
    if release_scripts.is_dir():
        return release_scripts
    source_scripts = settings.project_root / "migrations"
    return source_scripts if source_scripts.is_dir() else None


def _migration_config(settings: Settings, script_dir: Path) -> Config:
    config = Config(str(settings.project_root / "alembic.ini"))
    config.set_main_option("script_location", str(script_dir))
    config.set_main_option("sqlalchemy.url", settings.database_url)
    return config


def _remove_sidecars(database_path: Path) -> None:
    for suffix in _SIDECAR_SUFFIXES:
        Path(f"{database_path}{suffix}").unlink(missing_ok=True)


def _create_schema(settings: Settings) -> None:
    """按 ORM 元数据建出全新库，并打上基线版本号。"""
    from . import models  # noqa: F401  # 注册到 Base.metadata
    from .database import Base, Database

    database = Database(settings.database_url)
    try:
        Base.metadata.create_all(database.engine)
        with database.engine.begin() as connection:
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
        database.dispose()


def _has_business_tables(connection: sqlite3.Connection) -> bool:
    row = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' "
        "AND name != 'alembic_version' LIMIT 1"
    ).fetchone()
    return row is not None


def _database_revision(database_path: Path) -> str | None:
    if not database_path.is_file() or database_path.stat().st_size == 0:
        return None
    with closing(sqlite3.connect(f"file:{database_path}?mode=ro", uri=True)) as connection:
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
    with closing(sqlite3.connect(database_path)) as connection:
        connection.execute("DELETE FROM alembic_version")
        connection.execute("INSERT INTO alembic_version (version_num) VALUES (?)", (revision,))
        connection.commit()


def _script_knows_revision(config: Config, revision: str) -> bool:
    try:
        ScriptDirectory.from_config(config).get_revision(revision)
        return True
    except Exception:  # noqa: BLE001 - revision 解析失败即视为不认识
        return False


def _schema_drift(database_url: str) -> list[str]:
    """列出库结构相对 ORM 元数据的缺口（缺表/缺列/缺索引），已满足则为空列表。

    分成「返回明细」而不是「返回布尔」是为了能把缺什么直接写进报错里：启动期报
    ``license_state 缺列 activated_by`` 远比后面某次查询抛 ``no such column`` 有用。

    只查缺口，不查多余列：库里多一列不影响 ORM 读取，历史上也确实会留下退役列。
    """
    from sqlalchemy import create_engine, inspect

    from . import models  # noqa: F401
    from .database import Base

    engine = create_engine(database_url)
    drift: list[str] = []
    try:
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                drift.append(f"缺表 {table.name}")
                continue
            columns = {column["name"] for column in inspector.get_columns(table.name)}
            missing_columns = sorted({column.name for column in table.columns} - columns)
            if missing_columns:
                drift.append(f"{table.name} 缺列 {', '.join(missing_columns)}")
            indexes = {index["name"] for index in inspector.get_indexes(table.name)}
            missing_indexes = sorted({index.name for index in table.indexes if index.name} - indexes)
            if missing_indexes:
                drift.append(f"{table.name} 缺索引 {', '.join(missing_indexes)}")
        return drift
    finally:
        engine.dispose()


def _schema_matches_orm(database_url: str) -> bool:
    """库结构是否已满足 ORM 元数据（只查缺表/缺列/缺索引）。"""
    return not _schema_drift(database_url)


def _legacy_error(revision: str) -> LegacyDatabaseError:
    return LegacyDatabaseError(
        f"数据库记录的是压缩基线之前的迁移版本（{revision}），且结构与当前 ORM 不一致："
        "当前版本只保留了 0001 基线，不能从老库直接升级，也不会自动改写老结构。"
        "请从数据目录里的 *.pre-migrate-*.bak 快照恢复，或先用旧版本导出数据后再在全新安装上导入。"
    )


def _sha256(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as source:
        for chunk in iter(lambda: source.read(1048576), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _fsync_file(file_path: Path) -> None:
    with file_path.open("rb") as source:
        os.fsync(source.fileno())


def _validate_database(database_path: Path, expected_revision: str) -> None:
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
        actual_revision = str(row[0]) if row else "unversioned"
        if actual_revision != expected_revision:
            raise RuntimeError(f"Database revision is {actual_revision}, expected {expected_revision}.")


def backup_database(database_path: Path, label: str = "migrate") -> Path | None:
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
    return destination


def prune_database_backups(database_path: Path, keep: int = 3, label: str = "migrate") -> list[Path]:
    pattern = f"{database_path.name}.pre-{label}-*.bak"
    existing = sorted(database_path.parent.glob(pattern))
    removed: list[Path] = []
    for stale in existing[: max(0, len(existing) - keep)]:
        try:
            stale.unlink()
        except OSError:
            continue
        removed.append(stale)
    return removed


def restore_database_backup(database_path: Path, backup_path: Path) -> None:
    """迁移失败后原子地恢复升级前的数据库。"""
    restore_suffix = uuid4().hex
    restore_path = database_path.parent / f".{database_path.name}.restore-{restore_suffix}"
    try:
        shutil.copy2(backup_path, restore_path)
        os.chmod(restore_path, 0o600)
        _fsync_file(restore_path)
        with closing(sqlite3.connect(f"file:{restore_path}?mode=ro", uri=True)) as connection:
            integrity = connection.execute("PRAGMA integrity_check").fetchone()
            if integrity is None or integrity[0] != "ok":
                detail = integrity[0] if integrity else "no result"
                raise RuntimeError(f"Upgrade backup restore check failed: {detail}")
        _remove_sidecars(database_path)
        os.replace(restore_path, database_path)
        os.chmod(database_path, 0o600)
    finally:
        restore_path.unlink(missing_ok=True)
        _remove_sidecars(restore_path)


def _version_tuple(raw: str) -> tuple[int, ...]:
    parts: list[int] = []
    for chunk in re.split(r"[^0-9]+", (raw or "").strip()):
        if chunk:
            parts.append(int(chunk))
    return tuple(parts) if parts else (0,)


def compare_application_versions(left: str, right: str) -> int:
    """比较应用版本号：``left < right`` 为 -1，相等 0，大于 1。"""
    a, b = _version_tuple(left), _version_tuple(right)
    width = max(len(a), len(b))
    a = a + (0,) * (width - len(a))
    b = b + (0,) * (width - len(b))
    if a < b:
        return -1
    if a > b:
        return 1
    return 0


def data_compatibility_marker_path(settings: Settings) -> Path:
    return settings.data_dir / DATA_COMPATIBILITY_FILE


def check_data_compatibility(settings: Settings) -> None:
    """启动持久化写入前：若数据地板高于当前程序，拒启。"""
    marker_path = data_compatibility_marker_path(settings)
    if not marker_path.is_file():
        return
    try:
        payload = json.loads(marker_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise DataCompatibilityError(
            f"无法读取数据兼容标记 {marker_path.name}：{error}"
        ) from error
    if not isinstance(payload, dict):
        raise DataCompatibilityError("unsupported compatibility marker")
    if int(payload.get("formatVersion") or 0) != DATA_COMPATIBILITY_FORMAT:
        raise DataCompatibilityError("unsupported compatibility marker")
    minimum = str(payload.get("minimumApplicationVersion") or "").strip()
    if not minimum:
        raise DataCompatibilityError("unsupported compatibility marker")
    current = settings.version
    if compare_application_versions(current, minimum) < 0:
        raise DataCompatibilityError(
            f"当前程序版本 {current} 低于此数据要求的最低版本 {minimum}，已停止启动。"
            "请使用相同或更高版本的程序；如需回退，请同时恢复旧版本程序和升级前完整备份。"
        )


def write_data_compatibility_marker(settings: Settings, *, minimum: str | None = None) -> None:
    """把当前（或指定）程序版本写入数据目录地板与数据库单例行。"""
    floor = (minimum or settings.version).strip() or "0.0.0"
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    marker = {
        "product": "HomeOS",
        "formatVersion": DATA_COMPATIBILITY_FORMAT,
        "minimumApplicationVersion": floor,
    }
    marker_path = data_compatibility_marker_path(settings)
    temporary = marker_path.with_suffix(f".{uuid4().hex}.tmp")
    temporary.write_text(
        json.dumps(marker, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    os.replace(temporary, marker_path)
    try:
        from sqlalchemy import create_engine, text

        engine = create_engine(settings.database_url)
        try:
            with engine.begin() as connection:
                exists = connection.execute(
                    text(
                        "SELECT 1 FROM sqlite_master WHERE type='table' "
                        "AND name='data_compatibility'"
                    )
                ).fetchone()
                if exists is None:
                    return
                connection.execute(
                    text(
                        "INSERT INTO data_compatibility "
                        "(id, minimum_application_version, updated_at) "
                        "VALUES (1, :version, CURRENT_TIMESTAMP) "
                        "ON CONFLICT(id) DO UPDATE SET "
                        "minimum_application_version=excluded.minimum_application_version, "
                        "updated_at=excluded.updated_at"
                    ),
                    {"version": floor},
                )
        finally:
            engine.dispose()
    except Exception:  # noqa: BLE001 - 标记文件已写；DB 行可在下次迁移补齐
        return


def prepare_data_directory(settings: Settings) -> None:
    """迁移之后：校验地板并把当前版本写入兼容标记。"""
    check_data_compatibility(settings)
    write_data_compatibility_marker(settings)


def run_migrations(settings: Settings) -> Path | None:
    """把数据库带到 head 结构，返回升级前备份的路径（没动结构时为 None）。"""
    check_data_compatibility(settings)
    database_path = settings.database_path
    lock_path = database_path.parent / f"{database_path.name}{MIGRATION_LOCK_SUFFIX}"
    with locked_file(lock_path):
        backup = _run_migrations_locked(settings)
    prepare_data_directory(settings)
    return backup


def _run_migrations_locked(settings: Settings) -> Path | None:
    database_path = settings.database_path
    script_dir = _migrations_dir(settings)
    config = _migration_config(settings, script_dir) if script_dir is not None else None

    if config is None:
        target_revision = SCHEMA_REVISION
    else:
        target_revision = ScriptDirectory.from_config(config).get_current_head()
        if target_revision is None:
            raise RuntimeError("No database migration head is configured.")
        if target_revision != SCHEMA_REVISION:
            raise RuntimeError(
                f"迁移脚本的 head 是 {target_revision}，但常量 SCHEMA_REVISION 是 {SCHEMA_REVISION}："
                "发行产物按常量建库，两者不一致会让新库缺表。请同步 src/core/migrations.py。"
            )

    source_revision = _database_revision(database_path)
    if source_revision == "unversioned":
        raise LegacyDatabaseError(
            "数据库是老版本的旧结构：库里已经有业务表，却没有 alembic_version 记录。"
            "当前版本只支持全新安装的 0001 基线，不能从老库直接升级。"
            "请先备份数据目录；需要保留数据时，用旧版本导出后在新库导入。"
        )
    if source_revision == target_revision:
        # 版本号到了 head **不等于**结构到了 head：迁移被应用之后又改 ORM / 改脚本，
        # 版本号不会回退。只信版本号会带着缺列的库启动（license 查询等直接 503）。
        drift = _schema_drift(settings.database_url)
        if drift:
            detail = "\n  - ".join(drift)
            raise RuntimeError(
                f"数据库版本号已是 head（{target_revision}），但结构与 ORM 不一致：\n"
                f"  - {detail}\n"
                "常见原因：某个迁移在**被应用之后**又追加了内容，而版本号不会再回退。"
                "请补一个「缺了才加」的修复迁移后重启，"
                "或从数据目录的 *.pre-migrate-*.bak 快照恢复。"
            )
        return None
    if source_revision is None:
        backup_database(database_path)
        if config is None:
            _create_schema(settings)
        else:
            command.upgrade(config, "head")
        _validate_database(database_path, target_revision)
        return None

    known = config is not None and _script_knows_revision(config, source_revision)
    if not known and not _schema_matches_orm(settings.database_url):
        raise _legacy_error(source_revision)

    backup_path = backup_database(database_path)
    prune_database_backups(database_path)
    if config is None or not known:
        _set_recorded_revision(database_path, target_revision)
        _validate_database(database_path, target_revision)
        return backup_path
    try:
        command.upgrade(config, "head")
        _validate_database(database_path, target_revision)
    except Exception as error:
        if backup_path is not None:
            restore_database_backup(database_path, backup_path)
        raise RuntimeError(
            f"数据库升级失败；已从 {backup_path} 恢复升级前的库。"
        ) from error
    return backup_path


def write_upgrade_metadata(settings: Settings, backup_path: Path, target_revision: str) -> None:
    """为升级备份写入元数据 sidecar（供运维核对版本与校验和）。"""
    metadata = {
        "applicationVersion": settings.version if hasattr(settings, "version") else "",
        "createdAt": datetime.now(UTC).isoformat(),
        "databaseFile": backup_path.name,
        "databaseSha256": _sha256(backup_path),
        "targetRevision": target_revision,
    }
    metadata_path = backup_path.with_suffix(".json")
    metadata_path.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
