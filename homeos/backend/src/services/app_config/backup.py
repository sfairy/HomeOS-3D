"""运行参数备份服务（对齐 ``modules/system/backup/service.ts``）。

负责 AppConfig 的导出、导入、校验与脱敏。
"""

from __future__ import annotations

import copy
import logging
from datetime import UTC, datetime
from typing import Any

from ...core.errors import api_error, bad_request
from .constants import APP_CONFIG_SCHEMA_VERSION, CONFIG_MASK_PLACEHOLDER
from .import_normalize import normalize_app_config_for_import
from .mask import mask_sensitive_fields_by_key
from .service import AppConfigService
from .validate import (
    validate_app_config_partial,
    validate_app_config_replace_import,
)

logger = logging.getLogger("homeos.app_config.backup")

APP_CONFIG_BACKUP_SCHEMA = APP_CONFIG_SCHEMA_VERSION


class AppConfigBackupService:
    def __init__(self, app_config: AppConfigService) -> None:
        self._app_config = app_config

    def get_config_summary(self) -> dict[str, Any]:
        config = self._app_config.export_raw()
        sections = []
        for section, value in config.items():
            field_count = len(value) if isinstance(value, dict) else 0
            sections.append({"section": section, "fieldCount": field_count})
        return {
            "schemaVersion": APP_CONFIG_BACKUP_SCHEMA,
            "sectionCount": len(sections),
            "totalFields": sum(s["fieldCount"] for s in sections),
            "sections": sections,
        }

    def export(self, mask_secrets: bool = True) -> dict[str, Any]:
        raw = self._app_config.export_raw()
        config = self._mask_secrets(raw) if mask_secrets else raw
        return {
            "schemaVersion": APP_CONFIG_BACKUP_SCHEMA,
            "exportedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "config": config,
        }

    def import_config(self, payload: dict[str, Any]) -> dict[str, Any]:
        config = payload.get("config") if isinstance(payload, dict) else None
        if not isinstance(config, dict):
            bad_request(api_error("BACKUP_CONFIG_MISSING"))
        mode = "replace" if payload.get("mode") == "replace" else "merge"
        if mode == "replace" and not payload.get("confirm"):
            bad_request(api_error("BACKUP_CONFIG_CONFIRM_REQUIRED"))
        schema_version = payload.get("schemaVersion")
        if schema_version is not None and schema_version > APP_CONFIG_SCHEMA_VERSION:
            bad_request(
                api_error("BACKUP_SCHEMA_TOO_NEW", schema_version, APP_CONFIG_SCHEMA_VERSION)
            )

        normalized = normalize_app_config_for_import(copy.deepcopy(config))
        if normalized["changes"]:
            logger.warning("运行参数导入已自动修正: %s", "; ".join(normalized["changes"]))
        config_to_import = normalized["config"]

        if mode == "replace":
            validate_app_config_replace_import(config_to_import)
            self._app_config.replace_all(config_to_import)
            return {"mode": mode, "sections": len(config_to_import)}

        validate_app_config_partial(config_to_import)
        self._app_config.update(config_to_import)
        return {"mode": mode, "sections": len(config)}

    def _mask_secrets(self, config: dict[str, Any]) -> dict[str, Any]:
        out = copy.deepcopy(config)
        mask_sensitive_fields_by_key(out, CONFIG_MASK_PLACEHOLDER, 0, 5)
        return out


__all__ = ["AppConfigBackupService", "APP_CONFIG_BACKUP_SCHEMA"]
