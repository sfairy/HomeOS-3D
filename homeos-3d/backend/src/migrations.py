from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

from .config import Settings


def _migrations_dir(settings: Settings) -> Path | None:
    """Alembic 脚本目录；源码/开发布局有，发行产物里没有（那时改走 ORM 建库）。"""
    release_scripts = settings.project_root / 'alembic_runtime'
    if release_scripts.is_dir():
        return release_scripts
    source_scripts = settings.project_root / 'migrations'
    return source_scripts if source_scripts.is_dir() else None

def _migration_config(settings: Settings, script_dir: Path) -> Config:
    config = Config(settings.project_root / 'alembic.ini')
    config.set_main_option('script_location', str(script_dir))
    config.set_main_option('sqlalchemy.url', settings.database_url)
    return config

#: 结构基线版本号。发行产物不带迁移脚本，新库直接按 ORM 元数据建好后写入这个版本号；
#: 开发期存在 migrations/ 时，会校验它与 Alembic head 一致。
SCHEMA_REVISION = '0001'

def _create_schema(settings: Settings) -> None:
    """按 ORM 元数据建出全新库，并打上基线版本号。

    ``0001`` 基线是照着 ``Base.metadata`` 自动生成的，两者结构等价（``ops/check_schema.py``
    会比对结构指纹），所以 create_all 与跑一次迁移得到的是同一个库。
    """
    from . import models  # noqa: F401  # 注册到 Base.metadata  # pyright: ignore[reportUnusedImport]
    from .database import Base, Database
    database = Database(settings.database_url)
    try:
        Base.metadata.create_all(database.engine)
        with database.engine.begin() as connection:
            connection.exec_driver_sql(
                'CREATE TABLE IF NOT EXISTS alembic_version ('
                'version_num VARCHAR(32) NOT NULL, '
                'CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))'
            )
            connection.exec_driver_sql('DELETE FROM alembic_version')
            connection.exec_driver_sql(
                'INSERT INTO alembic_version (version_num) VALUES (?)', (SCHEMA_REVISION,)
            )
    finally:
        database.dispose()

_SIDECAR_SUFFIXES = ('-journal', '-wal', '-shm')

def _remove_sidecars(database_path: Path) -> None:
    for suffix in _SIDECAR_SUFFIXES:
        Path(f'{database_path}{suffix}').unlink(missing_ok = True)

def _has_business_tables(connection: sqlite3.Connection) -> bool:
    row = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'alembic_version' LIMIT 1"
    ).fetchone()
    return row is not None

def _database_revision(database_path: Path) -> str | None:
    """库内记录的 revision。

    ``None`` 表示全新安装（没有库文件，或文件里连业务表都没有）；
    ``'unversioned'`` 表示 Alembic 迁移之前的老结构（有业务表，却没有 alembic_version 记录）。
    """
    if not database_path.is_file() or database_path.stat().st_size == 0:
        return None
    with closing(sqlite3.connect(f'file:{database_path}?mode=ro', uri = True)) as connection:
        table = connection.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'alembic_version'").fetchone()
        if table is None:
            return 'unversioned' if _has_business_tables(connection) else None
        row = connection.execute('SELECT version_num FROM alembic_version LIMIT 1').fetchone()
        if row:
            return str(row[0])
        return 'unversioned' if _has_business_tables(connection) else None

def _set_recorded_revision(database_path: Path, revision: str) -> None:
    """直接改写 ``alembic_version``。

    库内记录的旧 revision 已不在脚本目录里，``alembic stamp`` 会因为解析不了它而失败，所以这里
    只改那一行记录 —— 前提是调用方已经确认过库结构与 ORM 一致（见 :func:`_schema_matches_orm`）。
    """
    with closing(sqlite3.connect(database_path)) as connection:
        connection.execute('DELETE FROM alembic_version')
        connection.execute('INSERT INTO alembic_version (version_num) VALUES (?)', (revision,))
        connection.commit()

def _script_knows_revision(config: Config, revision: str) -> bool:
    """当前脚本目录里是否存在这个 revision。"""
    try:
        ScriptDirectory.from_config(config).get_revision(revision)
        return True
    except Exception:
        return False

def _schema_matches_orm(database_url: str) -> bool:
    """库结构是否已满足 ORM 元数据（只查「缺表 / 缺列 / 缺索引」，多出来的历史对象不算差异）。

    老链末端建出来的库与本基线 ``0001`` 在 ORM 口径上是同一个结构，
    只是 ``alembic_version`` 记录还停在旧编号。这种情况可以安全接管：只改记录、不动结构。
    """
    from sqlalchemy import create_engine, inspect

    from . import models  # noqa: F401  # pyright: ignore[reportUnusedImport]
    from .database import Base
    engine = create_engine(database_url)
    try:
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                return False
            columns = {column['name'] for column in inspector.get_columns(table.name)}
            if not {column.name for column in table.columns} <= columns:
                return False
            indexes = {index['name'] for index in inspector.get_indexes(table.name)}
            if not {index.name for index in table.indexes if index.name} <= indexes:
                return False
        return True
    finally:
        engine.dispose()

def _legacy_error(revision: str) -> RuntimeError:
    return RuntimeError(
        f'数据库记录的是压缩基线之前的迁移版本（{revision}），且结构与当前 ORM 不一致：'
        '当前版本只保留了 0001 基线，不能从老库直接升级，也不会自动改写老结构。'
        '请先备份数据目录；需要保留数据时，用旧版本启动导出数据后，再在全新安装上导入'
        '（或从 data/upgrade-backups/ 的备份恢复）。'
    )

def _sha256(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open('rb') as source:
        for chunk in iter(lambda : source.read(1048576), b''):
            digest.update(chunk)
    return digest.hexdigest()

def _fsync_file(file_path: Path) -> None:
    with file_path.open('rb') as source:
        os.fsync(source.fileno())

def _validate_database(database_path: Path, expected_revision: str) -> None:
    with closing(sqlite3.connect(f'file:{database_path}?mode=ro', uri = True)) as connection:
        integrity = connection.execute('PRAGMA integrity_check').fetchone()
        if integrity is None or integrity[0] != 'ok':
            detail = integrity[0] if integrity else 'no result'
            raise RuntimeError(f'SQLite integrity check failed: {detail}')
        row = connection.execute('SELECT version_num FROM alembic_version LIMIT 1').fetchone()
        actual_revision = str(row[0]) if row else 'unversioned'
        if actual_revision != expected_revision:
            raise RuntimeError(f'Database revision is {actual_revision}, expected {expected_revision}.')

def create_upgrade_backup(settings: Settings, source_revision: str, target_revision: str) -> Path:
    '''升级前创建并校验事务一致的副本。'''
    backup_directory = settings.data_dir / 'upgrade-backups'
    backup_directory.mkdir(parents = True, exist_ok = True, mode = 0o700)
    os.chmod(backup_directory, 0o700)
    timestamp = datetime.now(UTC).strftime('%Y%m%dT%H%M%S.%fZ')
    safe_source = ''.join(character for character in source_revision if character.isalnum() or character in '-_')
    safe_target = ''.join(character for character in target_revision if character.isalnum() or character in '-_')
    backup_path = backup_directory / f'app-{safe_source}-to-{safe_target}-{timestamp}.db'
    temporary_suffix = uuid4().hex
    temporary_path = backup_directory / f'.{backup_path.name}.{temporary_suffix}.tmp'
    metadata_temporary_path = None
    try:
        with closing(sqlite3.connect(settings.database_path)) as source, closing(sqlite3.connect(temporary_path)) as target:
            source.execute('PRAGMA busy_timeout = 5000')
            source.backup(target)
            integrity = target.execute('PRAGMA integrity_check').fetchone()
            if integrity is None or integrity[0] != 'ok':
                detail = integrity[0] if integrity else 'no result'
                raise RuntimeError(f'Upgrade backup integrity check failed: {detail}')
        os.chmod(temporary_path, 0o600)
        _fsync_file(temporary_path)
        os.replace(temporary_path, backup_path)
        metadata = {
            'applicationVersion': settings.version,
            'createdAt': datetime.now(UTC).isoformat(),
            'databaseFile': backup_path.name,
            'databaseSha256': _sha256(backup_path),
            'sourceRevision': source_revision,
            'targetRevision': target_revision }
        metadata_path = backup_path.with_suffix('.json')
        metadata_suffix = uuid4().hex
        metadata_temporary_path = metadata_path.with_name(f'.{metadata_path.name}.{metadata_suffix}.tmp')
        metadata_temporary_path.write_text(json.dumps(metadata, ensure_ascii = False, indent = 2) + '\n', encoding = 'utf-8')
        os.chmod(metadata_temporary_path, 0o600)
        _fsync_file(metadata_temporary_path)
        os.replace(metadata_temporary_path, metadata_path)
        return backup_path
    finally:
        temporary_path.unlink(missing_ok = True)
        _remove_sidecars(temporary_path)
        if metadata_temporary_path is not None:
            metadata_temporary_path.unlink(missing_ok = True)

def restore_upgrade_backup(settings: Settings, backup_path: Path) -> None:
    '''迁移失败后原子地恢复升级前的数据库。'''
    restore_suffix = uuid4().hex
    restore_path = settings.data_dir / f'.app.db.restore-{restore_suffix}'
    try:
        shutil.copy2(backup_path, restore_path)
        os.chmod(restore_path, 0o600)
        _fsync_file(restore_path)
        with closing(sqlite3.connect(f'file:{restore_path}?mode=ro', uri = True)) as connection:
            integrity = connection.execute('PRAGMA integrity_check').fetchone()
            if integrity is None or integrity[0] != 'ok':
                detail = integrity[0] if integrity else 'no result'
                raise RuntimeError(f'Upgrade backup restore check failed: {detail}')
        _remove_sidecars(settings.database_path)
        os.replace(restore_path, settings.database_path)
        os.chmod(settings.database_path, 0o600)
    finally:
        restore_path.unlink(missing_ok = True)
        _remove_sidecars(restore_path)

def run_migrations(settings: Settings) -> Path | None:
    """把数据库带到 head 结构，返回升级前备份的路径（没动结构时为 None）。

    发行产物里没有迁移脚本（``_migrations_dir`` 返回 None），此时 head 就是常量
    ``SCHEMA_REVISION``，新库按 ORM 元数据建；只有开发期存在脚本目录时才真正跑 Alembic。
    """
    script_dir = _migrations_dir(settings)
    config = _migration_config(settings, script_dir) if script_dir is not None else None
    if config is None:
        target_revision = SCHEMA_REVISION
    else:
        target_revision = ScriptDirectory.from_config(config).get_current_head()
        if target_revision is None:
            raise RuntimeError('No database migration head is configured.')
        if target_revision != SCHEMA_REVISION:
            raise RuntimeError(
                f'迁移脚本的 head 是 {target_revision}，但常量 SCHEMA_REVISION 是 {SCHEMA_REVISION}：'
                '发行产物按常量建库，两者不一致会让新库缺表。请同步 backend/src/migrations.py。'
            )
    source_revision = _database_revision(settings.database_path)
    if source_revision == 'unversioned':
        raise RuntimeError(
            '数据库是老版本的旧结构：库里已经有业务表，却没有 alembic_version 记录。'
            '当前版本只支持全新安装的 0001 基线，不能从老库直接升级，也不会自动改写老结构。'
            '请先备份数据目录；需要保留数据时，用旧版本启动导出数据后，再在全新安装上导入。'
        )
    if source_revision == target_revision:
        return None
    if source_revision is None:
        if config is None:
            _create_schema(settings)
        else:
            command.upgrade(config, 'head')
        _validate_database(settings.database_path, target_revision)
        return None
    known = config is not None and _script_knows_revision(config, source_revision)
    if not known and not _schema_matches_orm(settings.database_url):
        raise _legacy_error(source_revision)
    backup_path = create_upgrade_backup(settings, source_revision, target_revision)
    if config is None or not known:
        _set_recorded_revision(settings.database_path, target_revision)
        _validate_database(settings.database_path, target_revision)
        return backup_path
    try:
        command.upgrade(config, 'head')
        _validate_database(settings.database_path, target_revision)
    except Exception as error:
        restore_upgrade_backup(settings, backup_path)
        raise RuntimeError(f'Database upgrade failed; the pre-upgrade database was restored from {backup_path}.') from error
    return backup_path
