"""UI 配置服务（对齐 ``modules/ui-config/service.ts``）。

负责项目布局配置（ProjectConfig 表）的 CRUD、导入导出、终端 display profile 绑定，
以及背景图 / 图标静态资源的委托操作。

说明：SQLite 端口把 Prisma ``Json`` 字段以 TEXT 存储，对外仍返回解析后的对象，
保证 HTTP 契约与 Nest 一致。
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select

from .layout_secrets import (
    mask_layout_for_role,
    merge_layout_secrets_on_save,
    strip_legacy_ha_connection,
)
from .static_assets import UiConfigStaticAssetService
from ...core.errors import (
    BusinessException,
    ErrorCode,
    api_error,
    bad_request,
)
from ...core.json_field import read_json_object, to_input_json
from ...core.models import ProjectConfig

logger = logging.getLogger("homeos.ui_config")

_SYSTEM_CONFIG_UPDATED_EVENT = "SYSTEM_CONFIG_UPDATED"
_LAYOUT_CONFIG_UPDATED_EVENT = "layout.config.updated"


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class UiConfigService:
    def __init__(
        self,
        session_factory: Callable[[], Any],
        app_config: Any,
        static_assets: UiConfigStaticAssetService | None = None,
        event_bus: Any = None,
    ) -> None:
        self._session_factory = session_factory
        self._app_config = app_config
        self._static_assets = static_assets or UiConfigStaticAssetService()
        self._event_bus = event_bus

    # ------------------------------------------------------------------ #
    # 内部工具
    # ------------------------------------------------------------------ #
    def _emit_config_updated(self) -> None:
        if self._event_bus is None:
            return
        for name in (_SYSTEM_CONFIG_UPDATED_EVENT, _LAYOUT_CONFIG_UPDATED_EVENT):
            emit_soon = getattr(self._event_bus, "emit_soon", None)
            if callable(emit_soon):
                try:
                    emit_soon(name)
                except Exception as exc:
                    logger.debug("广播 %s 失败: %s", name, exc)

    def _record(self, row: ProjectConfig) -> dict[str, Any]:
        return {
            "id": row.id,
            "projectId": row.project_id,
            # 读路径统一清掉历史 layout.haConfig 里的连接凭据（3.3 起单源到 ha_connections）。
            "layout": strip_legacy_ha_connection(read_json_object(row.layout)),
            "createdAt": _iso(row.created_at),
            "updatedAt": _iso(row.updated_at),
        }

    def _find(self, session, project_id: str) -> ProjectConfig | None:
        return session.execute(
            select(ProjectConfig).where(ProjectConfig.project_id == project_id)
        ).scalar_one_or_none()

    @staticmethod
    def parse_layout_field(layout: Any) -> tuple[dict[str, Any], bool]:
        """解析 layout 为对象（API / 备份导入可能仍传入 JSON 字符串）。"""
        if layout is None or layout == "":
            return {}, False
        if isinstance(layout, dict):
            return layout, False
        if isinstance(layout, str):
            try:
                parsed = json.loads(layout)
            except (TypeError, ValueError) as exc:
                logger.error("布局 JSON 解析失败: %s", exc)
                return {}, True
            return (parsed, False) if isinstance(parsed, dict) else ({}, True)
        return {}, True

    def _profiles(self) -> dict[str, Any]:
        profiles = self._app_config.get("profiles")
        return profiles if isinstance(profiles, dict) else {}

    # ------------------------------------------------------------------ #
    # 读取
    # ------------------------------------------------------------------ #
    def get_config(self, project_id: str = "default") -> dict[str, Any]:
        """获取项目配置（不存在时返回 ``{projectId, layout: {}}``）。"""
        with self._session_factory() as session:
            row = self._find(session, project_id)
            if row is None:
                return {"projectId": project_id, "layout": {}}
            return self._record(row)

    def get_config_for_api(self, project_id: str, role: str | None = None) -> dict[str, Any]:
        """API：获取项目配置（含已解析 layout；非 admin 脱敏 HA token）。"""
        try:
            data = self.get_config(project_id)
            layout, parse_error = self.parse_layout_field(data.get("layout"))
            return {
                "success": True,
                "data": {
                    **data,
                    "layout": mask_layout_for_role(layout, role),
                    "layoutParseError": parse_error,
                },
            }
        except Exception as exc:
            if isinstance(exc, BusinessException):
                raise
            raise BusinessException(
                ErrorCode.CONFIG_ERROR, api_error("UI_CONFIG_LOAD_FAILED", str(exc))
            ) from exc

    # ------------------------------------------------------------------ #
    # 激活方案 / 终端绑定
    # ------------------------------------------------------------------ #
    async def set_active_profile(self, project_id_raw: str | None) -> dict[str, Any]:
        project_id = str(project_id_raw or "").strip()
        if not project_id:
            bad_request(api_error("UI_CONFIG_PROJECT_ID_REQUIRED"))
        if project_id == "default":
            self._ensure_default_profile()
        else:
            self._assert_profile_exists(project_id)
        if self.resolve_active_project_id() == project_id:
            return {"success": True, "activeProfileId": project_id}
        self._app_config.update({"profiles": {"activeProfileId": project_id}})
        self._emit_config_updated()
        return {"success": True, "activeProfileId": project_id}

    def resolve_active_project_id(self) -> str:
        return str(self._profiles().get("activeProfileId") or "").strip() or "default"

    def get_active_profile_settings(self) -> dict[str, Any]:
        profiles = self._profiles()
        return {
            "success": True,
            "data": {
                "activeProfileId": profiles.get("activeProfileId") or "default",
                "newTerminalDefault": profiles.get("newTerminalDefault") or "activeProfile",
            },
        }

    async def set_new_terminal_default(self, strategy: str | None) -> dict[str, Any]:
        value = str(strategy or "").strip()
        if value not in ("activeProfile", "default"):
            bad_request(api_error("UI_CONFIG_TERMINAL_DEFAULT_INVALID"))
        self._app_config.update({"profiles": {"newTerminalDefault": value}})
        return {"success": True, "newTerminalDefault": value}

    def list_terminal_bindings(self) -> dict[str, Any]:
        bindings = list(self._profiles().get("terminalBindings") or [])
        bindings.sort(key=lambda row: str(row.get("updatedAt") or ""), reverse=True)
        return {"success": True, "data": bindings}

    async def resolve_profile_for_terminal(self, client_id_raw: str | None) -> dict[str, Any]:
        client_id = str(client_id_raw or "").strip()
        if not client_id:
            bad_request(api_error("UI_CONFIG_CLIENT_ID_REQUIRED"))

        profiles = self._profiles()
        binding = next(
            (row for row in (profiles.get("terminalBindings") or []) if row.get("clientId") == client_id),
            None,
        )
        if binding and binding.get("profileId") and self._profile_exists(binding["profileId"]):
            return {
                "success": True,
                "data": {"profileId": binding["profileId"], "source": "binding"},
            }

        strategy = profiles.get("newTerminalDefault") or "activeProfile"
        if strategy == "activeProfile":
            active_id = str(profiles.get("activeProfileId") or "").strip() or "default"
            if self._profile_exists(active_id):
                return {"success": True, "data": {"profileId": active_id, "source": "activeProfile"}}

        return {"success": True, "data": {"profileId": "default", "source": "default"}}

    async def upsert_terminal_binding(
        self, body: dict[str, Any], bound_by_user_id: str | None = None
    ) -> dict[str, Any]:
        client_id = str((body or {}).get("clientId") or "").strip()
        profile_id = str((body or {}).get("profileId") or "").strip()
        if not client_id:
            bad_request(api_error("UI_CONFIG_CLIENT_ID_REQUIRED"))
        if not profile_id:
            bad_request(api_error("UI_CONFIG_PROFILE_ID_REQUIRED"))
        self._assert_profile_exists(profile_id)

        profiles = self._profiles()
        bindings = [dict(row) for row in (profiles.get("terminalBindings") or [])]
        index = next(
            (i for i, row in enumerate(bindings) if row.get("clientId") == client_id), None
        )
        row = {
            "clientId": client_id,
            "profileId": profile_id,
            "label": str(body.get("label")).strip() if body.get("label") is not None else None,
            "boundBy": bound_by_user_id,
            "updatedAt": datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        }
        if index is not None:
            merged = {**bindings[index], **row}
            if row["boundBy"] is None:
                merged["boundBy"] = bindings[index].get("boundBy")
            if row["label"] is None:
                merged.pop("label", None)
            bindings[index] = merged
            result = merged
        else:
            if row["label"] is None:
                row.pop("label", None)
            bindings.append(row)
            result = row

        self._app_config.update({"profiles": {"terminalBindings": bindings}})
        return {"success": True, "data": result}

    async def bind_self_terminal(
        self, body: dict[str, Any], caller: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        client_id = str((body or {}).get("clientId") or "").strip()
        profile_id = str((body or {}).get("profileId") or "").strip()
        if not client_id:
            bad_request(api_error("UI_CONFIG_CLIENT_ID_REQUIRED"))
        if not profile_id:
            bad_request(api_error("UI_CONFIG_PROFILE_ID_REQUIRED"))
        self._assert_profile_exists(profile_id)

        caller = caller or {}
        if caller.get("role") == "admin":
            return await self.upsert_terminal_binding(body, caller.get("userId"))

        profiles = self._profiles()
        bindings = [dict(row) for row in (profiles.get("terminalBindings") or [])]
        index = next(
            (i for i, row in enumerate(bindings) if row.get("clientId") == client_id), None
        )
        now = datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")

        if index is not None:
            existing = bindings[index]
            if not caller.get("userId") or existing.get("boundBy") != caller.get("userId"):
                bad_request(api_error("UI_CONFIG_TERMINAL_BINDING_FORBIDDEN"))
            row = {
                **existing,
                "clientId": client_id,
                "profileId": profile_id,
                "label": str(body.get("label")).strip()
                if body.get("label") is not None
                else existing.get("label"),
                "boundBy": caller.get("userId") or existing.get("boundBy"),
                "updatedAt": now,
            }
            if row.get("label") is None:
                row.pop("label", None)
            bindings[index] = row
            self._app_config.update({"profiles": {"terminalBindings": bindings}})
            logger.warning(
                "非 admin 用户 %s(%s) 更新终端 %s 绑定 → 方案 %s",
                caller.get("userId") or "unknown",
                caller.get("role"),
                client_id,
                profile_id,
            )
            return {"success": True, "data": row}

        row = {
            "clientId": client_id,
            "profileId": profile_id,
            "boundBy": caller.get("userId"),
            "updatedAt": now,
        }
        if body.get("label") is not None:
            row["label"] = str(body["label"]).strip()
        bindings.append(row)
        self._app_config.update({"profiles": {"terminalBindings": bindings}})
        logger.warning(
            "非 admin 用户 %s(%s) 绑定终端 %s → 方案 %s",
            caller.get("userId") or "unknown",
            caller.get("role"),
            client_id,
            profile_id,
        )
        return {"success": True, "data": row}

    async def remove_terminal_binding(self, client_id_raw: str | None) -> dict[str, Any]:
        client_id = str(client_id_raw or "").strip()
        if not client_id:
            bad_request(api_error("UI_CONFIG_CLIENT_ID_REQUIRED"))
        profiles = self._profiles()
        bindings = [
            row for row in (profiles.get("terminalBindings") or []) if row.get("clientId") != client_id
        ]
        self._app_config.update({"profiles": {"terminalBindings": bindings}})
        return {"success": True, "removed": client_id}

    # ------------------------------------------------------------------ #
    # 方案存在性
    # ------------------------------------------------------------------ #
    def _ensure_default_profile(self) -> None:
        with self._session_factory() as session:
            if self._find(session, "default") is None:
                now = datetime.now(UTC)
                session.add(
                    ProjectConfig(
                        project_id="default",
                        layout=json.dumps({}, ensure_ascii=False),
                        created_at=now,
                        updated_at=now,
                    )
                )
                session.commit()

    def _profile_exists(self, project_id: str) -> bool:
        with self._session_factory() as session:
            return self._find(session, project_id) is not None

    def _assert_profile_exists(self, project_id: str) -> None:
        if not self._profile_exists(project_id):
            bad_request(api_error("UI_CONFIG_PROFILE_NOT_FOUND", project_id))

    # ------------------------------------------------------------------ #
    # 保存 / 删除 / 导入 / 导出
    # ------------------------------------------------------------------ #
    def save_config(self, project_id: str, layout: Any) -> dict[str, Any]:
        """保存或更新项目配置（保存后广播 SYSTEM_CONFIG_UPDATED 供旁路消费者热更新）。

        3.3 起 layout 不再承载 HA 连接配置，因此保存布局**不会**改变 HA 连接：地址与
        令牌的变更路径是 ``PUT /ha/connection``（由它自己重启连接器）。这里照旧广播
        ``SYSTEM_CONFIG_UPDATED``，供其它读 layout 的消费者（安防事件路径、绑定等）刷新。
        """
        logger.info("正在保存项目布局配置:%s", project_id)
        layout_json = strip_legacy_ha_connection(to_input_json(layout, {}))
        with self._session_factory() as session:
            row = self._find(session, project_id)
            now = datetime.now(UTC)
            if row is None:
                row = ProjectConfig(
                    project_id=project_id,
                    layout=json.dumps(layout_json, ensure_ascii=False),
                    created_at=now,
                    updated_at=now,
                )
                session.add(row)
            else:
                row.layout = json.dumps(layout_json, ensure_ascii=False)
                row.updated_at = now
            session.commit()
            session.refresh(row)
            result = self._record(row)

        self._emit_config_updated()
        return result

    async def save_config_from_body(self, project_id: str, body: dict[str, Any]) -> dict[str, Any]:
        layout_raw, parse_error = self.parse_layout_field((body or {}).get("layout"))
        if parse_error:
            bad_request(api_error("UI_CONFIG_DATA_INVALID"))

        existing_layout: Any = None
        with self._session_factory() as session:
            row = self._find(session, project_id)
            if row is not None:
                existing_layout = row.layout
        if row is None:
            active_profile_id = str(self._profiles().get("activeProfileId") or "").strip()
            if active_profile_id and active_profile_id != project_id:
                with self._session_factory() as session:
                    active_row = self._find(session, active_profile_id)
                    if active_row is not None and active_row.layout:
                        existing_layout = active_row.layout

        merged_layout = merge_layout_secrets_on_save(layout_raw, existing_layout)
        result = self.save_config(project_id, merged_layout)
        return {"success": True, "data": result}

    async def delete_profile_safe(self, project_id: str) -> dict[str, Any]:
        self.delete_profile(project_id)
        return {"success": True}

    def delete_profile(self, project_id: str) -> None:
        if project_id == "default":
            bad_request(api_error("UI_CONFIG_DEFAULT_DELETE_DENIED"))
        with self._session_factory() as session:
            row = self._find(session, project_id)
            if row is None:
                bad_request(api_error("UI_CONFIG_PROFILE_NOT_FOUND", project_id))
            session.delete(row)
            session.commit()

    def list_profiles(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            rows = (
                session.execute(
                    select(ProjectConfig)
                    .order_by(ProjectConfig.updated_at.desc())
                    .limit(100)
                )
                .scalars()
                .all()
            )
        return [{"projectId": row.project_id, "updatedAt": _iso(row.updated_at)} for row in rows]

    def get_profiles_summary(self) -> dict[str, Any]:
        profiles = self.list_profiles()
        return {"count": len(profiles), "profiles": profiles}

    def export_all_configs(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            rows = (
                session.execute(
                    select(ProjectConfig)
                    .order_by(ProjectConfig.updated_at.desc())
                    .limit(100)
                )
                .scalars()
                .all()
            )
            return [self._record(row) for row in rows]

    async def import_all_configs_validated(self, body: dict[str, Any]) -> dict[str, Any]:
        configs = (body or {}).get("configs")
        if not isinstance(configs, list):
            bad_request(api_error("UI_CONFIG_DATA_INVALID"))
        return self.import_all_configs(configs)

    def import_all_configs(self, configs: list[dict[str, Any]]) -> dict[str, Any]:
        logger.info("正在恢复所有项目配置(%s 项)...", len(configs))
        valid = [
            item
            for item in configs
            if isinstance(item, dict) and item.get("projectId") and item.get("layout") is not None
        ]

        existing: dict[str, Any] = {}
        if valid:
            ids = [str(item["projectId"]) for item in valid]
            with self._session_factory() as session:
                rows = (
                    session.execute(
                        select(ProjectConfig).where(ProjectConfig.project_id.in_(ids)).limit(100)
                    )
                    .scalars()
                    .all()
                )
                for row in rows:
                    existing[row.project_id] = row.layout

        active_profile_id = str(self._profiles().get("activeProfileId") or "").strip()
        active_layout: Any = None
        if active_profile_id:
            with self._session_factory() as session:
                active_row = self._find(session, active_profile_id)
                if active_row is not None and active_row.layout:
                    active_layout = active_row.layout

        rows_to_write: list[dict[str, Any]] = []
        for item in valid:
            layout_obj, parse_error = self.parse_layout_field(item.get("layout"))
            if parse_error:
                logger.warning("跳过损坏的布局配置 projectId=%s", item.get("projectId"))
                continue
            project_id = str(item["projectId"])
            layout_for_merge = existing.get(project_id) or active_layout
            merged = merge_layout_secrets_on_save(layout_obj, layout_for_merge)
            rows_to_write.append({"projectId": project_id, "layout": merged})

        now = datetime.now(UTC)
        with self._session_factory() as session:
            for item in rows_to_write:
                row = self._find(session, item["projectId"])
                payload = json.dumps(item["layout"], ensure_ascii=False)
                if row is None:
                    session.add(
                        ProjectConfig(
                            project_id=item["projectId"],
                            layout=payload,
                            created_at=now,
                            updated_at=now,
                        )
                    )
                else:
                    row.layout = payload
                    row.updated_at = now
            session.commit()

        self._emit_config_updated()
        return {"success": True, "count": len(rows_to_write)}

    # ------------------------------------------------------------------ #
    # 静态资源委托
    # ------------------------------------------------------------------ #
    def get_safe_background_path(self, sub_path: str = ""):
        return self._static_assets.get_safe_background_path(sub_path)

    def get_safe_icon_path(self, sub_path: str = ""):
        return self._static_assets.get_safe_icon_path(sub_path)

    def list_backgrounds(self, sub_path: str = ""):
        return self._static_assets.list_backgrounds(sub_path)

    def list_icons(self, sub_path: str = ""):
        return self._static_assets.list_icons(sub_path)

    def create_background_directory(self, sub_path: str):
        return self._static_assets.create_background_directory(sub_path)

    def create_icon_directory(self, sub_path: str):
        return self._static_assets.create_icon_directory(sub_path)

    def save_background(self, filename: str, buffer: bytes, sub_path: str = ""):
        return self._static_assets.save_background(filename, buffer, sub_path)

    def save_icon(self, filename: str, buffer: bytes, sub_path: str = ""):
        return self._static_assets.save_icon(filename, buffer, sub_path)

    def delete_background(self, full_path: str):
        return self._static_assets.delete_background(full_path)

    def delete_icon(self, full_path: str):
        return self._static_assets.delete_icon(full_path)


__all__ = ["UiConfigService"]
