"""MoviePilot 透明代理路由（``/api/v1/system/moviepilot/*``）。

对齐 Nest ``MoviePilotProxyController``：
- 仅 GET / POST 透传，其他方法返回 405 ``{"message": "MoviePilot 代理仅支持 GET/POST"}``；
- 鉴权 JwtAuthGuard + RolesGuard(admin|adult)；
- 限定前缀 ``system/moviepilot/*``，避免 catch-all 抢占原生 system API。
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import Depends, Request
from fastapi.responses import Response

from ..dependencies import license_feature
from ..security.auth_context import require_roles
from ..services.license import features as feature_codes
from .router import NestRouter

router = NestRouter(
    prefix="/system/moviepilot",
    tags=["system"],
    dependencies=[license_feature(feature_codes.FEATURE_MEDIA)],
)

#: Nest ``@All('*path')`` 等价：透传以下方法（实际仅放行 GET/POST）
_PROXY_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]

_METHOD_NOT_ALLOWED_BODY = {"message": "MoviePilot 代理仅支持 GET/POST"}

async def proxy_moviepilot(
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    """透传请求到 MoviePilot 后端（子路径从 URL 前缀之后截取）。"""
    service = request.app.state.moviepilot_proxy
    method = (request.method or "GET").upper()
    if method not in ("GET", "POST"):
        # 仅允许 GET / POST，避免 MoviePilot 后端被误删数据
        return Response(
            content=json.dumps(_METHOD_NOT_ALLOWED_BODY, ensure_ascii=False),
            status_code=405,
            media_type="application/json",
        )
    mount = "/api/v1/system/moviepilot"
    path_only = request.url.path
    sub_path = path_only[len(mount) :].lstrip("/") if path_only.startswith(mount) else ""
    body: Any = None
    if method == "POST":
        body = await _read_json_body(request)
    result = await service.proxy_system_api(
        sub_path,
        method,
        dict(request.query_params),
        body,
        dict(request.headers),
    )
    return Response(
        content=result.body,
        status_code=result.status,
        media_type=(result.headers or {}).get("Content-Type", "application/json"),
    )

async def _read_json_body(request: Request) -> Any:
    """读取 JSON 请求体（空体 / 非 JSON 时返回 ``None``，对齐 Nest body 解析）。"""
    raw = await request.body()
    if not raw:
        return None
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return None

# Nest ``@All('*path')`` 同时匹配根路径与任意子路径
router.add_api_route("", proxy_moviepilot, methods=_PROXY_METHODS)
router.add_api_route("/", proxy_moviepilot, methods=_PROXY_METHODS)
router.add_api_route("/{sub_path:path}", proxy_moviepilot, methods=_PROXY_METHODS)
