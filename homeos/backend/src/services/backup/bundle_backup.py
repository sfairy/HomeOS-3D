"""完整备份包服务（对齐 ``modules/system/backup/system-bundle-backup.service.ts``）。

聚合 UI 配置 / AppConfig / 用户三个分区为统一备份包，支持按分区白名单选择性导出 / 导入。

关键策略：
- 导出附 ``kind=homeos-system-bundle`` 与 ``schemaVersion=2``；可选脱敏（手动备份不脱敏）；
- 导入按 ``normalize_bundle_sections`` 校验白名单分区，未知名直接拒绝；
- 任一分区应用失败时回滚已应用分区，避免半导入状态。
"""

from __future__ import annotations

import copy
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select

from ...core.errors import api_error, bad_request
from ...core.models import EventLog
from ..app_config import AppConfigBackupService
from ..ui_config import UiConfigService
from .users_backup import UsersBackupService

logger = logging.getLogger("homeos.backup.bundle")

BUNDLE_BACKUP_KIND = "homeos-system-bundle"
BUNDLE_BACKUP_SCHEMA = 2

#: 标准分区名白名单（未知分区名将被拒绝）
BUNDLE_IMPORT_SECTION_WHITELIST: tuple[str, ...] = ("ui", "appConfig", "users")

#: 默认还原分区：与 UI「不含用户账号」一致；users 需显式传入 sections
DEFAULT_IMPORT_SECTIONS: tuple[str, ...] = ("ui", "appConfig")

EVENT_LOG_MAX_LIMIT = 10_000


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def normalize_bundle_sections(sections: list[str] | None) -> list[str]:
    raw = list(sections) if sections else list(DEFAULT_IMPORT_SECTIONS)
    for section in raw:
        if section not in BUNDLE_IMPORT_SECTION_WHITELIST:
            bad_request(api_error("BACKUP_BUNDLE_SECTIONS_INVALID"))
    return raw


class SystemBundleBackupService:
    """Nest ``SystemBundleBackupService`` 等价实现。"""

    def __init__(
        self,
        ui_config: UiConfigService,
        app_config_backup: AppConfigBackupService,
        users_backup: UsersBackupService,
        session_factory: Callable[[], Any],
    ) -> None:
        self._ui_config = ui_config
        self._app_config_backup = app_config_backup
        self._users_backup = users_backup
        self._session_factory = session_factory

    # ------------------------------------------------------------------ #
    # 摘要
    # ------------------------------------------------------------------ #
    def get_backup_summary(self) -> dict[str, Any]:
        ui = self._ui_config.get_profiles_summary()
        users = self._users_backup.export_users()
        return {
            "kind": BUNDLE_BACKUP_KIND,
            "schemaVersion": BUNDLE_BACKUP_SCHEMA,
            "ui": ui,
            "appConfig": self._app_config_backup.get_config_summary(),
            "users": {"count": len(users["users"])},
        }

    # ------------------------------------------------------------------ #
    # 导出
    # ------------------------------------------------------------------ #
    def export_bundle(
        self,
        mask_secrets: bool = True,
        opts: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        options = opts or {}
        bundle: dict[str, Any] = {
            "kind": BUNDLE_BACKUP_KIND,
            "schemaVersion": BUNDLE_BACKUP_SCHEMA,
            "exportedAt": _now_iso(),
            "ui": self._ui_config.export_all_configs(),
            "appConfig": self._app_config_backup.export(mask_secrets),
            "users": self._users_backup.export_users(),
        }
        if options.get("include_event_log"):
            bundle["eventLog"] = self._export_event_log_slice(
                int(options.get("event_log_limit") or EVENT_LOG_MAX_LIMIT)
            )
        return bundle

    def _export_event_log_slice(self, limit: int) -> dict[str, Any]:
        take = min(max(limit, 1), EVENT_LOG_MAX_LIMIT)
        with self._session_factory() as session:
            rows = (
                session.execute(
                    select(EventLog).order_by(EventLog.created_at.desc()).limit(take)
                )
                .scalars()
                .all()
            )
        return {
            "exportedAt": _now_iso(),
            "rowCount": len(rows),
            "rows": [
                {
                    "entityId": row.entity_id,
                    "oldState": row.old_state,
                    "newState": row.new_state,
                    "stateDiff": row.state_diff,
                    "createdAt": (
                        row.created_at.replace(tzinfo=UTC)
                        if row.created_at.tzinfo is None
                        else row.created_at.astimezone(UTC)
                    )
                    .isoformat(timespec="milliseconds")
                    .replace("+00:00", "Z"),
                }
                for row in rows
            ],
        }

    # ------------------------------------------------------------------ #
    # 导入
    # ------------------------------------------------------------------ #
    def normalize_bundle_input(self, raw: Any) -> dict[str, Any]:
        if not isinstance(raw, dict):
            bad_request(api_error("BACKUP_BUNDLE_INVALID_JSON"))
        obj = raw
        is_bundle_kind = obj.get("kind") == BUNDLE_BACKUP_KIND
        has_legacy_shape = obj.get("ui") is not None and obj.get("appConfig") is not None
        if not is_bundle_kind and not has_legacy_shape:
            bad_request(
                "不是 HomeOS 完整备份包（需 kind=homeos-system-bundle 或同时含 ui / appConfig）"
            )

        # 必要顶层字段类型校验：防止畸形数据在导入阶段被静默跳过或触发运行时异常
        if not isinstance(obj.get("ui"), list):
            bad_request(api_error("BACKUP_BUNDLE_INVALID_STRUCTURE"))
        if not isinstance(obj.get("appConfig"), dict):
            bad_request(api_error("BACKUP_BUNDLE_INVALID_STRUCTURE"))
        schema_version = obj.get("schemaVersion")
        if schema_version is not None and not isinstance(schema_version, int):
            bad_request(api_error("BACKUP_BUNDLE_INVALID_STRUCTURE"))
        return obj

    def import_bundle(self, payload: dict[str, Any]) -> dict[str, Any]:
        bundle = self.normalize_bundle_input((payload or {}).get("bundle"))
        schema_version = int(bundle.get("schemaVersion") or 0)
        if schema_version > BUNDLE_BACKUP_SCHEMA:
            bad_request(
                api_error("BUNDLE_SCHEMA_TOO_NEW", schema_version, BUNDLE_BACKUP_SCHEMA)
            )
        if not payload.get("confirm"):
            bad_request(api_error("BACKUP_BUNDLE_CONFIRM_REQUIRED"))

        # 分区白名单校验：仅应用选定分区，其余分区保持不动
        want = set(normalize_bundle_sections(payload.get("sections")))
        app_config_mode = "replace" if payload.get("appConfigMode") == "replace" else "merge"
        result: dict[str, Any] = {"sections": []}

        snapshot: dict[str, Any] = {
            "ui": self._ui_config.export_all_configs(),
            "appConfig": self._app_config_backup.export(False),
            "users": self._users_backup.export_users() if "users" in want else None,
            "usersCreated": [],
        }
        applied: list[str] = []

        try:
            app_config = bundle.get("appConfig") or {}
            if "appConfig" in want and isinstance(app_config.get("config"), dict):
                result["appConfig"] = self._app_config_backup.import_config(
                    {
                        "config": app_config["config"],
                        "schemaVersion": app_config.get("schemaVersion"),
                        "mode": app_config_mode,
                        "confirm": app_config_mode == "replace",
                    }
                )
                applied.append("appConfig")
                result["sections"].append("appConfig")

            if "ui" in want and bundle.get("ui"):
                configs = [
                    {"projectId": row["projectId"], "layout": row.get("layout")}
                    for row in bundle["ui"]
                    if isinstance(row, dict) and row.get("projectId")
                ]
                if not configs:
                    bad_request(api_error("BACKUP_BUNDLE_UI_LAYOUT_INVALID"))
                result["ui"] = self._ui_config.import_all_configs(configs)
                applied.append("ui")
                result["sections"].append("ui")

            users_section = bundle.get("users") or {}
            users_rows = users_section.get("users") if isinstance(users_section, dict) else None
            if "users" in want and users_rows:
                users_result = self._users_backup.import_users(
                    users_rows, {"skip_existing": True}
                )
                result["users"] = users_result
                snapshot["usersCreated"] = users_result["createdUsernames"]
                applied.append("users")
                result["sections"].append("users")
        except Exception:
            self._rollback_bundle_snapshot(snapshot, applied)
            raise

        logger.info("完整备份包已导入: %s", result["sections"])
        return {"success": True, **result}

    def _rollback_bundle_snapshot(self, snapshot: dict[str, Any], applied: list[str]) -> None:
        for section in reversed(list(applied)):
            try:
                if section == "ui" and snapshot.get("ui"):
                    configs = [
                        {"projectId": row["projectId"], "layout": copy.deepcopy(row.get("layout"))}
                        for row in snapshot["ui"]
                    ]
                    self._ui_config.import_all_configs(configs)
                elif section == "appConfig" and (snapshot.get("appConfig") or {}).get("config"):
                    self._app_config_backup.import_config(
                        {
                            "config": copy.deepcopy(snapshot["appConfig"]["config"]),
                            "mode": "replace",
                            "confirm": True,
                        }
                    )
                elif section == "users":
                    self._users_backup.rollback_users_import(
                        (snapshot.get("users") or {}).get("users") or [],
                        snapshot.get("usersCreated") or [],
                    )
            except Exception as err:  # noqa: BLE001 - 回滚失败仅记日志
                logger.error("备份回滚 %s 失败: %s", section, err)
        logger.warning("备份包导入失败,已尝试回滚: %s", ", ".join(applied))


__all__ = [
    "BUNDLE_BACKUP_KIND",
    "BUNDLE_BACKUP_SCHEMA",
    "BUNDLE_IMPORT_SECTION_WHITELIST",
    "DEFAULT_IMPORT_SECTIONS",
    "SystemBundleBackupService",
    "normalize_bundle_sections",
]
