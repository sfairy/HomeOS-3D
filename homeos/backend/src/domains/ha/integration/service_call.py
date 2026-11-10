"""HA 服务调用（``/ha/services/call``）的**唯一执行出口**（原先整段住在 ``api/ha.py``）。

为什么下沉到域内：``api/ha.py`` 与 3D 增量模块（``modules/interaction3d/api.py``）都要下发
HA 服务调用。原先 3D 模块直接 ``from ...api.ha.routes import call_service`` 复用路由处理函数 ——
``modules → api`` 是反向依赖（路由层是入口，不是库），而且复用的是一个**带 FastAPI 依赖注入
签名**的处理函数，等于把 HTTP 层当成业务库用。

这里的切法：**校验 + 下发**进本模块，HTTP 语义留在 api 层。

- 校验失败用 ``ServiceCallRejected``（携带 ``status_code`` + ``detail``）表达 ——
  域内不 import FastAPI，但保留原有的**状态码与文案**，由 api 侧一行转成 ``HTTPException``，
  响应体字节级不变（前端与冒烟脚本依赖这些文案，不能顺手换错误码体系）。
- 实体级 ACL 是占位钩子（``platform.security.viewer_scope.require_viewer_entity``，当前恒放行），
  故以 ``access_check`` 回调注入，避免域内 import ``dependencies``。
"""

from __future__ import annotations

import asyncio
import traceback
from collections.abc import Callable
from typing import Any, Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from .client import HAClientError
from .connection_query import active_connection
from .crypto import CredentialCipherError
from ...license import features as feature_codes
from ...proxy.command_proxy import build_service_call_dto, dispatch_service_call
from ...proxy.command_proxy_auth import RegistryTargetResolver, assert_command_proxy_authorized
from ....platform.core.db.database import Database
from ....platform.core.db.models import HAConnection, HAEntity
from ....platform.core.ha.service_payload_rules import (
    ServicePayloadRejected,
    validate_service_payload,
)
from ....platform.core.http.errors import BusinessException


class ServiceCallPayload(Protocol):
    """服务调用入参的**结构**契约（不 import ``schemas``：域层不认识 HTTP 契约模块）。

    ``api`` 侧传进来的就是 ``schemas.HAServiceCallRequest`` —— 它天然满足这个协议；
    这里只声明本模块真正读的四个字段，于是「域层不用为了一个类型注解去 import 上层」。
    """

    domain: str
    service: str
    entity_id: str
    data: dict[str, Any]
    #: 同一手势的幂等键（可选）。只有带键的调用才会被 ``CommandProxyService`` 去重，
    #: 这样「连按两次」仍会执行两次，而「同一请求被重发」只执行一次。
    idempotency_key: str | None


#: 域内表达 HTTP 结果用的状态码（与 FastAPI ``status`` 同值，但不 import 它）。
_FORBIDDEN = 403
_UNPROCESSABLE = 422
_CONFLICT = 409
_NOT_FOUND = 404
_BAD_GATEWAY = 502


class ServiceCallRejected(Exception):
    """服务调用被拒：``status_code`` + ``detail`` 由 api 层原样转成 ``HTTPException``。"""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def ha_entity_conditions(
    connection_id: str,
    entity_id: str,
    *,
    domain: str | None = None,
    enabled_only: bool = True,
) -> list[ColumnElement[bool]]:
    """HA 实体「本连接下存在且可用」的**唯一判定口径**。

    三处旧实现（本模块的 ``load_ha_entity_context``、``api/ha.py`` 的
    ``load_authorized_entity_context``、``modules/interaction3d/api.py`` 的
    ``_read_connection_and_entity``）条件一致但各写一遍：漏一个条件就是
    「已禁用 / 已失联的实体仍被当成可用」，线上排查时极难发现。
    这里只留一份，参数化差异点：

    - ``domain``：3D 控制路径按域校验（``light.living_room`` 不能冒充 ``cover``）。
    - ``enabled_only``：配置校验（保存模式 / 绑定面板）必须允许**已禁用**实体——否则
      用户连「把这台设备删掉」都做不到；运行时控制路径才要求未禁用。
    """
    conditions: list[ColumnElement[bool]] = [
        HAEntity.connection_id == connection_id,
        HAEntity.entity_id == entity_id,
        HAEntity.sync_status == "active",
    ]
    if domain is not None:
        conditions.append(HAEntity.domain == domain)
    if enabled_only:
        conditions.append(HAEntity.disabled_by.is_(None))
    return conditions


def load_ha_entity_context(
    database_manager: Database,
    entity_id: str,
    access_check: Callable[[Session, str], None] | None = None,
    *,
    enabled_only: bool = True,
    domain: str | None = None,
) -> tuple[HAConnection | None, bool]:
    """连接 + 「实体是否可用」一次读完（同会话，避免两次开库）。

    ``access_check`` 是实体级 ACL 的注入点：api 层传入 ``require_viewer_entity``
    （占位实现，恒放行），域内因此不需要认识查看者类型。
    """
    with database_manager.session_factory() as database:
        if access_check is not None:
            access_check(database, entity_id)
        connection = active_connection(database)
        if connection is None:
            return None, False
        entity_exists = (
            database.scalar(
                select(HAEntity.id).where(
                    *ha_entity_conditions(connection.id, entity_id, domain=domain, enabled_only=enabled_only)
                )
            )
            is not None
        )
        database.expunge(connection)
        return connection, entity_exists


def _validate_service_call(payload: ServiceCallPayload) -> None:
    """白名单 + 参数字段 + 灯光参数 + 域匹配。

    实现在 ``platform/core/ha/service_payload_rules.py``，与命令代理出口（``/services/call``
    / 语音 / 管家工具）共用同一份判据。这里只负责把领域异常翻回本模块原有的
    ``ServiceCallRejected``（状态码与文案逐字不变，前端与冒烟脚本依赖它们）。
    """
    try:
        validate_service_payload(
            payload.domain,
            payload.service,
            payload.data,
            payload.entity_id,
            policy="http",
        )
    except ServicePayloadRejected as rejected:
        raise ServiceCallRejected(rejected.status_code, rejected.detail) from rejected


async def execute_service_call(
    request: Any,
    payload: ServiceCallPayload,
    *,
    access_check: Callable[[Session, str], None] | None = None,
) -> dict[str, Any]:
    """校验并发下发一次 HA 服务调用；被拒时抛 ``ServiceCallRejected``。

    ``request`` 是 Starlette ``Request``（只读 ``app.state`` / 写 ``state``），
    故不引 FastAPI 类型 —— 但保持与原先相同的诊断日志与状态码语义。
    """
    if not await asyncio.to_thread(request.app.state.license_service.allows, feature_codes.FEATURE_HA_CONTROL):
        raise ServiceCallRejected(_FORBIDDEN, "当前授权不允许控制 Home Assistant。")
    _validate_service_call(payload)
    connection, entity_exists = await asyncio.to_thread(
        load_ha_entity_context,
        request.app.state.database,
        payload.entity_id,
        access_check,
    )
    if connection is None:
        raise ServiceCallRejected(_CONFLICT, "请先配置 Home Assistant 连接。")
    if not entity_exists:
        raise ServiceCallRejected(_NOT_FOUND, "实体不存在、已禁用或已失联。")
    # 与 ``/services/call`` 共用实体级白名单（当前恒为空 → 恒放行）。
    await assert_command_proxy_authorized(
        {
            "domain": payload.domain,
            "service": payload.service,
            "entity_id": payload.entity_id,
            "service_data": payload.data,
        },
        None,
        RegistryTargetResolver(request),
    )
    try:
        # 唯一执行出口：CommandProxyService（幂等去重 → 高风险拦截 → HA 下发）。
        envelope = await dispatch_service_call(
            request.app.state.command_proxy,
            build_service_call_dto(
                domain=payload.domain,
                service=payload.service,
                entity_id=payload.entity_id,
                service_data=payload.data,
                idempotency_key=payload.idempotency_key,
            ),
        )
        result = envelope.get("data") if isinstance(envelope, dict) else envelope
        # 后置校验结果必须跟着响应回前端：此前这里只取 ``data`` 就返回，把
        # ``verified`` / ``verification`` / ``skipped`` / ``pending`` 全部丢掉了 ——
        # 于是 3D 面板走的本接口永远「看起来成功」，和 `/services/call` 的行为不一致。
        verification_fields = {
            key: envelope[key]
            for key in ("verified", "verification", "skipped", "pending", "replayed")
            if isinstance(envelope, dict) and key in envelope
        }
    except (BusinessException, HAClientError, CredentialCipherError) as error:
        request.state.diagnostic_error_logged = True
        request.app.state.global_log.append(
            "error",
            "仪表盘编辑器",
            "设备操作",
            f"操作失败：{payload.entity_id} · {payload.domain}.{payload.service} · {error}",
            context={
                "entityId": payload.entity_id,
                "service": f"{payload.domain}.{payload.service}",
                "status": _BAD_GATEWAY,
            },
            details=traceback.format_exc(),
        )
        raise ServiceCallRejected(_BAD_GATEWAY, str(error)) from error
    request.app.state.global_log.append(
        "success" if verification_fields.get("verified") is not False else "warning",
        "仪表盘编辑器",
        "设备操作",
        f"操作成功：{payload.entity_id} · {payload.domain}.{payload.service}"
        + ("（已下发，状态未确认）" if verification_fields.get("verified") is False else ""),
        context={
            "entityId": payload.entity_id,
            "service": f"{payload.domain}.{payload.service}",
            **({"verified": False} if verification_fields.get("verified") is False else {}),
        },
    )
    return {"ok": True, "result": result, **verification_fields}


__all__ = ["ServiceCallPayload", "ServiceCallRejected", "execute_service_call", "load_ha_entity_context"]
