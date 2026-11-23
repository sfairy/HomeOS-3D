"""设备画像路由（``/api/v1/device-profiles/*``）。

- 画像列表（可按域 / 待确认 / 关键字过滤）、刷新、确认、撤销确认、只改别名；
- 人工确认审计；
- 房间默认媒体设备（音箱 / Apple TV / 电视）；
- Apple TV 应用唤起与休眠。

所有写操作都要求登录；能力码跟随 ``FEATURE_AGENT``（画像服务于语音与管家选目标）。
失败一律用 4xx 表达：``tv/open`` 与 ``tv/suspend`` 以前回 200 + ``success: false``，
前端与脚本只能靠解析 body 判断，和其余接口不一致。
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from .router import NestRouter
from .schemas.base import ResponseModel
from ..dependencies import license_feature
from ..domains.license import features as feature_codes
from ..platform.core.http.errors import BusinessException, ErrorCode
from ..platform.security.auth_context import require_user

router = NestRouter(
    prefix="/device-profiles",
    tags=["agent"],
    dependencies=[license_feature(feature_codes.FEATURE_AGENT)],
)


def _service(request: Request) -> Any:
    service = getattr(request.app.state, "device_profiles", None)
    if service is None:
        raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, "设备画像未启用")
    return service


class ConfirmProfileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entityId: str = Field(min_length=3, max_length=255)
    kind: str = Field(min_length=1, max_length=32)
    aliases: list[str] | None = None


class ConfirmBatchRequest(BaseModel):
    """批量确认：同一批实体确认成同一类型（空调 6 台逐台点太慢）。

    ``entityIds`` 由前端多选得出；服务端**逐台**走与单台确认完全相同的校验与审计，
    只是把它们收在一次请求里。任何一台失败都不影响其余（结果里如实列出失败原因）。
    """

    model_config = ConfigDict(extra="forbid")

    entityIds: list[str] = Field(min_length=1, max_length=200)
    kind: str = Field(min_length=1, max_length=32)


class AliasesRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entityId: str = Field(min_length=3, max_length=255)
    aliases: list[str] = Field(default_factory=list, max_length=40)


class DefaultProfileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    areaId: str = Field(min_length=1, max_length=255)
    kind: str = Field(min_length=1, max_length=32)
    entityId: str | None = Field(default=None, max_length=255)
    maPlayerId: str | None = Field(default=None, max_length=255)


class TvAppRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entityId: str = Field(min_length=3, max_length=255)
    app: str = Field(min_length=1, max_length=80)


class TvEntityRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entityId: str = Field(min_length=3, max_length=255)


class DeviceProfileItem(ResponseModel):
    """画像列表项。

    字段集与 `DeviceProfileService.list` 的返回**逐条对齐**，并用 `ResponseModel`
    （`extra="ignore"`）：服务端多返回的键被忽略而不是把请求打成 500；少声明的字段
    由 `ops/checks/unittests/test_device_profile_schema.py` 的键集断言发现。
    """

    entityId: str
    domain: str
    kind: str
    confidence: float
    confirmed: bool
    source: str
    aliases: list[str]
    evidence: list[str]
    available: bool
    usable: bool
    state: str
    name: str
    areaId: str
    areaName: str
    lastSeenAt: str | None
    lastClassifiedAt: str | None


class DeviceProfileListResponse(ResponseModel):
    items: list[DeviceProfileItem]


class DeviceProfileAuditItem(ResponseModel):
    """人工确认审计条目（字段同样与 `service.audit` 对齐）。"""

    id: str
    entityId: str
    action: str
    fromKind: str
    toKind: str
    aliases: list[str]
    actor: str
    createdAt: str | None


class DeviceProfileAuditResponse(ResponseModel):
    items: list[DeviceProfileAuditItem]


def _actor_of(user: dict[str, Any]) -> str:
    """审计里的操作者：优先用户名，退到 id。"""
    return str(user.get("username") or user.get("userId") or user.get("id") or "")


@router.get("", response_model=DeviceProfileListResponse)
async def list_profiles(
    request: Request,
    areaId: str | None = Query(default=None),
    domain: str | None = Query(default=None, pattern="^(media_player|climate|water_heater)$"),
    pending: bool = Query(default=False, description="只看待确认的设备"),
    q: str | None = Query(default=None, max_length=64, description="按名称 / 实体 ID / 别名过滤"),
    user: dict[str, Any] = Depends(require_user),
):
    service = _service(request)
    items = await asyncio.to_thread(service.list, areaId, domain=domain, pending_only=pending, query=q)
    return {"items": items}


@router.post("/refresh")
async def refresh_profiles(request: Request, user: dict[str, Any] = Depends(require_user)):
    service = _service(request)
    return {"success": True, **(await asyncio.to_thread(service.refresh))}


@router.get("/audit", response_model=DeviceProfileAuditResponse)
async def list_audit(
    request: Request,
    entityId: str | None = Query(default=None, min_length=3),
    limit: int = Query(default=50, ge=1, le=200),
    user: dict[str, Any] = Depends(require_user),
):
    service = _service(request)
    return {"items": await asyncio.to_thread(service.audit, entityId, limit)}


@router.put("/confirm")
async def confirm_profile(
    payload: ConfirmProfileRequest, request: Request, user: dict[str, Any] = Depends(require_user)
):
    service = _service(request)
    result = await asyncio.to_thread(
        service.confirm, payload.entityId, payload.kind, payload.aliases, actor=_actor_of(user)
    )
    if not result.get("success"):
        raise BusinessException(ErrorCode.VALIDATION_FAILED, str(result.get("message") or "确认失败"))
    return result


@router.put("/confirm-batch")
async def confirm_profiles_batch(
    payload: ConfirmBatchRequest, request: Request, user: dict[str, Any] = Depends(require_user)
):
    """批量确认同一类型的多台设备。

    逐台复用 :meth:`confirm`（同一套 kind 校验、可用性检查与人工确认审计），
    失败的单台不阻断其余；``confirmed`` / ``failed`` 都如实返回，界面据此提示
    「已确认 5 台，2 台不可用」。
    """
    service = _service(request)
    actor = _actor_of(user)
    confirmed: list[str] = []
    failed: list[dict[str, str]] = []
    for entity_id in dict.fromkeys(payload.entityIds):  # 去重且保持顺序
        result = await asyncio.to_thread(service.confirm, entity_id, payload.kind, None, actor=actor)
        if result.get("success"):
            confirmed.append(entity_id)
        else:
            failed.append({"entityId": entity_id, "message": str(result.get("message") or "确认失败")})
    if not confirmed and failed:
        # 全失败按第一台的原文报错：前端原有的单台提示逻辑可以继续复用。
        raise BusinessException(ErrorCode.VALIDATION_FAILED, failed[0]["message"])
    return {"success": True, "kind": payload.kind, "confirmed": confirmed, "failed": failed}


@router.put("/aliases")
async def set_aliases(payload: AliasesRequest, request: Request, user: dict[str, Any] = Depends(require_user)):
    """只改别名：不再用「确认类型」的接口顺带写别名（会把已确认状态一起改写）。"""
    service = _service(request)
    result = await asyncio.to_thread(service.set_aliases, payload.entityId, payload.aliases, actor=_actor_of(user))
    if not result.get("success"):
        raise BusinessException(ErrorCode.VALIDATION_FAILED, str(result.get("message") or "保存别名失败"))
    return result


@router.delete("/confirmation")
async def clear_confirmation(
    request: Request,
    entityId: str = Query(min_length=3),
    keepAliases: bool = Query(default=True, description="撤销确认时保留用户教过的别名"),
    user: dict[str, Any] = Depends(require_user),
):
    service = _service(request)
    result = await asyncio.to_thread(
        service.clear_confirmation, entityId, keep_aliases=keepAliases, actor=_actor_of(user)
    )
    if not result.get("success"):
        raise BusinessException(ErrorCode.NOT_FOUND, str(result.get("message") or "没有这台设备的画像"))
    return result


@router.get("/defaults")
async def list_defaults(
    request: Request,
    areaId: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_user),
):
    service = _service(request)
    return {"items": await asyncio.to_thread(service.defaults, areaId)}


@router.put("/defaults")
async def set_default(payload: DefaultProfileRequest, request: Request, user: dict[str, Any] = Depends(require_user)):
    service = _service(request)
    result = await asyncio.to_thread(
        service.set_default,
        payload.areaId,
        payload.kind,
        entity_id=payload.entityId,
        ma_player_id=payload.maPlayerId,
    )
    if not result.get("success"):
        raise BusinessException(ErrorCode.VALIDATION_FAILED, str(result.get("message") or "保存失败"))
    return result


@router.delete("/defaults")
async def delete_default(
    request: Request,
    areaId: str = Query(min_length=1),
    kind: str = Query(min_length=1),
    user: dict[str, Any] = Depends(require_user),
):
    service = _service(request)
    result = await asyncio.to_thread(service.delete_default, areaId, kind)
    if not result.get("success"):
        raise BusinessException(ErrorCode.NOT_FOUND, str(result.get("message") or "没有这条默认设备"))
    return result


@router.post("/tv/open")
async def open_tv_app(payload: TvAppRequest, request: Request, user: dict[str, Any] = Depends(require_user)):
    result = await _service(request).open_tv_app(payload.entityId, payload.app)
    if not result.get("success"):
        raise BusinessException(ErrorCode.VALIDATION_FAILED, str(result.get("message") or "打开应用失败"))
    return result


@router.post("/tv/suspend")
async def suspend_tv(payload: TvEntityRequest, request: Request, user: dict[str, Any] = Depends(require_user)):
    result = await _service(request).suspend_tv(payload.entityId)
    if not result.get("success"):
        raise BusinessException(ErrorCode.VALIDATION_FAILED, str(result.get("message") or "待机失败"))
    return result
