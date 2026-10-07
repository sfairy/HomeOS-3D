"""商业授权路由（``/api/v1/license/*``）。

并入 homeos-3d 授权服务后，本模块只做「HTTP 适配」：把服务层的状态机查询、激活、
重新激活与显式重试暴露成 Nest 风格端点，错误按 ``LicenseClientError`` 的
``status_code`` / ``code`` 映射成统一错误信封。

限流沿用 homeos 的 ``rate_limit`` 依赖（激活 5 次/分钟、重试 10 次/分钟），与迁移前
的 ``LICENSE_ACTIVATION_LIMIT`` 语义一致。

鉴权口径（Phase 2b）：

- ``/availability`` —— **公开**。只下发门禁判定所需的粗粒度布尔与脱敏状态；未登录的
  首屏也要能读到它，才能决定该去激活页还是登录页。
- ``/status`` —— 要求**登录会话**。它带 ``instanceId`` / 激活邮箱 / 公钥指纹等标识，
  只应给已登录管理员；编辑器设置页的授权诊断也走这里。
- ``/activate`` —— **公开**，但要求**同源写**。未激活时可能还没有任何会话（会话随
  ``/auth/login`` 建立，而门禁会把登录页也送回激活页），激活入口必须对匿名可用。
- ``/reactivate`` / ``/retry`` —— 要求**登录会话** + **同源写**。

这里用 ``CurrentUser`` 而**不是** ``LicensedUser``：后两个端点正是「授权不可用时拿来
修复」的入口，用 ``LicensedUser`` 会在最需要它们的时候恒定 403。授权层级的限制由
``services/license/guard.py`` 的门禁中间件承担（该中间件对这几个路径豁免，见其模块注释）。
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict

from ..dependencies import CurrentUser
from ..security.limiter import rate_limit
from ..security.request_origin import require_same_origin_write
from ..services.license import LicenseClientError
from .router import NestRouter

router = NestRouter(prefix="/license", tags=["license"])


class ActivateDto(BaseModel):
    """激活请求体：Nest 侧为内联对象类型，未做白名单校验，故允许额外字段。"""

    model_config = ConfigDict(extra="allow")

    email: str | None = None
    activationCode: str | None = None


def _service(request: Request):
    return request.app.state.license_service


def _gating_flags(request: Request) -> dict[str, bool]:
    """门禁判定所需的粗粒度布尔：**不含**任何标识、凭证或原始错误。

    ``LicenseService.availability()`` 只额外给 ``displayAllowed``，而前端路由守卫还需要
    ``required`` / ``allowed`` 才能判断「这台机器是否需要激活、当前是否放行」。这三个布尔
    是公开信息（未激活门禁本身就会把它们暴露成 HTTP 行为），在这里补齐而不是改动
    ``service.py``，以便授权服务与上游保持逐字节可比。
    """
    service = _service(request)
    return {
        "required": bool(service.settings.license_required),
        "allowed": service.allows(),
        "editorAllowed": service.allows("editor"),
    }


@router.get("/status")
async def get_status(request: Request, user: CurrentUser) -> dict[str, Any]:
    """完整授权状态（要求登录会话）。"""
    service = _service(request)
    # 顺带做一次节流后的绑定确认（联网可用时），失败不阻塞状态查询。
    try:
        await service.confirm_binding(force=False)
    except LicenseClientError:
        pass
    return await asyncio.to_thread(service.status)


@router.get("/availability")
async def get_availability(request: Request) -> dict[str, Any]:
    """公开的授权可用性：脱敏状态 + 门禁布尔（匿名可读）。"""
    payload = _service(request).availability()
    payload.update(_gating_flags(request))
    return payload


@router.post("/activate", dependencies=[Depends(rate_limit(5, 60.0))])
async def activate(payload: ActivateDto, request: Request) -> dict[str, Any]:
    # 匿名可用但必须同源：未激活时还没有会话可依赖，来源校验是这里唯一的写保护。
    require_same_origin_write(request)
    try:
        return await _service(request).activate(
            payload.activationCode or "", payload.email or None
        )
    except LicenseClientError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error


@router.post("/reactivate", dependencies=[Depends(rate_limit(10, 60.0))])
async def reactivate(request: Request, user: CurrentUser) -> dict[str, Any]:
    require_same_origin_write(request)
    try:
        return await _service(request).reactivate()
    except LicenseClientError as error:
        raise HTTPException(
            status_code=error.status_code or status.HTTP_409_CONFLICT,
            detail={
                "code": error.code or "LICENSE_REACTIVATE_FAILED",
                "message": str(error),
            },
        ) from error


@router.post("/retry", dependencies=[Depends(rate_limit(10, 60.0))])
async def retry(request: Request, user: CurrentUser) -> dict[str, Any]:
    """显式重试当前实例的授权恢复（要求登录会话 + 同源写）。"""
    require_same_origin_write(request)
    service = _service(request)
    try:
        return await service.retry_now()
    except LicenseClientError as error:
        retryable = (
            error.code not in {"LICENSE_REAUTH_REQUIRED", "LICENSE_RETRY_THROTTLED"}
            and not error.is_confirmed_revocation
        )
        code = error.code or ("LICENSE_RETRYABLE" if retryable else "LICENSE_REAUTH_REQUIRED")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE
            if retryable
            else status.HTTP_409_CONFLICT,
            detail={"code": code, "message": str(error), "retryable": retryable},
        ) from error
