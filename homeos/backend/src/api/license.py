"""商业授权路由（``/api/v1/license/*``）。

对齐 Nest ``LicenseController``：
- ``GET  /license/status``   查询授权状态（含状态机 / 权益 / 租约时间 / 恢复信息）；
- ``POST /license/activate`` 激活授权（限流 5 次/分钟）；
- ``POST /license/retry``    显式重试续租 / 恢复（限流 10 次/分钟）。

三个端点均为 ``@Public()``（无需 JWT）。
"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, Request
from pydantic import BaseModel, ConfigDict

from ..security.limiter import rate_limit
from .router import NestRouter

router = NestRouter(prefix="/license", tags=["license"])


class ActivateDto(BaseModel):
    """激活请求体：Nest 侧为内联对象类型，未做白名单校验，故允许额外字段。"""

    model_config = ConfigDict(extra="allow")

    email: str | None = None
    activationCode: str | None = None


def _service(request: Request):
    return request.app.state.license


@router.get("/status")
async def get_status(request: Request) -> dict[str, Any]:
    return _service(request).get_activation_status()


@router.post("/activate", dependencies=[Depends(rate_limit(5, 60.0))])
async def activate(payload: ActivateDto, request: Request) -> dict[str, Any]:
    return await _service(request).activate(payload.email or "", payload.activationCode or "")


@router.post("/retry", dependencies=[Depends(rate_limit(10, 60.0))])
async def retry(request: Request) -> dict[str, Any]:
    return await _service(request).retry_now()
