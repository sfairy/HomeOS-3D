"""服务器全量备份包文件管理（手动 + 定时自动备份共用）。

负责统一全量备份包（含数据库）在服务器 ``backups/`` 目录中的生成、列出、下载、还原与删除。
全部为纯手动 / 定时文件级操作，包体为明文 zip（服务器本地已明文存有数据库与密钥）。

关键策略：
- 备份包写入仓库根 ``backups/`` 目录，文件名 ``homeos-full-<时间戳>.zip``；
- 复用 :mod:`business_backup` 的 ``create_plain_archive`` / ``stage_payload`` / ``restore_business``；
- 还原时校验文件名格式与白名单，防止目录穿越。
"""

from __future__ import annotations

import logging
import re
import shutil
import tempfile
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from .business_backup import create_plain_archive, restore_business, stage_payload
from ...platform.core.errors import api_error, bad_request, not_found

logger = logging.getLogger("homeos.backup.server")

BACKUP_DIR = "backups"
BUNDLE_NAME_RE = re.compile(r"^homeos-full-.+\.zip$", re.IGNORECASE)

#: 运行目录为后端子目录时，仓库根为其父目录
_BACKEND_DIR_NAMES = {"backend"}


class ServerBackupService:
    """服务器全量备份包文件管理。"""

    def __init__(self, settings: Any) -> None:
        self._settings = settings

    # ------------------------------------------------------------------ #
    # 生成 / 列出
    # ------------------------------------------------------------------ #
    def create_backup(self) -> dict[str, str]:
        directory = self._resolve_backup_dir()
        directory.mkdir(parents=True, exist_ok=True)
        name = self._next_bundle_name()
        work = directory / f".work-{uuid4().hex}"
        try:
            built = create_plain_archive(self._settings, work, name)
            final = directory / name
            shutil.move(str(built), str(final))
        finally:
            shutil.rmtree(work, ignore_errors=True)
        logger.info("全量备份包已写入 %s", final)
        return {"file": str(final), "name": name}

    def list_files(self) -> list[dict[str, Any]]:
        directory = self._resolve_backup_dir()
        entries: list[dict[str, Any]] = []
        try:
            directory.mkdir(parents=True, exist_ok=True)
            for child in directory.iterdir():
                if not child.is_file() or not BUNDLE_NAME_RE.match(child.name):
                    continue
                try:
                    st = child.stat()
                except OSError:
                    continue  # 跳过不可读项
                entries.append(
                    {
                        "name": child.name,
                        "size": st.st_size,
                        "mtime": datetime.fromtimestamp(st.st_mtime, UTC)
                        .isoformat(timespec="milliseconds")
                        .replace("+00:00", "Z"),
                        "path": str(child),
                    }
                )
        except OSError as err:
            logger.warning("列出备份文件失败: %s", err)
            return []
        return sorted(entries, key=lambda item: item["mtime"], reverse=True)

    # ------------------------------------------------------------------ #
    # 下载 / 删除 / 还原
    # ------------------------------------------------------------------ #
    def resolve_file_path(self, raw_name: str) -> Path:
        name = self.assert_safe_bundle_name(raw_name)
        full = self._resolve_backup_dir() / name
        if not full.is_file():
            not_found(api_error("BACKUP_FILE_NOT_FOUND"))
        return full

    def delete_file(self, raw_name: str) -> dict[str, str]:
        name = self.assert_safe_bundle_name(raw_name)
        full = self._resolve_backup_dir() / name
        try:
            full.unlink()
        except FileNotFoundError:
            not_found(api_error("BACKUP_FILE_NOT_FOUND"))
        logger.info("已删除备份包 %s", name)
        return {"deleted": name}

    def restore_file(
        self,
        raw_name: str,
        opts: dict[str, Any] | None = None,
        *,
        dispose: Callable[[], None] | None = None,
    ) -> dict[str, Any]:
        options = opts or {}
        if options.get("confirm") is not True:
            bad_request(api_error("BACKUP_CONFIRM_REQUIRED"))
        full = self.resolve_file_path(raw_name)
        work = Path(tempfile.mkdtemp(prefix="server-restore-", dir=str(self._resolve_backup_dir())))
        try:
            stage_payload(full, work, None)
            return restore_business(self._settings, work, dispose=dispose)
        finally:
            shutil.rmtree(work, ignore_errors=True)

    # ------------------------------------------------------------------ #
    # 内部工具
    # ------------------------------------------------------------------ #
    def _next_bundle_name(self) -> str:
        stamp = (
            datetime.now(UTC)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z")
            .replace(":", "-")
            .replace(".", "-")
        )
        return f"homeos-full-{stamp}.zip"

    def assert_safe_bundle_name(self, raw_name: str) -> str:
        name = Path(str(raw_name or "").strip()).name
        if not BUNDLE_NAME_RE.match(name) or ".." in name:
            bad_request(api_error("BACKUP_FILE_INVALID_NAME"))
        return name

    def _resolve_backup_dir(self) -> Path:
        # 显式覆盖优先（容器里由 HOMEOS_BACKUPS_DIR 指到数据卷）；否则沿用 Nest 约定：
        # 运行目录为后端子目录时取仓库根，其余取当前目录，再拼 ``backups/``。
        override = getattr(self._settings, "backups_dir_override", None)
        if override is not None:
            return Path(override)
        cwd = Path.cwd()
        base = cwd.parent if cwd.name in _BACKEND_DIR_NAMES else cwd
        return base / BACKUP_DIR


__all__ = ["BACKUP_DIR", "BUNDLE_NAME_RE", "ServerBackupService"]
