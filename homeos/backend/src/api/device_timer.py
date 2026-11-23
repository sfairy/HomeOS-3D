"""设备倒计时接口（``/api/v1/services/timer``）。

只暴露「设置 / 取消 / 列出」三件事，且**服务端是唯一真源**：前端展示的剩余时间也来自这里，
不自己计时。这样平板息屏、浏览器切后台、断线重连之后显示的剩余时间仍然是对的。
"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, Query, Request
from pydantic import BaseModel, Field

from .router import NestRouter
from ..platform.core.http.errors import bad_request
from ..platform.security.auth_context import require_user

router = NestRouter(tags=["services"])


class TimerCreateBody(BaseModel):
    entityId: str = Field(min_length=3, max_length=255)
    module: str = "default"
    service: str = "turn_off"
    seconds: float = Field(gt=0)
    data: dict[str, Any] | None = None


def _service(request: Request):
    service = getattr(request.app.state, "device_timer", None)
    if service is None:
        raise bad_request("设备倒计时服务未启用")
    return service


@router.get("/services/timer")
async def list_timers(request: Request, user: dict[str, Any] = Depends(require_user)):
    """列出全部倒计时（含剩余秒数）。"""
    return {"items": await _service(request).list_timers()}


@router.post("/services/timer", status_code=200)
async def create_timer(
    request: Request,
    body: TimerCreateBody,
    user: dict[str, Any] = Depends(require_user),
):
    """设置（或覆盖）某实体的倒计时。"""
    try:
        payload = await _service(request).set_timer(
            entity_id=body.entityId,
            service=body.service,
            seconds=body.seconds,
            service_data=body.data or {},
            created_by=str(user.get("username") or user.get("id") or "") or None,
        )
    except ValueError as error:
        raise bad_request(str(error)) from error
    return payload


@router.delete("/services/timer")
async def cancel_timer(
    request: Request,
    entity_id: str = Query(...),
    user: dict[str, Any] = Depends(require_user),
):
    """取消某实体的倒计时（不存在时返回 ``cancelled: false``，不报错）。"""
    cancelled = await _service(request).cancel(entity_id)
    return {"success": True, "cancelled": cancelled, "entityId": entity_id}


__all__ = ["router"]
