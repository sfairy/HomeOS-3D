"""地震预警 / 全球震情路由（``/api/v1/earthquake/*``）。

对齐 Nest ``EarthquakeController``：
- ``POST   /earthquake/test``                触发模拟演练（admin，延迟 3 秒）
- ``GET    /earthquake/status``              EEW 状态（登录即可）
- ``POST   /earthquake/status``              EEW 状态（登录即可，便于前端统一鉴权）
- ``GET    /earthquake/latest``              最新预警（isActive / payload）
- ``GET    /earthquake/history``             最近 50 条预警历史
- ``DELETE /earthquake/history/simulation``  删除模拟演练记录（admin）
- ``GET    /earthquake/global``              全球 / 区域地震目录（CENC / USGS）
- ``POST   /earthquake/dismiss``             关闭指定预警
- ``GET    /earthquake/ha-config``           HA 坐标（admin）
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import Depends, Query, Request
from pydantic import BaseModel, ConfigDict, model_validator

from .router import NestRouter
from ..core.errors import BusinessException, ErrorCode
from ..dependencies import license_feature
from ..security.auth_context import require_roles, require_user
from ..services.license import features as feature_codes

logger = logging.getLogger("homeos.earthquake.api")

router = NestRouter(
    prefix="/earthquake",
    tags=["awareness"],
    dependencies=[license_feature(feature_codes.FEATURE_EARTHQUAKE)],
)

#: 演练触发前的延迟：使前端有时间切换到预警监听状态（毫秒）
SIMULATION_TRIGGER_DELAY_MS = 3000

#: 顶层允许字段（等价 ``forbidNonWhitelisted``）
_DISMISS_ALLOWED = {"eventId"}


def _service(request: Request):
    return request.app.state.earthquake


def _poll_service(request: Request):
    return request.app.state.eew_poll


def _global_service(request: Request):
    return request.app.state.earthquake_global


class DismissEarthquakeDto(BaseModel):
    """``POST /earthquake/dismiss`` 请求体（校验文案与 Nest DTO 一致）。"""

    model_config = ConfigDict(extra="ignore")

    eventId: Any = None

    @model_validator(mode="before")
    @classmethod
    def _validate_like_nest(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        errors: list[str] = []
        for key in data:
            if key not in _DISMISS_ALLOWED:
                errors.append(f"property {key} should not exist")
        event_id = data.get("eventId")
        # class-validator：undefined/null 只触发 always 类校验（IsNotEmpty）
        if event_id is None:
            errors.append("eventId 必填")
        elif isinstance(event_id, str):
            if not event_id:
                errors.append("eventId 必填")
        else:
            errors.append("eventId 须为字符串")
        if errors:
            raise ValueError("；".join(errors))
        return data


@router.post("/test")
async def test_earthquake(request: Request, user: dict[str, Any] = Depends(require_roles("admin"))):
    """触发模拟演练预警（仅管理员；3 秒后触发）。"""
    _ = user
    logger.info("🧪 地震测试端点被调用.将在 3 秒后触发模拟警报...")
    service = _service(request)
    await service.ensure_runtime_config(force=True)
    cfg = service.get_runtime_config()
    if not cfg.enabled:
        logger.warning("配置中已禁用 EEW;若已配置坐标,测试仍会触发")
    await asyncio.sleep(SIMULATION_TRIGGER_DELAY_MS / 1000)
    result = await service.try_fire_simulated_alert()
    if not result.get("ok"):
        raise BusinessException(
            ErrorCode.SERVICE_UNAVAILABLE, str(result.get("message") or "模拟演练失败")
        )
    return {"success": True, "message": "模拟地震预警已触发。"}


async def _build_status(request: Request) -> dict[str, Any]:
    service = _service(request)
    await service.ensure_runtime_config()
    coords = service.get_home_coordinates()
    runtime = service.get_runtime_config()
    leader = service.get_leader_status()
    if runtime.enabled and leader.get("isLeader"):
        poll = _poll_service(request)
        if poll is not None:
            try:
                await poll.poll_now()
            except Exception:
                pass
    wolfx = await service.get_cluster_connection_status()
    diagnostics = service.get_diagnostics_snapshot()
    has_poll_stamp = any(
        source.get("id") != "usgs" and (source.get("lastPollAt") or source.get("lastSuccessAt"))
        for source in diagnostics.get("sources", [])
    )
    hint: str | None = None
    if not runtime.enabled:
        hint = "地震预警未启用：打开开关后点「保存地震预警」，才会连接 Wolfx 并轮询 SC/CENC。"
    elif not leader.get("isLeader"):
        hint = (
            "本实例不是 EEW Leader：Wolfx 连接与 SC/CENC 轮询由集群主节点执行；"
            "此处显示「待命」且无时间戳是预期行为。"
        )
    elif not has_poll_stamp:
        hint = (
            "已启用且本机为 Leader，但尚未记录到轮询时间。请点「刷新」；"
            "若仍为空，请检查本机访问 api.wolfx.jp 是否超时。"
        )
    return {
        "connected": wolfx.get("clusterConnected"),
        "wolfx": wolfx,
        "leader": leader,
        "activeEventId": service.get_active_event_id(),
        "homeCoordinates": coords,
        "enabled": runtime.enabled,
        "hint": hint,
        "thresholds": {
            "minMagnitude": runtime.min_magnitude,
            "maxDistance": runtime.max_distance,
            "minLocalIntensity": runtime.min_local_intensity,
        },
        "sources": diagnostics.get("sources", []),
        "recentFilters": diagnostics.get("recentFilters", []),
    }


@router.get("/status")
async def get_status_get(request: Request, user: dict[str, Any] = Depends(require_user)):
    """获取 EEW 状态（GET 入口）。"""
    _ = user
    return await _build_status(request)


@router.post("/status")
async def get_status(request: Request, user: dict[str, Any] = Depends(require_user)):
    """获取 EEW 状态（POST 入口）。"""
    _ = user
    return await _build_status(request)


@router.get("/latest")
async def get_latest_alert(request: Request, user: dict[str, Any] = Depends(require_user)):
    """获取最新预警（含 isActive / payload 字段）。"""
    _ = user
    return await _service(request).resolve_latest_alert()


@router.get("/history")
async def get_alert_history(request: Request, user: dict[str, Any] = Depends(require_user)):
    """获取最近 50 条预警历史（数据库优先，回退 Redis）。"""
    _ = user
    return await _service(request).get_alert_history(50)


@router.delete("/history/simulation")
async def delete_simulation_history(
    request: Request,
    eventId: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    """删除模拟演练本地预警；``eventId`` 指定单条，省略则清除全部演练。"""
    _ = user
    from ..services.earthquake.geo import is_eew_simulation_event_id

    target = str(eventId or "").strip()
    if target and not is_eew_simulation_event_id(target):
        raise BusinessException(
            ErrorCode.VALIDATION_FAILED, "仅可删除模拟演练记录（eventId 以 test_ 开头）"
        )
    result = await _service(request).delete_simulation_history(target or None)
    deleted = int(result.get("deleted") or 0)
    if target:
        message = "已删除该演练记录" if deleted else "未找到对应演练记录"
    else:
        message = f"已清除 {deleted} 条演练记录" if deleted else "暂无演练记录"
    return {"success": True, "deleted": deleted, "message": message}


@router.get("/global")
async def get_global_earthquakes(
    request: Request,
    source: str | None = Query(default=None),
    period: str | None = Query(default=None),
    minMag: str | None = Query(default=None),
    limit: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_user),
):
    """获取全球 / 区域地震目录（CENC / USGS）。"""
    _ = user
    return await _global_service(request).get_recent_feed(
        {
            "source": source,
            "period": period,
            "minMagnitude": _number_or_none(minMag),
            "limit": _number_or_none(limit),
        }
    )


@router.post("/dismiss")
async def dismiss_alert(
    dto: DismissEarthquakeDto,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    """关闭指定预警（标记 dismissed 并清除最新预警与去重状态）。"""
    _ = user
    return await _service(request).acknowledge_alert(str(dto.eventId).strip())


@router.get("/ha-config")
async def get_ha_config(request: Request, user: dict[str, Any] = Depends(require_roles("admin"))):
    """获取 HA 系统配置中的坐标（仅 admin）。"""
    _ = user
    coords = await _service(request).get_ha_coordinates_only()
    if coords.get("latitude") is None or coords.get("longitude") is None:
        raise BusinessException(ErrorCode.CONFIG_ERROR, "HA 未配置坐标或坐标无效")
    return {"success": True, "data": coords}


def _number_or_none(raw: Any) -> float | None:
    """复刻 Nest ``minMag != null ? Number(minMag) : undefined``。"""
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return float("nan")


__all__ = ["DismissEarthquakeDto", "router"]
