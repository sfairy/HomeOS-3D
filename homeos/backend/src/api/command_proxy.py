"""命令代理路由（``/api/v1/services/call``）。

命令下发只有一条实现通道：``/services/call``、``/ha/services/call`` 与
``/modules/interaction3d/control`` 三条 HTTP 入口各自保留校验（实体白名单 /
license + 服务白名单 / 3D 绑定校验），执行统一走
``services.proxy.command_proxy.dispatch_service_call`` —— 幂等去重 → HA 未连接时拦截高风险
→ 连接器下发。

HA 媒体 / 流走同源挂载的 ``/api/camera_proxy*``、``/api/hls`` 等路径，WebRTC 走
``api/ha_webrtc.py``（经 ``studio_ha`` WebSocket 转 ``camera/webrtc/*``）。
"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, Request

from .router import NestRouter
from .schemas.command_proxy import CallServiceDto
from ..domains.proxy.command_proxy import dispatch_service_call
from ..domains.proxy.command_proxy_auth import RegistryTargetResolver, assert_command_proxy_authorized
from ..platform.security.auth_context import require_user

router = NestRouter(tags=["connect"])


def _proxy(request: Request):
    return request.app.state.command_proxy


# services/call
@router.post("/services/call")
async def call_service(
    payload: CallServiceDto,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    # 唯一入口校验：homeos 实体级 ACL（域 / 白名单 / 间接目标展开）。
    dto = payload.model_dump()
    await assert_command_proxy_authorized(dto, user, RegistryTargetResolver(request))
    # 唯一执行出口：CommandProxyService（幂等去重 → 高风险拦截 → HA 下发）。
    return await dispatch_service_call(_proxy(request), dto)
