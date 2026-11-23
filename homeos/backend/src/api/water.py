"""用水安全接口（``/api/v1/security/water/*``）。

只暴露「查看主水阀与实时用水」和「一键关阀 / 开阀」：漏水检测在后台监测器里完成，
这里不做判定，也不提供「自动关阀」开关 —— 自动关阀的误报代价是全屋断水，
必须由用户确认（见 ``domains/water/monitor`` 的说明）。
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import Depends, Request

from .router import NestRouter
from ..platform.core.http.errors import bad_request
from ..platform.security.auth_context import require_user

logger = logging.getLogger("homeos.api.water")

router = NestRouter(prefix="/security/water", tags=["security"])


def _valve(request: Request):
    service = getattr(request.app.state, "water_valve", None)
    if service is None:
        raise bad_request("用水安全服务未启用")
    return service


@router.get("/status")
async def get_water_status(request: Request, user: dict[str, Any] = Depends(require_user)):
    """主水阀与当前用水概况。"""
    store = getattr(request.app.state, "state_store", None)
    valve_service = getattr(request.app.state, "water_valve", None)
    configured = ""
    if valve_service is not None:
        try:
            configured = valve_service.resolve_valve()
        except Exception:
            # 未配置或配置非法：状态接口仍要能出「未配置主水阀」，不能整体 500。
            logger.debug("读取主水阀配置失败，按未配置处理", exc_info=True)
            configured = ""
    valve = store.get(configured) if store is not None and configured else None
    flows: list[dict[str, Any]] = []
    if store is not None:
        from ..domains.water.monitor import flow_lpm

        for entity in store.get_all():
            rate = flow_lpm(entity)
            if rate is None:
                continue
            attrs = entity.get("attributes") if isinstance(entity.get("attributes"), dict) else {}
            flows.append(
                {
                    "entityId": entity.get("entity_id"),
                    "name": attrs.get("friendly_name") or entity.get("entity_id"),
                    "lpm": round(rate, 2),
                }
            )
    usage = getattr(request.app.state, "water_usage", None)
    today_m3: float | None = None
    if usage is not None:
        from ..domains.water.usage import business_day

        meters = {item["entityId"] for item in flows} or set()
        # 水表可能不是流量传感器：从状态仓里补一遍。
        if store is not None:
            from ..domains.water.usage import meter_reading_m3

            meters |= {
                str(entity.get("entity_id")) for entity in store.get_all() if meter_reading_m3(entity) is not None
            }
        if meters:
            today_m3 = round(await asyncio.to_thread(usage.today_total, sorted(meters), business_day()), 3)
    return {
        "valveEntityId": configured,
        "valveState": (valve or {}).get("state") if isinstance(valve, dict) else None,
        "flows": flows,
        "todayCubicMeters": today_m3,
    }


@router.post("/close-valve", status_code=200)
async def close_valve(request: Request, user: dict[str, Any] = Depends(require_user)):
    """关闭主水阀（用户确认后执行，全程审计）。"""
    return await _valve(request).set_state(close=True, actor=str(user.get("username") or user.get("id") or "") or None)


@router.post("/open-valve", status_code=200)
async def open_valve(request: Request, user: dict[str, Any] = Depends(require_user)):
    """重新打开主水阀。"""
    return await _valve(request).set_state(close=False, actor=str(user.get("username") or user.get("id") or "") or None)


__all__ = ["router"]
