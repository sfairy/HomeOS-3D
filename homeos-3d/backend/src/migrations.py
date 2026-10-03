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


class UnknownRevisionError(RuntimeError):
    '''库内记录的 revision 不在当前迁移脚本目录里。

    最典型的情形是迁移链被压缩（例如把 0001…0023 收敛成单一基线）：旧库记录的 revision
    随旧脚本一起被删掉。Alembic 对这种情况只会抛一句 "Can't locate revision identified
    by ..."，读的人无从判断该重建库还是该对齐版本；这里把它换成一个写明出路的错误。
    '''


def _migration_config(settings: Settings) -> Config:
    config = Config(settings.project_root / 'alembic.ini')
    release_scripts = settings.project_root / 'alembic_runtime'
    script_location = release_scripts if release_scripts.is_dir() else settings.project_root / 'migrations'
    config.set_main_option('script_location', str(script_location))
    config.set_main_option('sqlalchemy.url', settings.database_url)
    return config

#: SQLite sidecar files: rollback journal, WAL, and the WAL shared-memory index.
#:
#: On a WAL-mode database even a **read-only** connection creates ``-shm``/``-wal`` next to it
#: (SQLite needs them for the shared-memory index), and they are not removed when the last
#: connection closes. Both the upgrade backup and the failed-upgrade restore open connections on
#: temporary paths, so cleaning those paths must also drop the sidecars -- otherwise every failed
#: attempt leaves litter in the data directory.
_SIDECAR_SUFFIXES = ('-journal', '-wal', '-shm')

def _remove_sidecars(database_path: Path) -> None:
    for suffix in _SIDECAR_SUFFIXES:
        Path(f'{database_path}{suffix}').unlink(missing_ok = True)

def _database_revision(database_path: Path) -> str | None:
    if not database_path.is_file() or database_path.stat().st_size == 0:
        return None
    with closing(sqlite3.connect(f'file:{database_path}?mode=ro', uri = True)) as connection:
        table = connection.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'alembic_version'").fetchone()
        if table is None:
            return 'unversioned'
        row = connection.execute('SELECT version_num FROM alembic_version LIMIT 1').fetchone()
        return str(row[0]) if row else 'unversioned'

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
    '''Create and verify a transactionally consistent copy before upgrading.'''
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
        with closing(sqlite3.connect(settings.database_path)) as source:
            with closing(sqlite3.connect(temporary_path)) as target:
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
    '''Atomically restore the pre-upgrade database after a failed migration.'''
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
        # The target may be WAL-mode: drop its stale sidecars before swapping the main file in,
        # otherwise a leftover WAL would be adopted by the restored database as its own journal.
        _remove_sidecars(settings.database_path)
        os.replace(restore_path, settings.database_path)
        os.chmod(settings.database_path, 0o600)
    finally:
        restore_path.unlink(missing_ok = True)
        _remove_sidecars(restore_path)

def _unmodeled_tables(database_path: Path) -> tuple[str, ...]:
    '''List tables that exist in the database but are unknown to the current ORM metadata.

    This is the tell-tale of a database built by another migration lineage: two lineages may reuse
    the same revision ids, so ``alembic_version`` alone cannot tell them apart. A release bundle
    ships a squashed baseline (see ``db/migrations``) and its database carries tables this code does
    not model (for example ``project_path_aliases``) while its recorded revision can collide with
    this lineage's -- running the upgrade chain on it only crashes on ``CREATE TABLE``.
    '''
    if not database_path.is_file() or database_path.stat().st_size == 0:
        return ()
    # 副作用导入：把 models 注册到 Base.metadata（ruff/pyright 都看不出「导入即副作用」）
    from . import models  # noqa: F401  # pyright: ignore[reportUnusedImport]
    from .database import Base
    known = set(Base.metadata.tables)
    with closing(sqlite3.connect(f'file:{database_path}?mode=ro', uri = True)) as connection:
        rows = connection.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").fetchall()
    return tuple(sorted(str(name) for (name,) in rows if name not in known and name != 'alembic_version'))

def _known_revisions(config: Config) -> set[str]:
    '''脚本目录里当前已知的全部 revision。'''
    return {str(script.revision) for script in ScriptDirectory.from_config(config).walk_revisions()}


def _baseline_revision(config: Config) -> str:
    '''内建基线 revision：整条链上 ``down_revision`` 为空的那个。'''
    for script in ScriptDirectory.from_config(config).walk_revisions():
        if not script.down_revision:
            return str(script.revision)
    raise RuntimeError('No database migration baseline is configured.')


def _guard_known_revision(config: Config, source_revision: str | None, target_revision: str) -> None:
    '''库内 revision 不在脚本目录里时，给出可执行的出路而不是 Alembic 的原始报错。

    ``unversioned``（有版本表但没记录）不算异常：那是 start.py 之外的调用方手工建出的
    半成品库，交给后续 upgrade 自己报错更准确。
    '''
    if source_revision in (None, 'unversioned', target_revision):
        return
    known = _known_revisions(config)
    if source_revision in known:
        return
    baseline = _baseline_revision(config)
    raise UnknownRevisionError(
        f'数据库 revision 是「{source_revision}」，它不在当前迁移脚本目录里（已知：{sorted(known)}）。'
        '这通常意味着迁移链被压缩过 —— 旧库记录的 revision 已随旧脚本删除，'
        '而不是库被改坏了。两种正当出路：'
        f'（1）开发阶段不需要库内数据时，删掉数据目录重新建库；'
        f'（2）要保留库内数据、且确认库结构已经等于基线时，把版本对齐到基线：'
        f'cd homeos-3d && .venv-store/bin/python -m alembic -c alembic.ini stamp --purge {baseline}。'
        '注意 stamp 只改版本号、不动结构，库结构对不上基线时不要使用。'
    )


def _guard_foreign_schema(settings: Settings, source_revision: str | None, target_revision: str) -> None:
    '''Refuse to upgrade a database whose schema is already ahead of its recorded revision.

    Only runs when the database is genuinely behind the target: a normal upgrade has no unmodeled
    tables, so this cannot produce false positives.
    '''
    if source_revision is None or source_revision == target_revision:
        return
    unmodeled = _unmodeled_tables(settings.database_path)
    if not unmodeled:
        return
    raise RuntimeError(
        f'Database schema is ahead of its recorded revision ({source_revision} -> {target_revision}): '
        f'the database contains tables this code does not model {list(unmodeled)}. This usually means '
        'the database was created by another migration lineage (e.g. the squashed baseline shipped in a '
        'release bundle), and two lineages may reuse the same revision ids, so upgrading further would '
        'fail with "table ... already exists". Use a separate data directory (APP_DATA_DIR) for this '
        'code, or align the database to this lineage with "alembic stamp".')

def run_migrations(settings: Settings) -> Path | None:
    config = _migration_config(settings)
    target_revision = ScriptDirectory.from_config(config).get_current_head()
    if target_revision is None:
        raise RuntimeError('No database migration head is configured.')
    source_revision = _database_revision(settings.database_path)
    _guard_foreign_schema(settings, source_revision, target_revision)
    _guard_known_revision(config, source_revision, target_revision)
    backup_path = None
    if source_revision is not None and source_revision != target_revision:
        backup_path = create_upgrade_backup(settings, source_revision, target_revision)
    try:
        command.upgrade(config, 'head')
        _validate_database(settings.database_path, target_revision)
    except Exception as error:
        if backup_path is not None:
            restore_upgrade_backup(settings, backup_path)
        lineage_hint = ''
        if 'already exists' in str(error) or 'duplicate column name' in str(error):
            lineage_hint = (' The database already contains objects this upgrade tries to create, which '
                            'usually means it was created by another migration lineage (two lineages may '
                            'reuse the same revision ids); use a separate data directory (APP_DATA_DIR) '
                            'or align the lineage with "alembic stamp".')
        if backup_path is not None:
            raise RuntimeError(f'Database upgrade failed; the pre-upgrade database was restored from {backup_path}.{lineage_hint}') from error
        if lineage_hint:
            raise RuntimeError(f'Database upgrade failed.{lineage_hint}') from error
        raise
    return backup_path
