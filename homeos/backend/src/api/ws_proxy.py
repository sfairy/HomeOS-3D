"""原始 WebSocket 升级反代路由（``/api/v1/ha/webrtc-ws`` + ``/api/v1/embed-proxy/*``）。

对齐 Nest ``main.ts`` 挂载的两条 raw ``upgrade`` 处理器；二者不是控制器路由，
故不纳入 HTTP 路由契约，但前端摄像头信令与内嵌站 WS 会实际使用。

- ``/ha/webrtc-ws``：校验 ``auth_token`` Cookie + camera 访问限制，反代 HA ``/api/webrtc/ws``；
- ``/embed-proxy/<embedId>/*``：校验角色白名单后反代内嵌站 WebSocket（转发 Cookie / Origin / 子协议）。
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

from ..core.embed_proxy_util import (
    build_embed_upstream_url,
    get_embed_upstream_origin,
    strip_homeos_cookies,
)
from ..core.errors import BusinessException
from ..services.ws_proxy import (
    EMBED_WS_HEARTBEAT_MS,
    bridge_websockets,
    build_ha_webrtc_ws_url,
    client_subprotocols,
    resolve_go2rtc_ws_user,
    resolve_ha_base_url,
    verify_embed_ws_auth,
)
from .router import NestRouter

logger = logging.getLogger("homeos.api.ws-proxy")

router = NestRouter(prefix="", tags=["realtime"])

#: Nest 侧对非法升级请求的 HTTP 状态码；ASGI 在 accept 前 close 会回 HTTP 403，
#: 此处用 4xxx 应用码保留语义（前端仅需感知「连接失败」）。
CLOSE_BAD_REQUEST = 4400
CLOSE_UNAUTHORIZED = 4401
CLOSE_NOT_FOUND = 4404
CLOSE_UNAVAILABLE = 1013


async def _reject(websocket: WebSocket, code: int) -> None:
    try:
        await websocket.close(code=code)
    except Exception:  # noqa: BLE001 - 对端已断开
        pass


@router.websocket("/ha/webrtc-ws")
async def ha_webrtc_ws(websocket: WebSocket) -> None:
    """HA go2rtc WebRTC 信令同源反代。"""
    app = websocket.app
    entity_id = (websocket.query_params.get("entity_id") or "").strip()
    token = (websocket.query_params.get("token") or "").strip()
    if not entity_id.startswith("camera.") or not token:
        await _reject(websocket, CLOSE_BAD_REQUEST)
        return

    if resolve_go2rtc_ws_user(app, websocket.headers.get("cookie"), entity_id) is None:
        await _reject(websocket, CLOSE_UNAUTHORIZED)
        return

    ha_url = await resolve_ha_base_url(app)
    if not ha_url.strip():
        await _reject(websocket, CLOSE_UNAVAILABLE)
        return

    await websocket.accept()
    upstream = build_ha_webrtc_ws_url(ha_url, entity_id, token)
    try:
        await bridge_websockets(
            websocket,
            upstream,
            on_close=lambda exc: logger.debug(
                "go2rtc WS 反代已关闭: %s", exc if exc else "正常"
            ),
        )
    except WebSocketDisconnect:
        pass


@router.websocket("/embed-proxy/{embed_id}")
async def embed_proxy_ws_root(websocket: WebSocket, embed_id: str) -> None:
    await _embed_proxy_ws(websocket, embed_id, "/")


@router.websocket("/embed-proxy/{embed_id}/{sub_path:path}")
async def embed_proxy_ws(websocket: WebSocket, embed_id: str, sub_path: str) -> None:
    await _embed_proxy_ws(websocket, embed_id, f"/{sub_path.lstrip('/')}")


async def _embed_proxy_ws(websocket: WebSocket, embed_id: str, sub_path: str) -> None:
    """内嵌页 WebSocket 同源反代（对齐 Nest ``attachEmbedWsProxy``）。"""
    app = websocket.app
    secret = app.state.settings.jwt_secret or "homeos-dev-secret"
    token = websocket.cookies.get("auth_token")
    if not verify_embed_ws_auth(token, secret):
        await _reject(websocket, CLOSE_UNAUTHORIZED)
        return

    embed_id = (embed_id or "").strip()
    if not embed_id:
        await _reject(websocket, CLOSE_BAD_REQUEST)
        return
    target_path = sub_path if sub_path.startswith("/") else f"/{sub_path}"

    embed_proxy: Any = getattr(app.state, "embed_proxy", None)
    if embed_proxy is None:
        await _reject(websocket, CLOSE_NOT_FOUND)
        return
    try:
        embed_base = embed_proxy.resolve_embed_base_url(embed_id)
    except BusinessException:
        await _reject(websocket, CLOSE_NOT_FOUND)
        return
    if not embed_base:
        await _reject(websocket, CLOSE_NOT_FOUND)
        return

    http_url = build_embed_upstream_url(embed_base, target_path, _search(websocket))
    upstream = _to_ws_scheme(http_url)

    headers: dict[str, str] = {"origin": get_embed_upstream_origin(embed_base)}
    forwarded_cookie = strip_homeos_cookies(websocket.headers.get("cookie"))
    if forwarded_cookie:
        headers["cookie"] = forwarded_cookie
    user_agent = websocket.headers.get("user-agent")
    if user_agent:
        headers["user-agent"] = user_agent

    protocols = client_subprotocols(websocket.headers.get("sec-websocket-protocol"))
    await websocket.accept(subprotocol=protocols[0] if protocols else None)
    try:
        await bridge_websockets(
            websocket,
            upstream,
            headers=headers,
            subprotocols=protocols,
            heartbeat_ms=EMBED_WS_HEARTBEAT_MS,
            on_close=lambda exc: logger.debug(
                "内嵌页 WS 反代已关闭: %s", exc if exc else "正常"
            ),
        )
    except WebSocketDisconnect:
        pass


def _search(websocket: WebSocket) -> str:
    query = websocket.url.query
    return f"?{query}" if query else ""


def _to_ws_scheme(url: str) -> str:
    lowered = url.lower()
    if lowered.startswith("https:"):
        return "wss:" + url[len("https:") :]
    if lowered.startswith("http:"):
        return "ws:" + url[len("http:") :]
    return url


__all__ = ["router"]
