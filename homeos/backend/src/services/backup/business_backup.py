"""加密全量业务备份（含数据库）。

归档格式：``HABACKUP\\x01`` + salt(16) + nonce(12) + ciphertext + tag(16)；
密钥由 Scrypt(n=32768,r=8,p=1) 从密码派生。载荷为 zip，内含：

- ``manifest.json``：格式元数据 + 文件清单（sha256 / size）；
- ``homeos.db``：``VACUUM INTO`` 生成的整库快照（全部表，含 users / license）；
- 数据目录文件：除排除项以外的整个 ``data_dir``（含 ``secrets/`` 密钥、``assets/``、
  ``studio3d/``、``exports/``、``modules/interaction3d/scenes`` 等）。

``homeos.db`` 快照会**清空历史事件 / 日志 / 时序表与运行时缓存表**的数据（保留表结构），
见 :data:`EXCLUDED_DB_TABLES`：全量备份只承载「配置与实体目录」，不承载操作日志、
实体状态变化历史、通知/安防/地震事件、环境与能耗时序，以及登录会话与可自动重建的
HA 目录缓存。

排除项：``cache/``、``logs/``（含操作日志 JSONL）、``backup-work/``、``backup-recovery/``、
渲染缓存、迁移备份（``*.pre-*.bak``）、``data-compatibility.json``（还原后重新写入）与
数据库文件本身。

**为什么必须带 ``secrets/``**：HA access token 与 license 凭证用 ``data_dir/secrets/*.key``
（Fernet）加密后落库（见 :mod:`homeos.backend.src.ha.crypto`）。只备份数据库、不带密钥，
换机后这些密文无法解密。

恢复采用「整库原样还原」：先把当前数据库与数据文件留一份回退快照，再原子替换，
最后把还原出来的库迁移到当前程序 head，全程可回滚。
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
from collections.abc import Callable
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from typing import Any
from uuid import uuid4
from zipfile import ZipFile

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

from ...core.migrations import (
    compare_application_versions,
    run_migrations,
    write_data_compatibility_marker,
)
from ...security.login_limiter import LoginAttemptLimiter

logger = logging.getLogger("homeos.backup.business")

MAGIC = b"HABACKUP\x01"
MAX_ARCHIVE = 512 * 1024 * 1024
MAX_EXPANDED = 4 * 1024 * 1024 * 1024
MAX_FILES = 50_000
MAX_JSON = 128 * 1024 * 1024
JOB_TTL_SECONDS = 10 * 60

DB_NAME = "homeos.db"
DB_SIDECARS = ("-wal", "-shm", "-journal")
MANIFEST_NAME = "manifest.json"
PAYLOAD_NAME = "payload.zip"

#: 数据目录内的回退工作区（一次还原一个子目录；已被备份排除，不进包）
RECOVERY_DIR = "backup-recovery"
RECOVERY_JOURNAL = "journal.json"
RECOVERY_ASIDE = "aside"
#: 保留多少个已完成还原的回退副本（供「还原后反悔」用；超出按时间清理）
ROLLBACK_KEEP = 1

PRODUCT = "HomeOS"
KIND = "homeos-full-backup"
SCHEMA_VERSION = 2
FORMAT_VERSION = 2

#: 数据目录中不进入备份的顶层目录（运行时产物，与业务数据无关）
EXCLUDED_TOP_DIRS = frozenset({"cache", "logs", "backup-work", "backup-recovery"})
#: 需要整体排除的相对路径前缀
EXCLUDED_REL_PREFIXES = ("modules/interaction3d/render-cache",)
#: 运行时生成的标记文件：还原后由程序重新写入，避免旧标记挡住启动
EXCLUDED_REL_FILES = frozenset({"data-compatibility.json"})

#: 不进全量备份的历史 / 日志 / 时序 / 运行时缓存表：快照后清空其数据（保留表结构）。
#: 分三类——
#:   历史事件与日志：实体状态变化、安防审计、通知记录、地震预警、环境与能耗时序；
#:   运行时缓存：登录会话（还原后必须重新登录）、可随 HA 连接自动重建的实体/设备/区域目录。
EXCLUDED_DB_TABLES: tuple[str, ...] = (
    # 历史事件 / 日志 / 时序
    "event_logs",
    "security_events",
    "notifications",
    "earthquake_alert_history",
    "environment_records",
    "energy_usage_daily",
    "energy_usage_monthly",
    "device_usage_stats",
    # 运行时缓存（会话 / 可重建目录）
    "sessions",
    "ha_entities",
    "ha_devices",
    "ha_areas",
    "ha_sync_state",
)


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


def _remove_sidecars(database_path: Path) -> None:
    for suffix in DB_SIDECARS:
        Path(f"{database_path}{suffix}").unlink(missing_ok=True)


def _safe_relative(name: str) -> str | None:
    """校验 zip 内条目名为安全的相对 posix 路径（拒绝绝对路径 / 反斜杠 / ``..``）。"""
    if not isinstance(name, str) or not name or "\\" in name or "\x00" in name:
        return None
    path = PurePosixPath(name)
    if path.is_absolute() or path.as_posix() != name:
        return None
    if any(part in {"", ".", ".."} for part in path.parts):
        return None
    return name


def _is_excluded(relative: str) -> bool:
    parts = PurePosixPath(relative).parts
    if parts and parts[0] in EXCLUDED_TOP_DIRS:
        return True
    if relative in EXCLUDED_REL_FILES:
        return True
    if any(
        relative == prefix or relative.startswith(prefix + "/")
        for prefix in EXCLUDED_REL_PREFIXES
    ):
        return True
    name = parts[-1] if parts else relative
    if name == DB_NAME or name in {f"{DB_NAME}{suffix}" for suffix in DB_SIDECARS}:
        return True
    if ".pre-" in name and name.endswith(".bak"):
        return True
    return name.endswith(".migrate.lock")


def _key(password: str | bytes, salt: bytes) -> bytes:
    raw = password.encode("utf-8") if isinstance(password, str) else password
    return Scrypt(salt=salt, length=32, n=32768, r=8, p=1).derive(raw)


def encrypt_archive(source: Path, target: Path, password: str) -> None:
    salt = os.urandom(16)
    nonce = os.urandom(12)
    header = MAGIC + salt + nonce
    encryptor = Cipher(algorithms.AES(_key(password, salt)), modes.GCM(nonce)).encryptor()
    # GCM AAD = MAGIC + salt + nonce
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
        try:
            plain = _decrypt(with_aad=True)
        except Exception:
            plain = _decrypt(with_aad=False)
    except Exception as error:
        raise BackupError("备份密码不正确，或文件已损坏。") from error
    target.write_bytes(plain)


# ---------------------------------------------------------------------- #
# 数据库快照
# ---------------------------------------------------------------------- #
def _validate_database_file(path: Path) -> None:
    with closing(sqlite3.connect(f"file:{path}?mode=ro", uri=True)) as connection:
        integrity = connection.execute("PRAGMA integrity_check").fetchone()
        if integrity is None or integrity[0] != "ok":
            detail = integrity[0] if integrity else "no result"
            raise BackupError(f"数据库完整性校验失败：{detail}")
        if connection.execute("PRAGMA foreign_key_check").fetchall():
            raise BackupError("数据库外键校验失败。")


def snapshot_database(settings: Any, target: Path) -> None:
    """把当前 SQLite 库以 ``VACUUM INTO`` 快照到 ``target``（不阻塞并发读写）。"""
    source = settings.database_path
    if not source.is_file() or source.stat().st_size == 0:
        raise BackupError("数据库文件不存在，无法创建备份。")
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    target.unlink(missing_ok=True)
    connection = sqlite3.connect(source, isolation_level=None)
    try:
        connection.execute("PRAGMA busy_timeout=5000")
        connection.execute("VACUUM INTO ?", (str(target),))
    except sqlite3.Error as error:
        target.unlink(missing_ok=True)
        raise BackupError(f"生成数据库快照失败：{error}") from error
    finally:
        connection.close()
    _validate_database_file(target)


def purge_excluded_tables(path: Path) -> list[str]:
    """清空快照中历史/日志/缓存表的数据（保留表结构），并回收空间。

    只作用于备份快照副本，绝不触碰线上库；缺失的表自动跳过（兼容旧库 schema）。
    """
    purged: list[str] = []
    connection = sqlite3.connect(path, isolation_level=None)
    try:
        connection.execute("PRAGMA busy_timeout=5000")
        existing = {
            str(row[0])
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        for table in EXCLUDED_DB_TABLES:
            if table not in existing:
                continue
            connection.execute(f'DELETE FROM "{table}"')  # noqa: S608 - 表名来自常量白名单
            purged.append(table)
        connection.execute("VACUUM")
    except sqlite3.Error as error:
        raise BackupError(f"清理历史数据失败：{error}") from error
    finally:
        connection.close()
    return purged


def _database_counts(path: Path) -> dict[str, int]:
    counts = {"projects": 0, "connections": 0, "users": 0}
    with closing(sqlite3.connect(f"file:{path}?mode=ro", uri=True)) as connection:
        for key, table in (
            ("projects", "projects"),
            ("connections", "ha_connections"),
            ("users", "users"),
        ):
            try:
                row = connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()  # noqa: S608
                counts[key] = int(row[0]) if row else 0
            except sqlite3.Error:
                counts[key] = 0
    return counts


# ---------------------------------------------------------------------- #
# 创建备份
# ---------------------------------------------------------------------- #
def _data_files(settings: Any) -> list[tuple[Path, str]]:
    base = settings.data_dir
    collected: list[tuple[Path, str]] = []
    if not base.is_dir():
        return collected
    for path in sorted(base.rglob("*")):
        relative = path.relative_to(base).as_posix()
        if _is_excluded(relative):
            continue
        if path.is_symlink():
            raise BackupError(f"数据目录含符号链接，无法创建完整备份：{relative}")
        if path.is_file():
            collected.append((path, relative))
    return collected


def create_payload(settings: Any, directory: Path) -> Path:
    """构建统一载荷 zip（``manifest.json`` + ``homeos.db`` + 数据文件），返回其路径。"""
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    db_snapshot = directory / DB_NAME
    snapshot_database(settings, db_snapshot)
    purged_tables = purge_excluded_tables(db_snapshot)
    payload = directory / PAYLOAD_NAME
    files: dict[str, dict[str, Any]] = {}
    total = db_snapshot.stat().st_size
    try:
        with ZipFile(payload, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
            archive.write(db_snapshot, arcname=DB_NAME)
            for path, relative in _data_files(settings):
                size = path.stat().st_size
                total += size
                if total > MAX_EXPANDED or len(files) + 1 >= MAX_FILES:
                    raise BackupError(
                        "业务数据超过本版备份限制（展开后 4 GB、最多 50000 个文件）。"
                    )
                files[relative] = {"sha256": _hash(path), "size": size}
                archive.write(path, arcname=relative)
            manifest = {
                "kind": KIND,
                "product": PRODUCT,
                "schemaVersion": SCHEMA_VERSION,
                "formatVersion": FORMAT_VERSION,
                "version": settings.version,
                "minimumApplicationVersion": settings.version,
                "createdAt": _now_iso(),
                "database": {
                    "name": DB_NAME,
                    "sha256": _hash(db_snapshot),
                    "size": db_snapshot.stat().st_size,
                },
                "files": files,
                "excludedTables": sorted(purged_tables),
                "includesHistory": False,
                "hasSecrets": "secrets/ha_credentials.key" in files
                or any(name.startswith("secrets/") for name in files),
            }
            encoded = json.dumps(manifest, ensure_ascii=False, separators=(",", ":")).encode(
                "utf-8"
            )
            if len(encoded) > MAX_JSON:
                raise BackupError("备份清单过大。")
            archive.writestr(MANIFEST_NAME, encoded)
    finally:
        db_snapshot.unlink(missing_ok=True)
    return payload


def create_archive(settings: Any, directory: Path, password: str) -> Path:
    """创建加密全量备份（``.habackup``），供手动下载。"""
    if not (8 <= len(password) <= 128):
        raise BackupError("备份密码长度须为 8–128 个字符。")
    payload = create_payload(settings, directory)
    if payload.stat().st_size > MAX_ARCHIVE - 64:
        raise BackupError("生成的备份超过 512 MB，请先清理不需要的业务素材。")
    result = directory / "backup.habackup"
    encrypt_archive(payload, result, password)
    payload.unlink(missing_ok=True)
    return result


def create_plain_archive(settings: Any, directory: Path, filename: str) -> Path:
    """创建明文全量备份包（zip），供服务器本地自动备份落盘。"""
    payload = create_payload(settings, directory)
    target = directory / filename
    payload.replace(target)
    return target


# ---------------------------------------------------------------------- #
# 检查 / 预览
# ---------------------------------------------------------------------- #
def stage_payload(source: Path, directory: Path, password: str | None) -> Path:
    """把上传的加密包或明文 zip 统一落成 ``directory/payload.zip``。"""
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    payload = directory / PAYLOAD_NAME
    with source.open("rb") as reader:
        head = reader.read(len(MAGIC))
    if head.startswith(MAGIC):
        if not password:
            raise BackupError("该备份已加密，请提供备份密码。")
        decrypt_archive(source, payload, password)
    elif head[:2] == b"PK":
        shutil.copyfile(source, payload)
    else:
        raise BackupError("不是有效的 HomeOS 备份文件。")
    return payload


def _verify_archive(archive: ZipFile, manifest: dict[str, Any]) -> None:
    names = set(archive.namelist())

    def _check(relative: str, meta: Any) -> None:
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
            return
        digest = hashlib.sha256()
        with archive.open(relative) as reader:
            while True:
                chunk = reader.read(1024 * 1024)
                if not chunk:
                    break
                digest.update(chunk)
        if digest.hexdigest() != expected_hash:
            raise BackupError(f"备份文件摘要与清单不符：{relative}")

    database = manifest.get("database")
    if isinstance(database, dict) and database.get("name"):
        _check(str(database["name"]), database)
    for relative, meta in (manifest.get("files") or {}).items():
        if _safe_relative(relative) is None:
            raise BackupError("备份清单含非法路径。")
        _check(relative, meta)


def read_manifest(payload: Path) -> dict[str, Any]:
    """读取并校验 zip 内 ``manifest.json`` 与文件清单。"""
    with ZipFile(payload, "r") as archive:
        names = set(archive.namelist())
        if MANIFEST_NAME not in names:
            raise BackupError("备份内容缺少 manifest.json。")
        encoded = archive.read(MANIFEST_NAME)
        if len(encoded) > MAX_JSON:
            raise BackupError("备份元数据过大。")
        manifest = json.loads(encoded.decode("utf-8"))
        if not isinstance(manifest, dict):
            raise BackupError("备份元数据无效。")
        if DB_NAME not in names:
            raise BackupError("备份缺少数据库快照。")
        _verify_archive(archive, manifest)
    return manifest


def inspect_payload(settings: Any, directory: Path) -> dict[str, Any]:
    """校验已落地的载荷并返回预览信息（不改动任何现有数据）。"""
    payload = directory / PAYLOAD_NAME
    if not payload.is_file():
        raise BackupError("备份内容缺失。")
    if payload.stat().st_size > MAX_ARCHIVE:
        raise BackupError("备份文件超过 512 MB 上限。")
    manifest = read_manifest(payload)
    (directory / MANIFEST_NAME).write_bytes(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    )
    validate_full_backup(settings, manifest)

    stats_path = directory / f"inspect-{uuid4().hex}.db"
    try:
        with ZipFile(payload, "r") as archive, archive.open(DB_NAME) as source, stats_path.open("wb") as target:
            shutil.copyfileobj(source, target)
        _validate_database_file(stats_path)
        counts = _database_counts(stats_path)
    finally:
        stats_path.unlink(missing_ok=True)

    database = manifest.get("database") or {}
    files = manifest.get("files") or {}
    return {
        "kind": manifest.get("kind") or KIND,
        "product": manifest.get("product") or PRODUCT,
        "version": manifest.get("version") or "",
        "minimumApplicationVersion": manifest.get("minimumApplicationVersion")
        or manifest.get("version")
        or "",
        "createdAt": manifest.get("createdAt") or "",
        "projects": counts["projects"],
        "connections": counts["connections"],
        "users": counts["users"],
        "files": len(files),
        "databaseSize": int(database.get("size") or 0),
        "hasSecrets": bool(manifest.get("hasSecrets")),
        "includesHistory": bool(manifest.get("includesHistory", True)),
        "excludedTables": len(manifest.get("excludedTables") or []),
        "expiresIn": JOB_TTL_SECONDS,
    }


def inspect_archive(settings: Any, directory: Path, password: str) -> dict[str, Any]:
    """解密并检查上传的 ``upload.habackup``，返回预览信息。"""
    upload = directory / "upload.habackup"
    if not upload.is_file():
        raise BackupError("请选择备份文件。")
    stage_payload(upload, directory, password)
    return inspect_payload(settings, directory)


def validate_full_backup(settings: Any, value: dict[str, Any]) -> None:
    if not isinstance(value, dict):
        raise BackupError("备份元数据无效。")
    kind = value.get("kind")
    if kind not in {KIND, None} and not str(kind).endswith("full-backup"):
        raise BackupError("不是 HomeOS 全量备份包。")
    format_version = int(value.get("formatVersion") or 0)
    if format_version and format_version > FORMAT_VERSION:
        raise BackupError(
            f"备份格式版本 {format_version} 高于当前程序支持的 {FORMAT_VERSION}，请先升级程序。"
        )
    schema = int(value.get("schemaVersion") or 0)
    if schema > SCHEMA_VERSION:
        raise BackupError(
            f"备份格式版本 {schema} 高于当前程序支持的 {SCHEMA_VERSION}，请先升级程序。"
        )
    minimum = str(
        value.get("minimumApplicationVersion") or value.get("version") or ""
    ).strip()
    if minimum and compare_application_versions(settings.version, minimum) < 0:
        raise BackupError(
            f"此备份要求程序版本 ≥ {minimum}，当前为 {settings.version}。请升级后再恢复。"
        )
    database = value.get("database")
    if not isinstance(database, dict) or not database.get("name"):
        raise BackupError("备份缺少数据库快照。")


# ---------------------------------------------------------------------- #
# 恢复（整库原样还原 + 数据文件替换）
# ---------------------------------------------------------------------- #
def _recovery_root(settings: Any) -> Path:
    return settings.data_dir / RECOVERY_DIR


def _write_journal(rollback_dir: Path, journal: dict[str, Any]) -> None:
    (rollback_dir / RECOVERY_JOURNAL).write_text(
        json.dumps(journal, ensure_ascii=False), encoding="utf-8"
    )


def _extract_data_files(archive: ZipFile, extract_root: Path) -> None:
    for info in archive.infolist():
        name = info.filename
        if name.endswith("/") or name in {DB_NAME, MANIFEST_NAME}:
            continue
        if _safe_relative(name) is None:
            raise BackupError("备份含非法路径，已中止恢复。")
        target = extract_root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(info) as source, target.open("wb") as destination:
            shutil.copyfileobj(source, destination)


def _restore_data_files(
    settings: Any,
    payload: Path,
    directory: Path,
    rollback_dir: Path,
    journal: dict[str, Any],
) -> None:
    extract_root = directory / "extracted"
    if extract_root.exists():
        shutil.rmtree(extract_root)
    extract_root.mkdir(parents=True, exist_ok=True)
    with ZipFile(payload, "r") as archive:
        _extract_data_files(archive, extract_root)

    created: list[str] = journal.setdefault("created", [])
    moved: dict[str, str] = journal.setdefault("moved", {})
    aside = rollback_dir / RECOVERY_ASIDE
    for source in sorted(extract_root.iterdir()):
        top = source.name
        if top in {DB_NAME, MANIFEST_NAME}:
            continue
        target = settings.data_dir / top
        # 先落盘「回退意图」再动文件：即使中途崩溃，启动期回滚也能据此还原。
        if target.exists() or target.is_symlink():
            stored = aside / top
            _remove_path(stored)
            moved[top] = str(stored)
            _write_journal(rollback_dir, journal)
            aside.mkdir(parents=True, exist_ok=True)
            shutil.move(str(target), str(stored))
        else:
            created.append(top)
            _write_journal(rollback_dir, journal)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(target))
        _sync_directory(target.parent)
    _write_journal(rollback_dir, journal)


def _remove_path(path: Path) -> None:
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path, ignore_errors=True)
    elif path.exists() or path.is_symlink():
        path.unlink(missing_ok=True)


def _rollback_restore(
    settings: Any,
    rollback_dir: Path,
    journal: dict[str, Any],
    dispose: Callable[[], None] | None,
) -> None:
    """把本次还原新建的数据文件删除，并把移出副本与数据库快照搬回原位。"""
    for top in journal.get("created", []):
        _remove_path(settings.data_dir / top)
    for top, stored in (journal.get("moved") or {}).items():
        stored_path = Path(str(stored))
        if not stored_path.exists():
            continue
        target = settings.data_dir / top
        _remove_path(target)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(stored_path), str(target))
        _sync_directory(target.parent)
    if journal.get("dbReplaced"):
        snapshot = rollback_dir / DB_NAME
        if snapshot.is_file():
            if dispose is not None:
                try:
                    dispose()
                except Exception:
                    logger.warning("释放数据库连接池失败", exc_info=True)
            _remove_sidecars(settings.database_path)
            os.replace(str(snapshot), str(settings.database_path))
            os.chmod(settings.database_path, 0o600)


def restore_business(
    settings: Any,
    directory: Path,
    *,
    dispose: Callable[[], None] | None = None,
) -> dict[str, Any]:
    """把 ``directory/payload.zip`` 整体还原到当前数据目录，全程可回滚。

    回退材料（还原前的数据库快照 + 被替换掉的顶层数据目录项）统一放在
    ``data_dir/backup-recovery/<id>/``。成功时保留该目录作为「还原后反悔」副本
    （由 :meth:`BackupCoordinator.prune_rollbacks` 限量），失败时自动回滚并清掉。
    """
    payload = directory / PAYLOAD_NAME
    manifest = read_manifest(payload)
    validate_full_backup(settings, manifest)

    recovery = _recovery_root(settings)
    recovery.mkdir(parents=True, exist_ok=True, mode=0o700)
    identifier = uuid4().hex
    rollback_dir = recovery / identifier
    rollback_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    journal: dict[str, Any] = {
        "id": identifier,
        "phase": "snapshot",
        "startedAt": _now_iso(),
        "moved": {},
        "created": [],
        "dbReplaced": False,
    }
    _write_journal(rollback_dir, journal)
    try:
        # 1) 当前数据库回退快照
        snapshot_database(settings, rollback_dir / DB_NAME)
        journal["phase"] = "files"
        _write_journal(rollback_dir, journal)

        # 2) 数据文件（不含数据库）替换
        _restore_data_files(settings, payload, directory, rollback_dir, journal)
        journal["phase"] = "database"
        _write_journal(rollback_dir, journal)

        # 3) 数据库原子替换
        restored_db = directory / "restored.db"
        restored_db.unlink(missing_ok=True)
        with (
            ZipFile(payload, "r") as archive,
            archive.open(DB_NAME) as source,
            restored_db.open("wb") as destination,
        ):
            shutil.copyfileobj(source, destination)
        _validate_database_file(restored_db)
        os.chmod(restored_db, 0o600)
        if dispose is not None:
            try:
                dispose()
            except Exception:
                logger.warning("释放数据库连接池失败", exc_info=True)
        _remove_sidecars(settings.database_path)
        os.replace(restored_db, settings.database_path)
        os.chmod(settings.database_path, 0o600)
        journal["dbReplaced"] = True
        _write_journal(rollback_dir, journal)

        # 4) 迁移到当前程序 head + 写数据兼容标记
        run_migrations(settings)
        write_data_compatibility_marker(settings)

        journal["phase"] = "done"
        journal["finishedAt"] = _now_iso()
        _write_journal(rollback_dir, journal)
        return {"ok": True, "restored": True, "rollback": str(rollback_dir)}
    except Exception:
        try:
            _rollback_restore(settings, rollback_dir, journal, dispose)
            shutil.rmtree(rollback_dir, ignore_errors=True)
        except Exception:
            logger.exception("全量恢复失败后的自动回滚未完成")
        raise


def recover_interrupted_restore(settings: Any) -> bool:
    """启动期检测未完成的恢复并回滚；回滚失败返回 True（需人工介入）。"""
    root = _recovery_root(settings)
    if not root.is_dir():
        return False
    failed = False
    for rollback_dir in sorted(path for path in root.iterdir() if path.is_dir()):
        journal_path = rollback_dir / RECOVERY_JOURNAL
        if not journal_path.is_file():
            shutil.rmtree(rollback_dir, ignore_errors=True)
            continue
        try:
            journal = json.loads(journal_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            shutil.rmtree(rollback_dir, ignore_errors=True)
            continue
        phase = journal.get("phase")
        if phase == "done":
            continue
        try:
            _rollback_restore(settings, rollback_dir, journal, None)
            shutil.rmtree(rollback_dir, ignore_errors=True)
            logger.warning("未完成的全量恢复已自动回滚（phase=%s）。", phase)
        except Exception:
            failed = True
            logger.exception("检测到未完成的全量恢复（phase=%s），自动回滚失败。", phase)
    return failed


async def refresh_runtime_after_restore(app: Any) -> None:
    """整库还原后重建内存态：系统配置、素材目录与 HA 连接。

    数据库被整体替换后，进程内缓存（``AppConfigService._config``、素材目录、HA 连接）
    仍是旧值，必须重建；登录会话已在快照中清空，管理员需重新登录。
    """
    app_config = getattr(app.state, "app_config", None)
    reload_config = getattr(app_config, "reload_from_db", None)
    if callable(reload_config):
        try:
            reload_config()
        except Exception:
            logger.warning("还原后重载系统配置失败", exc_info=True)

    catalog = getattr(app.state, "asset_catalog", None)
    if catalog is not None and hasattr(catalog, "reload_user"):
        try:
            catalog.reload_user()
        except Exception:
            logger.warning("还原后重载素材目录失败", exc_info=True)

    connector = getattr(app.state, "ha_connector", None)
    restart = getattr(connector, "restart", None)
    if callable(restart):
        try:
            await restart()
        except Exception:
            logger.warning("还原后重连 Home Assistant 失败", exc_info=True)


async def durable_work(function: Any, *args: Any) -> Any:
    return await asyncio.to_thread(function, *args)


class BackupCoordinator:
    """业务备份会话协调器：票据、限流、维护标记与启动期清理。"""

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
            shutil.rmtree(work, ignore_errors=True)
        if recover_interrupted_restore(settings):
            self.recovery_required = True
        self.prune_rollbacks()

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

    def prune_rollbacks(self, keep: int = ROLLBACK_KEEP) -> None:
        """只保留最近若干个**已完成**的还原回退副本，避免磁盘无限增长。"""
        recovery = _recovery_root(self.app.state.settings)
        if not recovery.is_dir():
            return
        finished = []
        for path in recovery.iterdir():
            if not path.is_dir():
                continue
            if not (path / RECOVERY_JOURNAL).is_file():
                shutil.rmtree(path, ignore_errors=True)
                continue
            finished.append(path)
        finished.sort(key=lambda path: path.stat().st_mtime, reverse=True)
        for stale in finished[max(0, keep):]:
            shutil.rmtree(stale, ignore_errors=True)


__all__ = [
    "EXCLUDED_DB_TABLES",
    "JOB_TTL_SECONDS",
    "KIND",
    "MAX_ARCHIVE",
    "BackupCoordinator",
    "BackupError",
    "create_archive",
    "create_payload",
    "create_plain_archive",
    "decrypt_archive",
    "durable_work",
    "inspect_archive",
    "inspect_payload",
    "purge_excluded_tables",
    "read_manifest",
    "recover_interrupted_restore",
    "refresh_runtime_after_restore",
    "restore_business",
    "snapshot_database",
    "stage_payload",
]
