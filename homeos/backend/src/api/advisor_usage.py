"""顾问设备使用统计路由（``/api/v1/system/advisor/*``）。

对齐 Nest ``AdvisorUsageController``（路由前缀 ``system/``）：

- ``GET  system/advisor/report``：设备使用报告（7 天 Top10）；
- ``GET  system/advisor/usage/summary?days=``：使用统计汇总（含异常提示）；
- ``GET  system/advisor/usage/:entityId?days=``：单设备使用统计；
- ``POST system/advisor/report/clear``：清除统计记录（admin / adult）；
- ``GET  system/advisor/forgotten``：可能遗忘开启的设备列表。

路由声明顺序与 Nest 一致：``usage/summary`` 必须先于 ``usage/:entityId``。
"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, Query, Request, Response

from .router import NestRouter
from ..platform.core.http.errors import (
    BusinessException,
    ErrorCode,
    api_error,
    forbidden,
)
from ..platform.security.auth_context import get_current_user

router = NestRouter(prefix="/system", tags=["system"])

#: ``parseOptionalInt`` 语义：缺省/空串或非法值回退默认；``"7abc"`` → 7（对齐 JS parseInt）
_DEFAULT_DAYS = 7


def _parse_optional_int(value: str | None, fallback: int = _DEFAULT_DAYS) -> int:
    if not value:
        return fallback
    text = str(value).lstrip()
    sign = 1
    if text.startswith(("+", "-")):
        sign = -1 if text[0] == "-" else 1
        text = text[1:]
    digits = ""
    for char in text:
        if char.isdigit():
            digits += char
        else:
            break
    if not digits:
        return fallback
    return sign * int(digits)


def require_advisor_user(
    request: Request, response: Response
) -> dict[str, Any]:
    """顾问用量门禁：未登录 → **403**（ADV-03），不伪造空报告。

    复用 ``get_current_user`` 的会话解析与缓存；仅把 UNAUTHORIZED(401)
    改写成 Forbidden，其余业务异常原样抛出。
    """
    try:
        return get_current_user(request, response)
    except BusinessException as exc:
        if exc.error_code == ErrorCode.UNAUTHORIZED:
            forbidden(api_error("ACCESS_LOGIN_REQUIRED"))
        raise


def _advisor(request: Request):
    return request.app.state.advisor_usage


@router.get("/advisor/report")
async def get_advisor_usage_report(
    request: Request, user: dict[str, Any] = Depends(require_advisor_user)
):
    return await _advisor(request).get_usage_report()


@router.get("/advisor/usage/summary")
async def get_advisor_usage_summary(
    request: Request,
    days: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_advisor_user),
):
    return await _advisor(request).get_usage_summary(_parse_optional_int(days))


@router.get("/advisor/usage/{entity_id}")
async def get_advisor_entity_usage(
    entity_id: str,
    request: Request,
    days: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_advisor_user),
):
    return await _advisor(request).get_entity_usage(entity_id, _parse_optional_int(days))


@router.post("/advisor/report/clear")
async def clear_advisor_usage_report(
    request: Request, user: dict[str, Any] = Depends(require_advisor_user)
):
    return await _advisor(request).clear_usage_stats()


@router.get("/advisor/forgotten")
async def get_advisor_forgotten_devices(
    request: Request, user: dict[str, Any] = Depends(require_advisor_user)
):
    return await _advisor(request).get_forgotten_devices()
