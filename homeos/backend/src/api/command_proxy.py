"""命令代理路由（``/api/v1/services/call``）。

**A6 收敛**：命令下发只有一条实现通道。``/services/call``、``/ha/services/call`` 与
``/modules/interaction3d/control`` 三条 HTTP 入口各自保留自己的校验（角色 ACL /
license + 服务白名单 / 3D 绑定校验），但执行统一走
``services.command_proxy.dispatch_service_call`` —— 幂等去重 → HA 未连接时拦截高风险
→ 连接器下发。三条入口不再各自调用连接器。

逐条对齐 Nest CommandProxyController：授权（role/白名单）→ 执行。

**阶段 3 变更**：原文件还承载 homeos 自研的 HA HTTP 面（``/ha/test-connection``、
``/ha/history``、``/ha/queue/*``、``/ha/webrtc/*``、``/ha/camera-hls``、``/ha/media-proxy``、
``/ha/stream-proxy``）。这些路径多数已由并入的 3D HA 路由（``src/api/ha.py``、``ha_proxy.py``）
提供 —— 媒体/流不再用 ``/ha/media-proxy?path=``，而是同源挂载
``/api/camera_proxy*``、``/api/hls`` 等（与 HA 路径一致）。若继续保留 query 式旧端点，
先注册的一方会把后者遮蔽，因此这里**下线**这些重复端点，本文件只保留 homeos 特有的命令通道。

例外（下线后没有等价替代，需另行处理，切勿再当作「已迁移」）：

- ``/ha/webrtc/*``：已由 ``api/ha_webrtc.py`` 承接（经 ``studio_ha`` WebSocket 转
  ``camera/webrtc/*``）。H265 摄像头依赖此路径；缺实现时前端只能降级到 HLS/MJPEG。

阶段 3.3 起不再有例外：设置页「测试连接」已改调权威端点 ``POST /ha/test``，
``/ha/test-connection`` 兼容层（``api/ha.py::test_connection_legacy``）随之删除。
"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, Request

from ..security.auth_context import require_roles
from ..services.command_proxy import dispatch_service_call
from ..services.command_proxy_auth import RegistryTargetResolver, assert_command_proxy_authorized
from .router import NestRouter
from .schemas.command_proxy import CallServiceDto

router = NestRouter(tags=["connect"])


def _proxy(request: Request):
    return request.app.state.command_proxy


# ---------------------------------------------------------------------- #
# services/call
# ---------------------------------------------------------------------- #
@router.post("/services/call")
async def call_service(
    payload: CallServiceDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult", "child")),
):
    # 唯一入口校验：homeos ACL（角色 / 域 / 白名单 / 间接目标展开）。
    dto = payload.model_dump()
    await assert_command_proxy_authorized(dto, user, RegistryTargetResolver(request))
    # 唯一执行出口：CommandProxyService（幂等去重 → 高风险拦截 → HA 下发）。
    return await dispatch_service_call(_proxy(request), dto)
