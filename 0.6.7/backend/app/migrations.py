from __future__ import annotations
import hashlib
import json
import os
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from .config import Settings

def _migration_config(settings: Settings) -> Config:
    config = Config(settings.project_root / 'alembic.ini')
    release_scripts = settings.project_root / 'alembic_runtime'
    script_location = release_scripts if release_scripts.is_dir() else settings.project_root / 'migrations'
    config.set_main_option('script_location', str(script_location))
    config.set_main_option('sqlalchemy.url', settings.database_url)
    return config

def _database_revision(database_path: Path) -> str | None:
    if not database_path.is_file() or database_path.stat().st_size == 0:
        return None
    with sqlite3.connect(f'file:{database_path}?mode=ro', uri = True) as connection:
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
    return None

def _validate_database(database_path: Path, expected_revision: str) -> None:
    with sqlite3.connect(f'file:{database_path}?mode=ro', uri = True) as connection:
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
    backup_directory.mkdir(parents = True, exist_ok = True, mode = 448)
    os.chmod(backup_directory, 448)
    timestamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
    safe_source = ''.join((character for character in source_revision if character.isalnum() or character in '-_'))
    safe_target = ''.join((character for character in target_revision if character.isalnum() or character in '-_'))
    backup_path = backup_directory / f'app-{safe_source}-to-{safe_target}-{timestamp}.db'
    temporary_suffix = uuid4().hex
    temporary_path = backup_directory / f'.{backup_path.name}.{temporary_suffix}.tmp'
    metadata_temporary_path = None
    try:
        with sqlite3.connect(settings.database_path) as source:
            with sqlite3.connect(temporary_path) as target:
                source.execute('PRAGMA busy_timeout = 5000')
                source.backup(target)
                integrity = target.execute('PRAGMA integrity_check').fetchone()
                if integrity is None or integrity[0] != 'ok':
                    detail = integrity[0] if integrity else 'no result'
                    raise RuntimeError(f'Upgrade backup integrity check failed: {detail}')
        os.chmod(temporary_path, 384)
        _fsync_file(temporary_path)
        os.replace(temporary_path, backup_path)
        metadata = {
            'applicationVersion': settings.version,
            'createdAt': datetime.now(timezone.utc).isoformat(),
            'databaseFile': backup_path.name,
            'databaseSha256': _sha256(backup_path),
            'sourceRevision': source_revision,
            'targetRevision': target_revision }
        metadata_path = backup_path.with_suffix('.json')
        metadata_suffix = uuid4().hex
        metadata_temporary_path = metadata_path.with_name(f'.{metadata_path.name}.{metadata_suffix}.tmp')
        metadata_temporary_path.write_text(json.dumps(metadata, ensure_ascii = False, indent = 2) + '\n', encoding = 'utf-8')
        os.chmod(metadata_temporary_path, 384)
        _fsync_file(metadata_temporary_path)
        os.replace(metadata_temporary_path, metadata_path)
        return backup_path
    finally:
        temporary_path.unlink(missing_ok = True)
        if metadata_temporary_path is not None:
            metadata_temporary_path.unlink(missing_ok = True)

def restore_upgrade_backup(settings: Settings, backup_path: Path) -> None:
    '''Atomically restore the pre-upgrade database after a failed migration.'''
    restore_suffix = uuid4().hex
    restore_path = settings.data_dir / f'.app.db.restore-{restore_suffix}'
    try:
        shutil.copy2(backup_path, restore_path)
        os.chmod(restore_path, 384)
        _fsync_file(restore_path)
        with sqlite3.connect(f'file:{restore_path}?mode=ro', uri = True) as connection:
            integrity = connection.execute('PRAGMA integrity_check').fetchone()
            if integrity is None or integrity[0] != 'ok':
                detail = integrity[0] if integrity else 'no result'
                raise RuntimeError(f'Upgrade backup restore check failed: {detail}')
        for suffix in ('-journal', '-wal', '-shm'):
            Path(f'{settings.database_path}{suffix}').unlink(missing_ok = True)
        os.replace(restore_path, settings.database_path)
        os.chmod(settings.database_path, 384)
    finally:
        restore_path.unlink(missing_ok = True)

def run_migrations(settings: Settings) -> Path | None:
    config = _migration_config(settings)
    target_revision = ScriptDirectory.from_config(config).get_current_head()
    if target_revision is None:
        raise RuntimeError('No database migration head is configured.')
    source_revision = _database_revision(settings.database_path)
    backup_path = None
    if source_revision is not None and source_revision != target_revision:
        backup_path = create_upgrade_backup(settings, source_revision, target_revision)
    try:
        command.upgrade(config, 'head')
        _validate_database(settings.database_path, target_revision)
    except Exception as error:
        if backup_path is not None:
            restore_upgrade_backup(settings, backup_path)
            raise RuntimeError(f'Database upgrade failed; the pre-upgrade database was restored from {backup_path}.') from error
        raise
    return backup_path
