"""命令代理路由（``/api/v1/services/call``）。

命令下发只有一条实现通道：``/services/call``、``/ha/services/call`` 与
``/modules/interaction3d/control`` 三条 HTTP 入口各自保留校验（实体白名单 /
license + 服务白名单 / 3D 绑定校验），执行统一走
``services.proxy.command_proxy.dispatch_service_call`` —— 幂等去重 → HA 未连接时拦截高风险
→ 连接器下发。

三条入口的**准入判据必须等价**，否则就出现「校验 A、下发 B」：这条入口历史上只做
登录 + 恒放行的实体 ACL，既不查许可、也不查连接与实体是否存在，于是
「许可不含 HA 控制」「实体已删除 / 被禁用」都照样打到 HA 并返回成功。这里补齐，
顺序与 ``/ha/services/call`` 保持一致（license → 白名单 → 连接 → 实体）。

HA 媒体 / 流走同源挂载的 ``/api/camera_proxy*``、``/api/hls`` 等路径，WebRTC 走
``api/ha_webrtc.py``（经 ``studio_ha`` WebSocket 转 ``camera/webrtc/*``）。
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

from fastapi import Depends, HTTPException, Request

from ..router import NestRouter
from ..schemas.command_proxy import BatchCallServiceDto, CallServiceDto
from ...domains.agent.runtime.attribution import mark_local_control_for_request
from ...domains.ha.integration.service_call import load_ha_entity_context
from ...domains.license import features as feature_codes
from ...domains.proxy.batch import run_batch
from ...domains.proxy.command_proxy import (
    build_control_result,
    build_service_call_dto,
    dispatch_service_call,
)
from ...domains.proxy.command_proxy_auth import RegistryTargetResolver, assert_command_proxy_authorized
from ...platform.core.http.errors import BusinessException
from ...platform.security.auth_context import require_user

logger = logging.getLogger("homeos.api.command_proxy")

router = NestRouter(tags=["connect"])

_FORBIDDEN = 403
_CONFLICT = 409
_NOT_FOUND = 404
_BAD_GATEWAY = 502


#: 应急开关：设为 ``0`` 时跳过「许可 + 连接 + 实体」三层校验（DTO 收紧仍然生效）。
#: 只用于线上排障，正常部署不要设置。
STRICT_ENTRY_ENV = "HOMEOS_SERVICES_CALL_STRICT"


def _strict_entry_enabled() -> bool:
    raw = os.getenv(STRICT_ENTRY_ENV)
    return raw is None or raw.strip().lower() not in {"0", "false", "no", "off"}


def _proxy(request: Request):
    return request.app.state.command_proxy


async def _assert_control_allowed(request: Request, dto: dict[str, Any]) -> None:
    """许可 + 连接 + 实体存在性（与 ``/ha/services/call`` 同一套判据）。

    与那条入口的区别只有错误表达：这里抛 ``HTTPException``（本路由历史就是 FastAPI
    语义），域内则用 ``ServiceCallRejected``。判据本身不复制第二份。
    """
    license_service = getattr(request.app.state, "license_service", None)
    if license_service is not None:
        allowed = await asyncio.to_thread(license_service.allows, feature_codes.FEATURE_HA_CONTROL)
        if not allowed:
            raise HTTPException(status_code=_FORBIDDEN, detail="当前授权不允许控制 Home Assistant。")

    database = getattr(request.app.state, "database", None)
    if database is None:
        return
    connection, entity_exists = await asyncio.to_thread(
        load_ha_entity_context,
        database,
        dto["entity_id"],
    )
    if connection is None:
        raise HTTPException(status_code=_CONFLICT, detail="请先配置 Home Assistant 连接。")
    if not entity_exists:
        # 不存在的实体照样发给 HA 时，HA 会返回 200 并静默跳过该实体 —— 前端看到的
        # 就是「操作成功但设备没动」。在这里直接挡住。
        raise HTTPException(status_code=_NOT_FOUND, detail="实体不存在、已禁用或已失联。")


# services/call
@router.post("/services/call")
async def call_service(
    payload: CallServiceDto,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    dto = _dto_of(payload)
    await _authorize_all(request, user, [dto])
    try:
        envelope = await dispatch_service_call(_proxy(request), dto)
    except BusinessException as error:
        # 域内错误保持既有映射（SERVICE_UNAVAILABLE / VALIDATION_FAILED 等），
        # 只有上游 HA 的「未分类失败」统一成 502 —— 与 /ha/services/call 一致。
        raise _control_http_error(error) from error
    _mark_agent_local_control(request, dto["entity_id"])
    return build_control_result(envelope)


# services/batch
@router.post("/services/batch")
async def call_service_batch(
    payload: BatchCallServiceDto,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    """批量下发：整批先校验（任一条不合格即整批拒绝），再限并发执行。"""
    dtos = [_dto_of(item) for item in payload.items]
    await _authorize_all(request, user, dtos)
    return await run_batch(
        _proxy(request),
        dtos,
        concurrency=payload.concurrency,
        cancel_on_error=bool(payload.cancelOnError),
    )


def _dto_of(payload: CallServiceDto) -> dict[str, Any]:
    return build_service_call_dto(
        domain=payload.domain,
        service=payload.service,
        entity_id=payload.entity_id,
        service_data=payload.service_data,
        return_response=bool(payload.return_response),
        idempotency_key=payload.idempotency_key,
    )


async def _authorize_all(request: Request, user: dict[str, Any], dtos: list[dict[str, Any]]) -> None:
    """逐条做实体 ACL + 许可/连接/实体校验；任一条失败即整批拒绝。

    整批拒绝（而不是「能过的先发」）是刻意的：批量关灯只关一半，比整批失败更难解释，
    用户也无法从结果里判断哪些设备真的没关。
    """
    resolver = RegistryTargetResolver(request)
    strict = _strict_entry_enabled()
    for dto in dtos:
        await assert_command_proxy_authorized(dto, user, resolver)
        if strict:
            await _assert_control_allowed(request, dto)


def _control_http_error(error: BusinessException) -> HTTPException | BusinessException:
    """把域内业务异常翻成本路由的 HTTP 结果（未分类失败统一 502）。"""
    status_code = getattr(error, "status_code", None)
    if status_code is None:
        return HTTPException(status_code=_BAD_GATEWAY, detail=str(error))
    return error


def _mark_agent_local_control(request: Request, entity_id: str) -> None:
    """把 App / 网页下发的控制标记成「手动操作」（实现见 ``agent.runtime.attribution``）。"""
    mark_local_control_for_request(request, entity_id)
