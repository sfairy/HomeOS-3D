"""内嵌页反向代理路由（``/api/v1/embed-proxy/*``）。

对齐 Nest ``EmbedProxyController``：
- ``/api/v1/embed-proxy/:embedId`` 与 ``/api/v1/embed-proxy/:embedId/*path`` 全方法透传；
- 鉴权 JwtAuthGuard + RolesGuard（admin | adult | child）；
- 服务端直接写入响应（流式透传），不经过统一 JSON 包装。
"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, Request

from ..security.auth_context import require_roles
from .router import NestRouter

router = NestRouter(prefix="/embed-proxy", tags=["display"])

#: Nest ``@All(...)`` 等价：所有方法均需透传
_ALL_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]

async def proxy_embed(
    embed_id: str,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult", "child")),
):
    """反代内嵌页请求（根路径与子路径共用同一处理逻辑）。"""
    return await request.app.state.embed_proxy.proxy(embed_id, request)

router.add_api_route("/{embed_id}", proxy_embed, methods=_ALL_METHODS)
router.add_api_route("/{embed_id}/{sub_path:path}", proxy_embed, methods=_ALL_METHODS)
