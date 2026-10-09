"""服务器备份包文件管理（对齐 ``modules/system/backup/server-backup.service.ts``）。

负责手动备份包的生成、列出、下载、导入本地包、还原与删除；全部为纯手动文件级操作，
不涉及任何定时 / cron 调度（定时自动备份见 :mod:`auto_backup`）。

关键策略：
- 备份包写入仓库根 ``backups/`` 目录，文件名按时间戳生成（``next_bundle_name``）；
- 手动备份保留完整密钥（不脱敏），确保还原时真实配置不被占位符覆盖；
- 紧凑 JSON 序列化，避免 pretty-print 长时间占用事件循环拖垮 HA WS 心跳；
- 还原时校验文件名格式与白名单，防止目录穿越。
"""

from __future__ import annotations

import json
import logging
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .bundle_backup import SystemBundleBackupService
from ...core.errors import api_error, bad_request, not_found

logger = logging.getLogger("homeos.backup.server")

BACKUP_DIR = "backups"
BUNDLE_NAME_RE = re.compile(r"^homeos-bundle-.+\.json$", re.IGNORECASE)

#: 运行目录为后端子目录时，仓库根为其父目录（与 Nest ``resolveBackupDir`` 一致）
_BACKEND_DIR_NAMES = {"backend"}


class ServerBackupService:
    """Nest ``ServerBackupService`` 等价实现（手动备份包文件管理）。"""

    def __init__(self, bundle_backup: SystemBundleBackupService) -> None:
        self._bundle_backup = bundle_backup

    # ------------------------------------------------------------------ #
    # 生成 / 列出
    # ------------------------------------------------------------------ #
    def create_backup(self) -> dict[str, str]:
        directory = self._resolve_backup_dir()
        directory.mkdir(parents=True, exist_ok=True)
        # 手动备份保留完整密钥，确保还原时不会被脱敏占位符覆盖真实配置
        bundle = self._bundle_backup.export_bundle(False, {"include_event_log": False})
        name = self._next_bundle_name()
        file_path = directory / name
        # 紧凑 JSON：pretty-print 大包会长时间占用事件循环，拖垮 HA WS 心跳
        file_path.write_text(
            json.dumps(bundle, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )
        logger.info("备份包已写入 %s", file_path)
        return {"file": str(file_path), "name": name}

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
    # 下载 / 导入 / 删除 / 还原
    # ------------------------------------------------------------------ #
    def delete_file(self, raw_name: str) -> dict[str, str]:
        name = self.assert_safe_bundle_name(raw_name)
        full = self._resolve_backup_dir() / name
        try:
            full.unlink()
        except FileNotFoundError:
            not_found(api_error("BACKUP_FILE_NOT_FOUND"))
        logger.info("已删除备份包 %s", name)
        return {"deleted": name}

    def read_file_bundle(self, raw_name: str) -> dict[str, Any]:
        name = self.assert_safe_bundle_name(raw_name)
        full = self._resolve_backup_dir() / name
        try:
            raw = full.read_text(encoding="utf-8")
        except FileNotFoundError:
            not_found(api_error("BACKUP_FILE_NOT_FOUND"))
        try:
            bundle = json.loads(raw)
        except (TypeError, ValueError):
            bad_request(api_error("BACKUP_BUNDLE_INVALID_JSON"))
        return {"name": name, "bundle": bundle}

    def import_local_file(
        self, raw_bundle: Any, preferred_name: str | None = None
    ) -> dict[str, str]:
        """将本地备份包写入服务器备份目录（不触发还原）。"""
        bundle = self._bundle_backup.normalize_bundle_input(raw_bundle)
        directory = self._resolve_backup_dir()
        directory.mkdir(parents=True, exist_ok=True)

        name = ""
        candidate = Path(str(preferred_name or "").strip()).name
        if BUNDLE_NAME_RE.match(candidate) and ".." not in candidate:
            if not (directory / candidate).exists():
                name = candidate
        if not name:
            name = self._next_bundle_name()

        file_path = directory / name
        file_path.write_text(
            json.dumps(bundle, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )
        logger.info("本地备份包已导入服务器 %s", file_path)
        return {"file": str(file_path), "name": name}

    def restore_file(self, raw_name: str, opts: dict[str, Any] | None = None) -> dict[str, Any]:
        options = opts or {}
        if options.get("confirm") is not True:
            bad_request(api_error("BACKUP_BUNDLE_CONFIRM_REQUIRED"))
        bundle = self.read_file_bundle(raw_name)["bundle"]
        return self._bundle_backup.import_bundle(
            {
                "bundle": bundle,
                "confirm": True,
                "appConfigMode": options.get("appConfigMode"),
                "sections": options.get("sections"),
            }
        )

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
        return f"homeos-bundle-{stamp}.json"

    def assert_safe_bundle_name(self, raw_name: str) -> str:
        name = Path(str(raw_name or "").strip()).name
        if not BUNDLE_NAME_RE.match(name) or ".." in name:
            bad_request(api_error("BACKUP_FILE_INVALID_NAME"))
        return name

    def _resolve_backup_dir(self) -> Path:
        cwd = Path.cwd()
        base = cwd.parent if cwd.name in _BACKEND_DIR_NAMES else cwd
        return base / BACKUP_DIR


__all__ = ["BACKUP_DIR", "BUNDLE_NAME_RE", "ServerBackupService"]
