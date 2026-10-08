"""加密便携业务备份（对齐 HA Bridge 0.6.9–0.7.0 ``business_backup``）。

归档格式：``HABACKUP\\x01`` + salt(16) + nonce(12) + ciphertext + tag(16)；
密钥由 Scrypt(n=32768,r=8,p=1) 从密码派生。载荷为 zip，内含 ``business.json``
与可移植目录树（assets / exports / studio3d / modules/interaction3d/scenes）。

不携带：用户账号、授权密钥、中控配对。HomeOS 额外在 JSON 中附带 ``ui`` 与
``appConfig``，以便一次恢复覆盖完整业务面。
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import shutil
import sqlite3
import time
import zipfile
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from typing import Any
from uuid import uuid4
from zipfile import ZipFile

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from ...core.migrations import (
    compare_application_versions,
    write_data_compatibility_marker,
)
from ...security.login_limiter import LoginAttemptLimiter

logger = logging.getLogger("homeos.backup.business")

MAGIC = b"HABACKUP\x01"
MAX_ARCHIVE = 512 * 1024 * 1024
MAX_EXPANDED = 1024 * 1024 * 1024
MAX_FILES = 20_000
MAX_JSON = 128 * 1024 * 1024
JOB_TTL_SECONDS = 10 * 60
ROOTS = ("assets", "exports", "studio3d", "modules/interaction3d/scenes")
# 官方 0.7.1 表集合；HomeOS 额外携带 project_configs。
OFFICIAL_TABLES = (
    "ha_connections",
    "ha_entities",
    "ha_devices",
    "ha_areas",
    "ha_sync_state",
    "projects",
    "project_drafts",
    "global_custom_popup_state",
    "studio_interaction_sync",
)
TABLES = (*OFFICIAL_TABLES, "project_configs")
DELETE_ORDER = (
    "project_configs",
    "project_drafts",
    "projects",
    "ha_sync_state",
    "ha_entities",
    "ha_devices",
    "ha_areas",
    "ha_connections",
    "global_custom_popup_state",
    "studio_interaction_sync",
)
COMMIT_KEY = "_businessRestoreCommit"
PRODUCT = "HomeOS"
KIND = "homeos-business-backup"
SCHEMA_VERSION = 1
FORMAT_VERSION = 1


class BackupError(RuntimeError):
    """业务备份/恢复可预期失败（密码错误、超限、版本不兼容等）。"""


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as reader:
        while True:
            chunk = reader.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def _sync_directory(directory: Path) -> None:
    try:
        descriptor = os.open(str(directory), os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(descriptor)
    except OSError:
        pass
    finally:
        os.close(descriptor)


def _portable_path(name: str) -> bool:
    if not isinstance(name, str) or "\\" in name or "\x00" in name:
        return False
    path = PurePosixPath(name)
    if path.is_absolute() or path.as_posix() != name:
        return False
    if any(part in {"", ".", ".."} for part in path.parts):
        return False
    return any(name == root or name.startswith(root + "/") for root in ROOTS)


def _key(password: str | bytes, salt: bytes) -> bytes:
    raw = password.encode("utf-8") if isinstance(password, str) else password
    return Scrypt(salt=salt, length=32, n=32768, r=8, p=1).derive(raw)


def encrypt_archive(source: Path, target: Path, password: str) -> None:
    salt = os.urandom(16)
    nonce = os.urandom(12)
    header = MAGIC + salt + nonce
    encryptor = Cipher(algorithms.AES(_key(password, salt)), modes.GCM(nonce)).encryptor()
    # 对齐 HA Bridge 0.7.1：GCM AAD = MAGIC + salt + nonce
    encryptor.authenticate_additional_data(header)
    with source.open("rb") as reader, target.open("wb") as writer:
        writer.write(header)
        while True:
            chunk = reader.read(1024 * 1024)
            if not chunk:
                break
            writer.write(encryptor.update(chunk))
        writer.write(encryptor.finalize())
        writer.write(encryptor.tag)


def decrypt_archive(source: Path, target: Path, password: str) -> None:
    size = source.stat().st_size
    header_size = len(MAGIC) + 28
    if size > MAX_ARCHIVE or size < header_size + 16:
        raise BackupError("备份文件无效或超过 512 MB 上限。")
    with source.open("rb") as reader:
        header = reader.read(header_size)
        if not header.startswith(MAGIC):
            raise BackupError("不是有效的 HomeOS 加密备份文件。")
        salt = header[len(MAGIC) : len(MAGIC) + 16]
        nonce = header[-12:]
        ciphertext = reader.read(size - header_size - 16)
        tag = reader.read(16)
    key = _key(password, salt)

    def _decrypt(*, with_aad: bool) -> bytes:
        decryptor = Cipher(algorithms.AES(key), modes.GCM(nonce, tag)).decryptor()
        if with_aad:
            decryptor.authenticate_additional_data(header)
        return decryptor.update(ciphertext) + decryptor.finalize()

    try:
        # 0.7.1 线格式带 AAD；兼容本仓库早期无 AAD 备份。
        try:
            plain = _decrypt(with_aad=True)
        except Exception:  # noqa: BLE001
            plain = _decrypt(with_aad=False)
    except Exception as error:  # noqa: BLE001
        raise BackupError("备份密码不正确，或文件已损坏。") from error
    target.write_bytes(plain)


def _columns(connection: sqlite3.Connection, table: str) -> list[str]:
    return [str(row[1]) for row in connection.execute(f"PRAGMA table_info({table})")]


def _table_rows(connection: sqlite3.Connection, table: str) -> list[dict[str, Any]]:
    columns = _columns(connection, table)
    if not columns:
        return []
    rows = connection.execute(f"SELECT * FROM {table}").fetchall()
    return [dict(zip(columns, row, strict=True)) for row in rows]


def snapshot(settings: Any, *, portable: bool) -> dict[str, Any]:
    del portable  # HomeOS 业务备份始终便携，不含账号/授权
    database_path = settings.database_path
    tables: dict[str, list[dict[str, Any]]] = {}
    with closing(sqlite3.connect(f"file:{database_path}?mode=ro", uri=True)) as connection:
        connection.row_factory = None
        for table in TABLES:
            exists = connection.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                (table,),
            ).fetchone()
            tables[table] = _table_rows(connection, table) if exists else []
    ui: list[Any] = []
    app_config: dict[str, Any] = {}
    return {
        "kind": KIND,
        "product": PRODUCT,
        "schemaVersion": SCHEMA_VERSION,
        "version": settings.version,
        "minimumApplicationVersion": settings.version,
        "createdAt": _now_iso(),
        "tables": tables,
        "roots": list(ROOTS),
        "ui": ui,
        "appConfig": app_config,
        "pairings": 0,
    }


def attach_homeos_bundle_slices(
    value: dict[str, Any],
    *,
    ui: list[Any] | None,
    app_config: dict[str, Any] | None,
) -> dict[str, Any]:
    if isinstance(ui, list):
        value["ui"] = ui
    if isinstance(app_config, dict):
        value["appConfig"] = app_config
    return value


def create_archive(
    settings: Any,
    directory: Path,
    password: str,
    *,
    ui: list[Any] | None = None,
    app_config: dict[str, Any] | None = None,
) -> Path:
    if not (8 <= len(password) <= 128):
        raise BackupError("备份密码长度须为 8–128 个字符。")
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    value = attach_homeos_bundle_slices(
        snapshot(settings, portable=True), ui=ui, app_config=app_config
    )
    raw = directory / "payload.zip"
    total = 0
    file_manifest: dict[str, dict[str, Any]] = {}
    with ZipFile(raw, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for root in ROOTS:
            base = settings.data_dir / root
            if base.is_symlink():
                raise BackupError("业务数据目录含符号链接，无法创建完整备份。")
            if not base.is_dir():
                continue
            for path in sorted(base.rglob("*")):
                if path.is_symlink():
                    raise BackupError("业务数据含符号链接，无法创建完整备份。")
                if not path.is_file():
                    continue
                relative = path.relative_to(settings.data_dir).as_posix()
                if not _portable_path(relative):
                    continue
                size = path.stat().st_size
                total += size
                if total > MAX_EXPANDED or len(file_manifest) >= MAX_FILES:
                    raise BackupError(
                        "业务数据超过本版备份限制（展开后 1 GB、最多 20000 个文件）。"
                    )
                file_manifest[relative] = {"sha256": _hash(path), "size": size}
                archive.write(path, arcname=relative)
        value["manifest"] = {
            "product": PRODUCT,
            "formatVersion": FORMAT_VERSION,
            "applicationVersion": settings.version,
            "minimumRestoreVersion": settings.version,
            "createdAt": value.get("createdAt") or _now_iso(),
            "files": file_manifest,
        }
        encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if len(encoded) > MAX_JSON or total + len(encoded) > MAX_EXPANDED:
            raise BackupError("业务配置超过本版备份大小限制。")
        archive.writestr("business.json", encoded)
    if raw.stat().st_size > MAX_ARCHIVE - 64:
        raise BackupError("生成的备份超过 512 MB，请先清理不需要的业务素材。")
    result = directory / "backup.habackup"
    encrypt_archive(raw, result, password)
    raw.unlink(missing_ok=True)
    return result


def _verify_manifest_files(archive: ZipFile, files: dict[str, Any]) -> None:
    """核对 zip 内文件与 manifest.files 的 sha256 / size（有清单时强制）。"""
    if not files:
        return
    names = set(archive.namelist())
    for relative, meta in files.items():
        if not isinstance(relative, str) or not _portable_path(relative):
            raise BackupError("备份清单含非法路径。")
        if relative not in names:
            raise BackupError(f"备份缺少清单文件：{relative}")
        info = archive.getinfo(relative)
        expected_size = int((meta or {}).get("size") or -1) if isinstance(meta, dict) else -1
        if expected_size >= 0 and info.file_size != expected_size:
            raise BackupError(f"备份文件大小与清单不符：{relative}")
        expected_hash = (
            str((meta or {}).get("sha256") or "").lower() if isinstance(meta, dict) else ""
        )
        if not expected_hash:
            continue
        digest = hashlib.sha256()
        with archive.open(relative) as reader:
            while True:
                chunk = reader.read(1024 * 1024)
                if not chunk:
                    break
                digest.update(chunk)
        if digest.hexdigest() != expected_hash:
            raise BackupError(f"备份文件摘要与清单不符：{relative}")


def inspect_archive(settings: Any, directory: Path, password: str) -> dict[str, Any]:
    upload = directory / "upload.habackup"
    raw = directory / "payload.zip"
    decrypt_archive(upload, raw, password)
    with ZipFile(raw, "r") as archive:
        names = archive.namelist()
        if "business.json" not in names:
            raise BackupError("备份内容缺少 business.json。")
        encoded = archive.read("business.json")
        if len(encoded) > MAX_JSON:
            raise BackupError("备份元数据过大。")
        value = json.loads(encoded.decode("utf-8"))
        (directory / "business.json").write_bytes(encoded)
        manifest = value.get("manifest") if isinstance(value.get("manifest"), dict) else {}
        files = manifest.get("files") if isinstance(manifest.get("files"), dict) else {}
        _verify_manifest_files(archive, files)
    validate_business(settings, value)
    manifest = value.get("manifest") if isinstance(value.get("manifest"), dict) else {}
    files = manifest.get("files") if isinstance(manifest.get("files"), dict) else {}
    file_count = len(files) if files else max(0, len(names) - 1)
    tables = value.get("tables") or {}
    version = (
        manifest.get("applicationVersion")
        or value.get("version")
        or ""
    )
    minimum = (
        manifest.get("minimumRestoreVersion")
        or value.get("minimumApplicationVersion")
        or version
        or ""
    )
    return {
        "kind": value.get("kind") or KIND,
        "product": manifest.get("product") or value.get("product") or PRODUCT,
        "version": version,
        "minimumApplicationVersion": minimum,
        "createdAt": manifest.get("createdAt") or value.get("createdAt") or "",
        "projects": len(tables.get("projects") or []),
        "connections": len(tables.get("ha_connections") or []),
        "files": file_count,
        "pairings": int(value.get("pairings") or 0),
        "hasUi": isinstance(value.get("ui"), list),
        "hasAppConfig": isinstance(value.get("appConfig"), dict),
        "expiresIn": JOB_TTL_SECONDS,
    }


def validate_business(settings: Any, value: dict[str, Any]) -> None:
    if not isinstance(value, dict):
        raise BackupError("备份元数据无效。")
    kind = value.get("kind")
    product = ""
    manifest = value.get("manifest")
    if isinstance(manifest, dict):
        product = str(manifest.get("product") or "")
        format_version = int(manifest.get("formatVersion") or 0)
        if format_version and format_version > FORMAT_VERSION:
            raise BackupError(
                f"备份格式版本 {format_version} 高于当前程序支持的 {FORMAT_VERSION}，请先升级程序。"
            )
        minimum = str(manifest.get("minimumRestoreVersion") or "").strip()
    else:
        minimum = str(value.get("minimumApplicationVersion") or value.get("version") or "").strip()
    if kind not in {KIND, "ha-bridge-business-backup", None} and product not in {
        PRODUCT,
        "HA Bridge",
        "",
    }:
        if kind not in {None, KIND} and not str(kind).endswith("business-backup"):
            raise BackupError("不是 HomeOS / 兼容的业务备份包。")
    schema = int(value.get("schemaVersion") or 0)
    if schema > SCHEMA_VERSION:
        raise BackupError(
            f"备份格式版本 {schema} 高于当前程序支持的 {SCHEMA_VERSION}，请先升级程序。"
        )
    if minimum and compare_application_versions(settings.version, minimum) < 0:
        raise BackupError(
            f"此备份要求程序版本 ≥ {minimum}，当前为 {settings.version}。"
            "请升级后再恢复。"
        )
    tables = value.get("tables")
    if not isinstance(tables, dict):
        raise BackupError("备份缺少业务表数据。")
    official_set = set(OFFICIAL_TABLES)
    table_keys = set(tables)
    if table_keys == official_set or official_set.issubset(table_keys):
        return
    required = {"ha_connections", "projects", "project_drafts"}
    if not required.issubset(table_keys):
        raise BackupError("备份业务数据范围不完整。")


def _journal_path(settings: Any) -> Path:
    return settings.data_dir / "backup-recovery" / "journal.json"


def _replace_rows(
    connection: sqlite3.Connection,
    value: dict[str, Any],
    settings: Any,
) -> None:
    del settings
    tables = value.get("tables") or {}
    for table in DELETE_ORDER:
        exists = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            (table,),
        ).fetchone()
        if exists is None:
            continue
        connection.execute(f'DELETE FROM "{table}"')
    for table in TABLES:
        exists = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            (table,),
        ).fetchone()
        if exists is None:
            continue
        rows = tables.get(table) or []
        columns = _columns(connection, table)
        if not rows or not columns:
            continue
        placeholders = ",".join("?" for _ in columns)
        col_sql = ",".join(f'"{column}"' for column in columns)
        for row in rows:
            if not isinstance(row, dict):
                continue
            connection.execute(
                f'INSERT INTO "{table}" ({col_sql}) VALUES ({placeholders})',
                [row.get(column) for column in columns],
            )


def _has_sync_document_column(connection: sqlite3.Connection) -> bool:
    exists = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='studio_interaction_sync'"
    ).fetchone()
    if exists is None:
        return False
    return "document_json" in _columns(connection, "studio_interaction_sync")


def _commit_marker(connection: sqlite3.Connection) -> str | None:
    if not _has_sync_document_column(connection):
        return None
    row = connection.execute(
        "SELECT document_json FROM studio_interaction_sync WHERE id=1"
    ).fetchone()
    if not row or not row[0]:
        return None
    try:
        document = json.loads(row[0])
    except json.JSONDecodeError:
        return None
    marker = document.get(COMMIT_KEY) if isinstance(document, dict) else None
    return str(marker) if marker else None


def _write_commit_marker(connection: sqlite3.Connection, identifier: str) -> None:
    if not _has_sync_document_column(connection):
        return
    row = connection.execute(
        "SELECT document_json FROM studio_interaction_sync WHERE id=1"
    ).fetchone()
    try:
        document = json.loads(row[0]) if row and row[0] else {}
    except json.JSONDecodeError:
        document = {}
    if not isinstance(document, dict):
        document = {}
    document[COMMIT_KEY] = identifier
    encoded = json.dumps(document, ensure_ascii=False, separators=(",", ":"))
    if row:
        connection.execute(
            "UPDATE studio_interaction_sync SET document_json=? WHERE id=1",
            (encoded,),
        )
    else:
        connection.execute(
            "INSERT INTO studio_interaction_sync (id, document_json) VALUES (1, ?)",
            (encoded,),
        )


def _clear_commit_marker(connection: sqlite3.Connection, identifier: str) -> None:
    if _commit_marker(connection) != identifier:
        return
    row = connection.execute(
        "SELECT document_json FROM studio_interaction_sync WHERE id=1"
    ).fetchone()
    if not row or not row[0]:
        return
    try:
        document = json.loads(row[0])
    except json.JSONDecodeError:
        return
    if not isinstance(document, dict):
        return
    document.pop(COMMIT_KEY, None)
    connection.execute(
        "UPDATE studio_interaction_sync SET document_json=? WHERE id=1",
        (json.dumps(document, ensure_ascii=False, separators=(",", ":")),),
    )


def _snapshot_current_tables(settings: Any, target: Path) -> None:
    tables: dict[str, list[dict[str, Any]]] = {}
    with closing(sqlite3.connect(f"file:{settings.database_path}?mode=ro", uri=True)) as connection:
        for table in TABLES:
            exists = connection.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                (table,),
            ).fetchone()
            tables[table] = _table_rows(connection, table) if exists else []
    target.write_text(
        json.dumps({"tables": tables}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def _restore_files(settings: Any, directory: Path, journal: dict[str, Any]) -> None:
    raw = directory / "payload.zip"
    extract_root = directory / "extracted"
    if extract_root.exists():
        shutil.rmtree(extract_root)
    extract_root.mkdir(parents=True, exist_ok=True)
    business = json.loads((directory / "business.json").read_text(encoding="utf-8"))
    manifest = business.get("manifest") if isinstance(business.get("manifest"), dict) else {}
    files = manifest.get("files") if isinstance(manifest.get("files"), dict) else {}
    with ZipFile(raw, "r") as archive:
        for info in archive.infolist():
            name = info.filename
            if name.endswith("/") or name == "business.json":
                continue
            if not _portable_path(name):
                raise BackupError("备份含非法路径，已中止恢复。")
        _verify_manifest_files(archive, files)
        archive.extractall(extract_root)
    for root in ROOTS:
        target = settings.data_dir / root
        source = extract_root / root
        if target.exists():
            backup_name = journal.setdefault("existing", {}).get(root)
            if not backup_name:
                stamped = (
                    settings.data_dir
                    / "backup-recovery"
                    / f"{root.replace('/', '_')}-{journal['id']}"
                )
                stamped.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(target), str(stamped))
                journal["existing"][root] = str(stamped)
                _sync_directory(stamped.parent)
        if source.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(source), str(target))
            _sync_directory(target.parent)


def _rollback_files(journal: dict[str, Any], settings: Any) -> None:
    for root in reversed(ROOTS):
        stamped = journal.get("existing", {}).get(root)
        if not stamped:
            continue
        stamped_path = Path(stamped)
        target = settings.data_dir / root
        if not stamped_path.exists():
            continue
        if target.exists():
            shutil.rmtree(target, ignore_errors=True)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(stamped_path), str(target))
        _sync_directory(target.parent)


def restore_business(settings: Any, directory: Path, user_id: str | None = None) -> dict[str, Any]:
    del user_id
    value = json.loads((directory / "business.json").read_text(encoding="utf-8"))
    validate_business(settings, value)
    recovery = settings.data_dir / "backup-recovery"
    recovery.mkdir(parents=True, exist_ok=True, mode=0o700)
    identifier = uuid4().hex
    old_tables_path = recovery / f"{identifier}-old-tables.json"
    journal = {
        "id": identifier,
        "phase": "files",
        "startedAt": _now_iso(),
        "existing": {},
        "oldTables": str(old_tables_path),
    }
    journal_path = _journal_path(settings)
    journal_path.write_text(json.dumps(journal, ensure_ascii=False), encoding="utf-8")
    try:
        _snapshot_current_tables(settings, old_tables_path)
        _restore_files(settings, directory, journal)
        journal["phase"] = "database"
        journal_path.write_text(json.dumps(journal, ensure_ascii=False), encoding="utf-8")
        with closing(sqlite3.connect(settings.database_path)) as connection:
            connection.execute("PRAGMA foreign_keys=OFF")
            try:
                _replace_rows(connection, value, settings)
                _write_commit_marker(connection, identifier)
                connection.commit()
            finally:
                connection.execute("PRAGMA foreign_keys=ON")
        write_data_compatibility_marker(
            settings,
            minimum=str(
                (value.get("manifest") or {}).get("minimumRestoreVersion")
                or value.get("minimumApplicationVersion")
                or settings.version
            ),
        )
        with closing(sqlite3.connect(settings.database_path)) as connection:
            _clear_commit_marker(connection, identifier)
            connection.commit()
        journal["phase"] = "done"
        journal_path.write_text(json.dumps(journal, ensure_ascii=False), encoding="utf-8")
        journal_path.unlink(missing_ok=True)
        old_tables_path.unlink(missing_ok=True)
        return {
            "ok": True,
            "ui": value.get("ui") if isinstance(value.get("ui"), list) else None,
            "appConfig": value.get("appConfig")
            if isinstance(value.get("appConfig"), dict)
            else None,
        }
    except Exception:
        try:
            with closing(sqlite3.connect(settings.database_path)) as connection:
                committed = _commit_marker(connection) == identifier
            if not committed:
                _rollback_files(journal, settings)
                if old_tables_path.is_file():
                    old = json.loads(old_tables_path.read_text(encoding="utf-8"))
                    with closing(sqlite3.connect(settings.database_path)) as connection:
                        connection.execute("PRAGMA foreign_keys=OFF")
                        try:
                            _replace_rows(connection, old, settings)
                            connection.commit()
                        finally:
                            connection.execute("PRAGMA foreign_keys=ON")
                journal_path.unlink(missing_ok=True)
                old_tables_path.unlink(missing_ok=True)
        except Exception:  # noqa: BLE001
            logger.exception("业务恢复失败后的自动回滚未完成")
        raise


def recover_interrupted_restore(settings: Any) -> bool:
    journal_path = _journal_path(settings)
    if not journal_path.is_file():
        return False
    try:
        journal = json.loads(journal_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        journal_path.unlink(missing_ok=True)
        return False
    phase = journal.get("phase")
    identifier = str(journal.get("id") or "")
    if phase == "done" or not identifier:
        journal_path.unlink(missing_ok=True)
        return False
    try:
        with closing(sqlite3.connect(settings.database_path)) as connection:
            committed = _commit_marker(connection) == identifier
            if committed:
                _clear_commit_marker(connection, identifier)
                connection.commit()
                journal_path.unlink(missing_ok=True)
                Path(str(journal.get("oldTables") or "")).unlink(missing_ok=True)
                return False
        _rollback_files(journal, settings)
        old_tables_path = Path(str(journal.get("oldTables") or ""))
        if old_tables_path.is_file():
            old = json.loads(old_tables_path.read_text(encoding="utf-8"))
            with closing(sqlite3.connect(settings.database_path)) as connection:
                connection.execute("PRAGMA foreign_keys=OFF")
                try:
                    _replace_rows(connection, old, settings)
                    connection.commit()
                finally:
                    connection.execute("PRAGMA foreign_keys=ON")
            old_tables_path.unlink(missing_ok=True)
        journal_path.unlink(missing_ok=True)
        logger.warning("未完成的业务备份恢复已自动回滚（phase=%s）。", phase)
        return False
    except Exception:  # noqa: BLE001
        logger.exception("检测到未完成的业务备份恢复（phase=%s），自动回滚失败。", phase)
        return True


async def durable_work(function: Any, *args: Any) -> Any:
    return await asyncio.to_thread(function, *args)


class BackupCoordinator:
    def __init__(self, app: Any) -> None:
        self.app = app
        self.jobs: dict[str, dict[str, Any]] = {}
        self.recovery_required = False
        self.maintenance = False
        self._lock = asyncio.Lock()
        self.backup_password_limiter = LoginAttemptLimiter(
            max_failures=5, window_seconds=300, block_seconds=600
        )

    def cleanup_startup(self) -> None:
        settings = self.app.state.settings
        work = settings.data_dir / "backup-work"
        if work.is_dir():
            for child in work.iterdir():
                if child.is_dir():
                    for filename in ("business.json", "upload.habackup", "payload.zip"):
                        (child / filename).unlink(missing_ok=True)
        if recover_interrupted_restore(settings):
            self.recovery_required = True

    def workspace(self) -> Path:
        root = self.app.state.settings.data_dir / "backup-work" / uuid4().hex
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
        return root

    def cleanup_job(self, directory: Path | None) -> None:
        if directory is None:
            return
        shutil.rmtree(directory, ignore_errors=True)

    def expire_jobs(self) -> None:
        now = time.time()
        expired = [ticket for ticket, job in self.jobs.items() if job["expiresAt"] <= now]
        for ticket in expired:
            job = self.jobs.pop(ticket, None)
            if job:
                self.cleanup_job(job.get("directory"))

    def prune_rollbacks(self) -> None:
        recovery = self.app.state.settings.data_dir / "backup-recovery"
        if not recovery.is_dir():
            return
        # 保留最近若干本地回退目录，避免无限膨胀。
        dirs = sorted(
            [path for path in recovery.iterdir() if path.is_dir()],
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        for stale in dirs[5:]:
            shutil.rmtree(stale, ignore_errors=True)


class BackupMaintenanceMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: Any, coordinator: BackupCoordinator) -> None:
        super().__init__(app)
        self.coordinator = coordinator

    async def dispatch(self, request: Request, call_next: Any):
        path = request.url.path
        if self.coordinator.maintenance and path.startswith("/api/v1/") and not path.startswith(
            "/api/v1/backups"
        ):
            return JSONResponse(
                status_code=503,
                content={"detail": "正在恢复业务数据，请稍候…"},
            )
        if self.coordinator.recovery_required and path.startswith("/api/v1/backups"):
            return JSONResponse(
                status_code=503,
                content={"detail": "恢复回退尚未完成，请重启服务或联系管理员后再试备份操作。"},
            )
        return await call_next(request)


__all__ = [
    "BackupCoordinator",
    "BackupError",
    "BackupMaintenanceMiddleware",
    "JOB_TTL_SECONDS",
    "MAX_ARCHIVE",
    "create_archive",
    "decrypt_archive",
    "durable_work",
    "inspect_archive",
    "recover_interrupted_restore",
    "restore_business",
    "snapshot",
]
