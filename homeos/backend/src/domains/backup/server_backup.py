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
from ...config import BACKUP_DIR_NAME
from ...platform.core.errors import api_error, bad_request, not_found

logger = logging.getLogger("homeos.backup.server")

BACKUP_DIR = BACKUP_DIR_NAME
#: 手动备份包名前缀；自动备份用 ``homeos-auto-`` 以便按来源清理
BUNDLE_PREFIX = "homeos-full-"
BUNDLE_AUTO_PREFIX = "homeos-auto-"
BUNDLE_NAME_RE = re.compile(r"^homeos-(?:full|auto)-.+\.zip$", re.IGNORECASE)


class ServerBackupService:
    """服务器全量备份包文件管理。"""

    def __init__(self, settings: Any) -> None:
        self._settings = settings

    # 生成 / 列出
    def create_backup(self, origin: str = "manual") -> dict[str, str]:
        directory = self._resolve_backup_dir()
        directory.mkdir(parents=True, exist_ok=True)
        name = self._next_bundle_name(origin)
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
                        "origin": self._origin_of(child.name),
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

    # 下载 / 删除 / 还原
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
        # 恢复工作目录必须落在 data_dir **之外**：恢复过程会把数据目录里的顶层条目逐个
        # 挪到一边，若工作目录正好在 data_dir 内（旧实现放在备份目录里），它会亲手把
        # 自己挪走，后续步骤随即失败。系统临时目录不属于任何被替换的路径。
        work = Path(tempfile.mkdtemp(prefix="homeos-restore-"))
        try:
            stage_payload(full, work, None)
            return restore_business(self._settings, work, dispose=dispose)
        finally:
            shutil.rmtree(work, ignore_errors=True)

    # 内部工具
    @staticmethod
    def _origin_of(name: str) -> str:
        """按包名前缀判定来源（``auto`` / ``manual``）。"""
        return "auto" if name.lower().startswith(BUNDLE_AUTO_PREFIX) else "manual"

    def _next_bundle_name(self, origin: str = "manual") -> str:
        stamp = (
            datetime.now(UTC)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z")
            .replace(":", "-")
            .replace(".", "-")
        )
        prefix = BUNDLE_AUTO_PREFIX if origin == "auto" else BUNDLE_PREFIX
        return f"{prefix}{stamp}.zip"

    def assert_safe_bundle_name(self, raw_name: str) -> str:
        name = Path(str(raw_name or "").strip()).name
        if not BUNDLE_NAME_RE.match(name) or ".." in name:
            bad_request(api_error("BACKUP_FILE_INVALID_NAME"))
        return name

    def _resolve_backup_dir(self) -> Path:
        # 目录口径收口在 settings.backups_dir（唯一权威），避免「备份排除项」与「实际写入
        # 目录」各算一套。
        return Path(self._settings.backups_dir)


__all__ = [
    "BACKUP_DIR",
    "BUNDLE_AUTO_PREFIX",
    "BUNDLE_NAME_RE",
    "BUNDLE_PREFIX",
    "ServerBackupService",
]
