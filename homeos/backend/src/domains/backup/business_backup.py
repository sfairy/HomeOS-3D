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
备份包目录（``settings.backups_dir``；容器里位于 ``data_dir`` 内部，必须排除，否则新包会
吞掉全部旧包与自己）、渲染缓存与数据库文件本身。

**为什么必须带 ``secrets/``**：HA access token 与 license 凭证用 ``data_dir/secrets/*.key``
（Fernet）加密后落库（见 :mod:`src.domains.ha.integration.crypto`）。只备份数据库、不带密钥，
换机后这些密文无法解密。

恢复采用「整库原样还原」：先把当前数据库与数据文件留一份回退快照，再原子替换，
最后校验还原出来的库结构与完整性，全程可回滚。
"""

from __future__ import annotations

import asyncio
import hashlib
import inspect
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

from ...platform.core.schema import prepare_schema
from ...platform.core.upload_limits import MAX_BACKUP_ARCHIVE_BYTES
from ...platform.security.login_limiter import LoginAttemptLimiter

logger = logging.getLogger("homeos.backup.business")

MAGIC = b"HABACKUP\x01"
#: 归档本体上限（与 ``platform.core.upload_limits.MAX_BACKUP_ARCHIVE_BYTES`` 同源）：
#: 请求体门禁按同一数字放行 ``/backups/inspect``，否则这里连同它的报错文案都够不着。
MAX_ARCHIVE = MAX_BACKUP_ARCHIVE_BYTES
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
FORMAT_VERSION = 2

#: 数据目录中不进入备份的顶层目录（运行时产物，与业务数据无关）
EXCLUDED_TOP_DIRS = frozenset({"cache", "logs", "backup-work", "backup-recovery"})
#: 需要整体排除的相对路径前缀
EXCLUDED_REL_PREFIXES = ("modules/interaction3d/render-cache",)

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
    if any(
        relative == prefix or relative.startswith(prefix + "/")
        for prefix in EXCLUDED_REL_PREFIXES
    ):
        return True
    name = parts[-1] if parts else relative
    return name == DB_NAME or name in {f"{DB_NAME}{suffix}" for suffix in DB_SIDECARS}


def _resolved(path: Any) -> Path | None:
    if path is None:
        return None
    try:
        return Path(path).resolve()
    except OSError:
        return None


def _backups_prefix_in_data_dir(settings: Any) -> str | None:
    """备份包目录落在 ``data_dir`` **内部**时，返回它在数据目录下的相对前缀；否则 ``None``。

    容器里 ``HOMEOS_BACKUPS_DIR=/data/backups`` 就在数据卷内，所以这个前缀通常非空 ——
    收集数据文件时必须排除它，否则新备份包会把所有旧备份包连同正在写入的自己一起装进去。
    """
    base = _resolved(getattr(settings, "data_dir", None))
    backups = _resolved(getattr(settings, "backups_dir", None))
    if base is None or backups is None:
        return None
    try:
        relative = backups.relative_to(base)
    except ValueError:
        return None
    prefix = relative.as_posix()
    return None if prefix in {"", "."} else prefix


def _overlaps_backups_dir(settings: Any, target: Path) -> bool:
    """``target`` 与备份包目录是否重叠（同一路径、或互为祖先/后代）。

    恢复数据文件时用它拦下归档里的备份目录条目：既不能让恢复把当前备份目录整块挪走
    （那正是恢复工作目录所在处），也不能用归档里的旧备份覆盖当前备份历史。
    """
    backups = _resolved(getattr(settings, "backups_dir", None))
    candidate = _resolved(target)
    if backups is None or candidate is None:
        return False
    return (
        candidate == backups
        or candidate in backups.parents
        or backups in candidate.parents
    )


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


# 数据库快照
def _validate_database_file(path: Path) -> None:
    """整库快照校验：完整性、外键与必需业务表。"""
    required = _required_tables()
    with closing(sqlite3.connect(f"file:{path}?mode=ro", uri=True)) as connection:
        integrity = connection.execute("PRAGMA integrity_check").fetchone()
        if integrity is None or integrity[0] != "ok":
            detail = integrity[0] if integrity else "no result"
            raise BackupError(f"数据库完整性校验失败：{detail}")
        if connection.execute("PRAGMA foreign_key_check").fetchall():
            raise BackupError("数据库外键校验失败。")
        live = {
            str(row[0])
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
    missing = sorted(required - live)
    if missing:
        raise BackupError(f"数据库缺少业务表：{', '.join(missing)}")


def _required_tables() -> set[str]:
    from ...platform.core import models  # noqa: F401  # 注册模型到 Base.metadata
    from ...platform.core.database import Base

    return set(Base.metadata.tables)


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

    只作用于备份快照副本，绝不触碰线上库；缺失的表跳过。
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


# 创建备份
def _data_files(settings: Any) -> list[tuple[Path, str]]:
    base = settings.data_dir
    collected: list[tuple[Path, str]] = []
    if not base.is_dir():
        return collected
    backups_prefix = _backups_prefix_in_data_dir(settings)
    for path in sorted(base.rglob("*")):
        relative = path.relative_to(base).as_posix()
        if _is_excluded(relative):
            continue
        # 备份包目录可能就在 data_dir 内（容器即如此）：不排除的话，新包会把所有旧备份
        # 连同「正在写入的自己」一起装进去 —— 体积逐次翻倍，磁盘最满时备份功能先死，
        # 而且包里多出的顶层 ``backups/`` 会让恢复把当前备份目录整块挪走。
        if backups_prefix and (
            relative == backups_prefix or relative.startswith(backups_prefix + "/")
        ):
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
                "formatVersion": FORMAT_VERSION,
                "version": settings.version,
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


# 检查 / 预览
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
        if not isinstance(meta, dict):
            raise BackupError(f"备份清单条目无效：{relative}")
        # 大小与摘要都必须存在：缺字段就静默跳过校验，会让「清单里只写个名字」的空文件
        # 通过全部校验 —— 对数据库条目而言，等于把整库换成空库后照报成功。
        #
        # ⚠ 这里**必须**判 None / 类型，不能写 ``int(meta.get("size") or -1)``：
        # ``0`` 是合法值（空文件），而 ``or`` 会把 0 一并折成 -1，于是「数据目录里只要
        # 有一个 0 字节文件（.lock / 空占位），整包备份就永远恢复不了」—— 自己导出的包
        # 自己读不回来，报的还是「缺少文件大小」这种与 0 字节毫无关系的文案。
        raw_size = meta.get("size")
        if isinstance(raw_size, bool) or not isinstance(raw_size, (int, float)):
            raise BackupError(f"备份清单缺少文件大小：{relative}")
        expected_size = int(raw_size)
        if expected_size < 0:
            raise BackupError(f"备份清单缺少文件大小：{relative}")
        info = archive.getinfo(relative)
        if info.file_size != expected_size:
            raise BackupError(f"备份文件大小与清单不符：{relative}")
        expected_hash = str(meta.get("sha256") or "").lower()
        if not expected_hash:
            raise BackupError(f"备份清单缺少文件摘要：{relative}")
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
    validate_full_backup(manifest)

    stats_path = directory / f"inspect-{uuid4().hex}.db"
    try:
        with ZipFile(payload, "r") as archive, archive.open(DB_NAME) as source, stats_path.open("wb") as target:
            _copy_bounded(source, target, limit=MAX_EXPANDED, what="数据库快照")
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


def validate_full_backup(value: dict[str, Any]) -> None:
    if not isinstance(value, dict):
        raise BackupError("备份元数据无效。")
    kind = value.get("kind")
    if kind != KIND:
        raise BackupError("不是 HomeOS 全量备份包。")
    format_version = int(value.get("formatVersion") or 0)
    if format_version > FORMAT_VERSION:
        raise BackupError(
            f"备份格式版本 {format_version} 高于当前程序支持的 {FORMAT_VERSION}，请先升级程序。"
        )
    database = value.get("database")
    if not isinstance(database, dict) or not database.get("name"):
        raise BackupError("备份缺少数据库快照。")


# 恢复（整库原样还原 + 数据文件替换）
def _recovery_root(settings: Any) -> Path:
    return settings.data_dir / RECOVERY_DIR


def _write_journal(rollback_dir: Path, journal: dict[str, Any]) -> None:
    (rollback_dir / RECOVERY_JOURNAL).write_text(
        json.dumps(journal, ensure_ascii=False), encoding="utf-8"
    )


def _copy_bounded(source: Any, destination: Any, *, limit: int, what: str) -> int:
    """按块把 zip 条目写到目标，**实际写出的字节数**超过 ``limit`` 即中止，返回总字节数。

    `ZipInfo.file_size` 是压缩包头里的自述值，可以撒谎；`shutil.copyfileobj` 又是无上限的，
    所以解包侧必须自己数一遍 —— 否则一个几十 KB 的 zip bomb 就能在恢复/预览时把磁盘写满。
    """
    total = 0
    while True:
        chunk = source.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise BackupError(f"{what}展开后超过上限（{limit // (1024 * 1024)} MB），已中止。")
        destination.write(chunk)
    return total


def _extract_data_files(
    archive: ZipFile, extract_root: Path, allowed: set[str]
) -> None:
    """把归档里的数据文件解到 ``extract_root``，并在此**重新**校验规模上限与清单成员。

    写入侧（``create_payload``）有 4 GB / 50000 文件的上限，但那只约束「我们自己造包时」；
    恢复入口接受外部上传的 zip，条目数与解压后体积都由上传方说了算，所以这里必须再数一遍。

    ``allowed`` 是清单里列出的数据文件集合：**只有**清单成员才允许落盘。只遍历归档条目
    而不比对清单，任何未列出的成员（例如 ``secrets/ha_credentials.key``）都能被原样写进
    数据目录，且没有任何大小 / 摘要校验。
    """
    total = 0
    count = 0
    for info in archive.infolist():
        name = info.filename
        if name.endswith("/") or name in {DB_NAME, MANIFEST_NAME}:
            continue
        if _safe_relative(name) is None:
            raise BackupError("备份含非法路径，已中止恢复。")
        if name not in allowed:
            raise BackupError(f"备份含清单未列出的文件，已中止恢复：{name}")
        count += 1
        if count > MAX_FILES:
            raise BackupError(f"备份条目数超过上限（{MAX_FILES} 个），已中止恢复。")
        target = extract_root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(info) as source, target.open("wb") as destination:
            total += _copy_bounded(source, destination, limit=MAX_EXPANDED - total, what="备份数据")



def _restore_data_files(
    settings: Any,
    payload: Path,
    directory: Path,
    rollback_dir: Path,
    journal: dict[str, Any],
    manifest: dict[str, Any],
) -> None:
    extract_root = directory / "extracted"
    if extract_root.exists():
        shutil.rmtree(extract_root)
    extract_root.mkdir(parents=True, exist_ok=True)
    with ZipFile(payload, "r") as archive:
        _extract_data_files(
            archive, extract_root, set((manifest.get("files") or {}).keys())
        )

    created: list[str] = journal.setdefault("created", [])
    moved: dict[str, str] = journal.setdefault("moved", {})
    aside = rollback_dir / RECOVERY_ASIDE
    for source in sorted(extract_root.iterdir()):
        top = source.name
        if top in {DB_NAME, MANIFEST_NAME}:
            continue
        target = settings.data_dir / top
        # 归档里的备份目录条目一律跳过：挪走它等于把恢复自己的工作目录挪走，而用归档里的
        # 旧备份覆盖当前备份历史同样是错的。
        if _overlaps_backups_dir(settings, target):
            logger.warning("备份包内含备份目录条目，已跳过：%s", top)
            continue
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
    validate_full_backup(manifest)

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
        _restore_data_files(settings, payload, directory, rollback_dir, journal, manifest)
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
            _copy_bounded(source, destination, limit=MAX_EXPANDED, what="数据库快照")
        _validate_database_file(restored_db)
        os.chmod(restored_db, 0o600)
        if dispose is not None:
            try:
                dispose()
            except Exception:
                logger.warning("释放数据库连接池失败", exc_info=True)
        _remove_sidecars(settings.database_path)
        journal["dbReplaced"] = True
        _write_journal(rollback_dir, journal)
        os.replace(restored_db, settings.database_path)
        os.chmod(settings.database_path, 0o600)

        # 4) 补齐缺失的表并校验结构与完整性
        prepare_schema(settings)

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
            logger.warning(
                "检测到上次全量恢复未完成，已自动回滚到恢复前状态（中断阶段：%s）", phase
            )
        except Exception:
            failed = True
            logger.exception(
                "检测到未完成的全量恢复，自动回滚失败（中断阶段：%s），请检查数据目录", phase
            )
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
            # 内置目录也要重扫：还原可能换掉了 built_in_assets_dir 背后的内容，而
            # 单向 latch 会让旧目录一直生效（新增不出现、已删的仍解析得到）。
            reload_builtin = getattr(catalog, "reload_builtin", None)
            if callable(reload_builtin):
                reload_builtin()
        except Exception:
            logger.warning("还原后重载素材目录失败", exc_info=True)

    connector = getattr(app.state, "ha_connector", None)
    restart = getattr(connector, "restart", None)
    if inspect.iscoroutinefunction(restart):
        try:
            await restart()
        except Exception:
            logger.warning("还原后重连 Home Assistant 失败", exc_info=True)


async def durable_work(function: Any, *args: Any, **kwargs: Any) -> Any:
    return await asyncio.to_thread(function, *args, **kwargs)


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

    async def run_exclusive(self, function: Any, *args: Any, **kwargs: Any) -> Any:
        """串行执行备份 / 恢复类作业（本进程内的唯一串行点）。

        备份与恢复读写的都是同一份数据库与数据目录：定时备份若与手动恢复并发，备份可能
        采到「数据库已换、数据文件只挪了一半」的中间态，产出一个自相矛盾、事后无法恢复
        的包；反过来备份期间恢复也会读到正在写入的产物。``_lock`` 过去只被创建、从未被
        使用，这里把它用起来。作业本身在 worker 线程里跑，别卡住事件循环。
        """
        async with self._lock:
            return await durable_work(function, *args, **kwargs)

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
        """只保留最近若干个**已完成**的还原回退副本，避免磁盘无限增长。

        判据必须是 journal 里的 ``phase == "done"``：只要目录存在就等于「已完成」的话，
        一次回滚失败（例如 os.replace 因权限/ENOSPC 失败）留下的目录会在下一行被删掉，
        而它正是还原前数据库快照的唯一副本 —— 那之后备份接口只会一直 503，材料却没了。
        """
        recovery = _recovery_root(self.app.state.settings)
        if not recovery.is_dir():
            return
        finished = []
        for path in recovery.iterdir():
            if not path.is_dir():
                continue
            journal_path = path / RECOVERY_JOURNAL
            if not journal_path.is_file():
                shutil.rmtree(path, ignore_errors=True)
                continue
            try:
                journal = json.loads(journal_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                logger.warning("还原回退目录的 journal 无法解析，已保留：%s", path.name)
                continue
            if not isinstance(journal, dict) or journal.get("phase") != "done":
                logger.warning("保留未完成的还原回退目录（尚未回滚）：%s", path.name)
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
