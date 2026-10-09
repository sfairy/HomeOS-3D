"""系统运行参数配置路由（``/api/v1/system/config*``）。

对齐 Nest ``SystemConfigController``：
- ``GET system/config/public``：登录前公开配置（跳过 JWT）；
- ``GET system/config-audit``：配置变更审计（分页或最近 50 条，admin）；
- ``GET system/config/export`` / ``POST system/config/import``：配置导出 / 导入（admin）；
- ``GET system/config``：按角色读取（JWT，admin 附带 ``_configAudit``）；
- ``PUT system/config``：局部更新（admin，支持乐观锁）；
- ``POST system/config/reset``：重置分区 / 全量（admin）；
- ``GET`` / ``PUT system/config/retention``：数据保留策略与清理统计（admin）。
"""

from __future__ import annotations

import asyncio
from typing import Any, Literal

from fastapi import Body, Depends, Query, Request

from ..core.errors import api_error, bad_request
from ..core.pagination import parse_page_limit
from ..core.retention import RETENTION_TABLE_KEYS
from ..dependencies import require_license_feature
from ..security.auth_context import require_roles, require_user
from ..services.app_config.room_meta import (
    build_public_room_meta_from_ha_areas,
    filter_env_sensor_map_to_known_areas,
    resolve_voice_rooms,
)
from ..services.license import features as feature_codes
from ..services.state_store.entity_area import PUBLIC_CONFIG_AREA_WAIT_MS
from .router import NestRouter
from .schemas.base import StrictModel

router = NestRouter(prefix="/system", tags=["system"])

#: ``UpdateSystemConfigDto`` 允许的分区键（其余键拒绝，等价 forbidNonWhitelisted）。
_UPDATE_SECTIONS = (
    "auth",
    "notification",
    "security",
    "water",
    "circadian",
    "energy",
    "pricing",
    "other",
    "frontend",
    "profiles",
    "ui",
    "screensaver",
    "weatherEffects",
    "external",
    "envSensorMap",
    "mediaPlaylists",
    "voice",
    "voiceCommands",
    "haConnector",
    "ops",
    "stateStore",
    "wsPush",
    "commandProxy",
    "webrtc",
    "homeMode",
    "clientPower",
    "retention",
)

#: 需为数组（而非对象）的键。
_ARRAY_SECTIONS = ("voiceCommands",)

#: 配置分区 → 增量模块功能码：写入这些分区时要求对应授权（读路径仍走角色脱敏）。
_SECTION_LICENSE_FEATURES: dict[str, str] = {
    "energy": feature_codes.FEATURE_ENERGY,
    "pricing": feature_codes.FEATURE_ENERGY,
    "clientPower": feature_codes.FEATURE_ENERGY,
    "voice": feature_codes.FEATURE_VOICE,
    "voiceCommands": feature_codes.FEATURE_VOICE,
    "homeMode": feature_codes.FEATURE_HOME_MODE,
    "security": feature_codes.FEATURE_SECURITY,
    "notification": feature_codes.FEATURE_NOTIFICATIONS,
    "mediaPlaylists": feature_codes.FEATURE_MEDIA,
}


def _require_section_license_features(request: Request, sections: object) -> None:
    """对即将写入的配置分区集合做功能码门禁（同一码只判一次）。"""
    if not isinstance(sections, (dict, set, list, tuple)):
        return
    keys = sections.keys() if isinstance(sections, dict) else sections
    required = {
        _SECTION_LICENSE_FEATURES[key]
        for key in keys
        if isinstance(key, str) and key in _SECTION_LICENSE_FEATURES
    }
    for feature in sorted(required):
        require_license_feature(request, feature)


def _app_config(request: Request):
    return request.app.state.app_config

def _backup(request: Request):
    return request.app.state.app_config_backup

def _retention(request: Request):
    return request.app.state.database_retention

class ImportAppConfigDto(StrictModel):
    schemaVersion: float | None = None
    config: dict[str, Any]
    mode: Literal["merge", "replace"] | None = None
    confirm: bool | None = None

# ---------------------------------------------------------------------- #
# 公开配置（登录前）
# ---------------------------------------------------------------------- #
@router.get("/config/public")
async def get_public_config(request: Request):
    """获取公开系统配置（HA 区域索引最多等待 2s，避免慢注册表拖慢登录）。"""
    enrichment = getattr(request.app.state, "entity_area", None)
    if enrichment is not None:
        # 用 ``asyncio.wait`` 而不是 ``wait_for``：超时只结束本请求的等待，
        # 不取消共享的 ``ensure_loaded`` 任务（客户端断开时同理）。
        load = asyncio.create_task(enrichment.ensure_loaded())
        load.add_done_callback(
            lambda t: t.exception() if not t.cancelled() else None
        )
        try:
            done, _ = await asyncio.wait(
                {load}, timeout=PUBLIC_CONFIG_AREA_WAIT_MS / 1000
            )
            if done and (exc := load.exception()) is not None:
                raise exc
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - 区域索引超时/失败时退回空索引
            pass

    app_config = _app_config(request)
    base = app_config.get_public()
    ha_areas = enrichment.get_cached_ha_areas() if enrichment is not None else []
    env_sensor_map = filter_env_sensor_map_to_known_areas(app_config.get("envSensorMap"), ha_areas)
    voice = base.get("voice")
    if isinstance(voice, dict):
        voice = {
            **voice,
            "rooms": [room["label"] for room in resolve_voice_rooms(env_sensor_map, ha_areas)],
        }
    return {
        **base,
        "haAreas": ha_areas,
        "voice": voice,
        "roomMeta": build_public_room_meta_from_ha_areas(ha_areas, env_sensor_map),
    }

# ---------------------------------------------------------------------- #
# 配置变更审计
# ---------------------------------------------------------------------- #
@router.get("/config-audit")
async def get_config_audit(
    request: Request,
    page: str | None = Query(default=None),
    limit: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    """获取系统配置变更审计（默认最近 50 条，可分页）。"""
    pagination = parse_page_limit(page, limit)
    app_config = _app_config(request)
    if pagination["pageNum"] > 0 and pagination["pageSize"] > 0:
        return app_config.get_audit_log_paginated(pagination["pageNum"], pagination["pageSize"])
    return app_config.get_audit_log(50)

# ---------------------------------------------------------------------- #
# 导出 / 导入
# ---------------------------------------------------------------------- #
@router.get("/config/export")
async def export_config(
    request: Request,
    maskSecrets: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    """导出系统运行参数（默认脱敏；``maskSecrets=false`` 导出原文）。"""
    return _backup(request).export(maskSecrets != "false")

@router.post("/config/import")
async def import_config(
    payload: ImportAppConfigDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    """导入系统运行参数（merge 或 replace）。"""
    _require_section_license_features(request, payload.config)
    return await asyncio.to_thread(
        _backup(request).import_config, payload.model_dump(exclude_none=True)
    )

# ---------------------------------------------------------------------- #
# 读取 / 更新 / 重置
# ---------------------------------------------------------------------- #
def _config_response(app_config: Any, role: str | None) -> dict[str, Any]:
    data = app_config.get_all()
    if role == "admin":
        return {**data, "_configAudit": app_config.get_audit_log(50)}
    return app_config.pick_for_role(role)

@router.get("/config")
async def get_system_config(request: Request, user: dict[str, Any] = Depends(require_user)):
    """获取完整系统配置（admin 附带审计；其余角色返回脱敏视图）。"""
    return _config_response(_app_config(request), user.get("role"))

def _validate_update_payload(body: dict[str, Any]) -> dict[str, Any]:
    """等价 ``UpdateSystemConfigDto`` 的结构校验（未知键 / 类型不符 → 400）。"""
    for key, value in body.items():
        if key == "expectedUpdatedAt":
            if not isinstance(value, str):
                bad_request("expectedUpdatedAt 须为 ISO 时间字符串")
            continue
        if key not in _UPDATE_SECTIONS:
            bad_request(f"property {key} should not exist")
        if key in _ARRAY_SECTIONS:
            if not isinstance(value, list):
                bad_request(f"{key} 须为数组")
        elif not isinstance(value, dict):
            bad_request(f"{key} 须为对象")
    return body

@router.put("/config")
async def update_system_config(
    request: Request,
    body: dict[str, Any] = Body(...),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    """局部更新系统配置（支持乐观锁 ``expectedUpdatedAt``，冲突 409）。"""
    payload = _validate_update_payload(body if isinstance(body, dict) else {})
    _require_section_license_features(request, payload)
    expected_updated_at = payload.pop("expectedUpdatedAt", None) or None
    app_config = _app_config(request)
    await asyncio.to_thread(app_config.update, payload, expected_updated_at)
    return _config_response(app_config, user.get("role"))

@router.post("/config/reset")
async def reset_system_config(
    request: Request,
    body: dict[str, Any] = Body(default={}),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    """重置系统配置（传 ``section`` 仅重置该分区，缺省重置全部）。"""
    payload = body if isinstance(body, dict) else {}
    section = payload.get("section")
    if section is not None and not isinstance(section, str):
        bad_request("section 须为字符串")
    if isinstance(section, str) and section:
        _require_section_license_features(request, {section})
    else:
        # 全量重置会触及受门禁分区，要求当前租约覆盖全部相关模块码。
        _require_section_license_features(request, set(_SECTION_LICENSE_FEATURES))
    app_config = _app_config(request)
    return await asyncio.to_thread(app_config.reset, section)

# ---------------------------------------------------------------------- #
# 数据保留
# ---------------------------------------------------------------------- #
def _retention_overview(request: Request) -> dict[str, Any]:
    retention = _retention(request)
    return {
        "policies": retention.get_retention_policies(),
        "lastCleanup": retention.get_last_cleanup_stats(),
        "estimatedRows": retention.estimate_table_rows(),
    }

@router.get("/config/retention")
async def get_retention_config(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin"))
):
    """获取数据保留策略与最近一次清理统计。"""
    return await asyncio.to_thread(_retention_overview, request)

@router.put("/config/retention")
async def update_retention_config(
    request: Request,
    body: dict[str, Any] = Body(default={}),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    """更新各表数据保留天数（白名单校验未知表键，写回配置并即时生效）。"""
    payload = body if isinstance(body, dict) else {}
    days = payload.get("retention")
    if days is None:
        days = {}
    if not isinstance(days, dict):
        bad_request("retention 须为对象")
    unknown = [key for key in days if key not in RETENTION_TABLE_KEYS]
    if unknown:
        bad_request(f"{api_error('RETENTION_KEYS_INVALID')}: {', '.join(unknown)}")

    retention = _retention(request)
    await asyncio.to_thread(retention.update_retention_policies, days)
    return await asyncio.to_thread(_retention_overview, request)

__all__ = ["router"]
