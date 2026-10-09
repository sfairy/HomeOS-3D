"""原始 WebSocket 升级反代（对齐 Nest ``go2rtc-ws-proxy.util`` + ``common/embed/ws-proxy.util``）。

Nest 在 ``main.ts`` 的 HTTP server 上挂了两条 raw ``upgrade`` 处理器（非控制器路由，
故不在 HTTP 路由契约内，但前端与内嵌站会实际使用）：

- ``/api/v1/ha/webrtc-ws``：HTTPS 页面经同源 WSS 反代 HA ``/api/webrtc/ws``（go2rtc 路径），
  校验 ``auth_token`` Cookie + camera 实体访问限制后，把 ``token`` 查询参数透传给 HA；
- ``/api/v1/embed-proxy/<embedId>/*``：HTTPS 父页 iframe 内嵌 HTTP 站点的 WebSocket
  同源反代，复用 HTTP 侧 Cookie Path 设计，转发内嵌站会话 Cookie / Origin / 子协议。

本模块提供鉴权判定与双向桥接；FastAPI WebSocket 路由在 :mod:`src.api.ws_proxy` 中挂载。
"""

from __future__ import annotations

import asyncio
import logging
import ssl
from collections.abc import Callable
from typing import Any

from ..realtime.access import is_entity_allowed_by_restrictions
from ..realtime.ws_auth import extract_auth_token_from_cookie, resolve_ws_user

logger = logging.getLogger("homeos.ws-proxy")

#: 内嵌页 WS 反代允许的角色（对齐 HTTP 侧 embed-proxy 的 RolesGuard）。
EMBED_WS_ALLOWED_ROLES = frozenset({"admin", "adult", "child"})

#: 双向桥接默认消息上限（None = 不限制，避免大帧被 websockets 默认 1MB 截断）。
WS_MAX_MESSAGE_SIZE: int | None = None

#: 内嵌页 WS 心跳间隔（毫秒）。
EMBED_WS_HEARTBEAT_MS = 30_000


def assert_web_rtc_ws_token_allowed(payload: dict[str, Any] | None, entity_id: str) -> bool:
    """对齐 Nest ``assertWebRtcWsTokenAllowed``：camera 实体 + 角色/白名单判定。"""
    if not payload or not entity_id or not entity_id.startswith("camera."):
        return False
    role = payload.get("role")
    restrictions = payload.get("restrictions")
    restrictions = [str(item) for item in restrictions] if isinstance(restrictions, list) else []

    # guest / child 需显式 restrictions 白名单才可查看摄像头
    if role in ("guest", "child"):
        if not restrictions:
            return False
        return is_entity_allowed_by_restrictions(entity_id, restrictions)
    if role == "admin":
        return True
    if restrictions:
        return is_entity_allowed_by_restrictions(entity_id, restrictions)
    # 家庭成员（adult / user）默认可查看
    return role in ("adult", "user")


def verify_embed_ws_auth(token: str | None, session: Any) -> bool:
    """内嵌页 WS 握手鉴权：DB 会话有效 + 角色白名单。

    与 HTTP / Socket.IO 侧同源：Cookie ``auth_token`` 携带的是 ``sessions`` 表里的
    不透明会话令牌（非 JWT），因此这里只查会话表，不做任何签名校验。
    """
    if not token or session is None:
        return False
    try:
        user = resolve_ws_user(token, session)
    except Exception:
        return False
    role = user.get("role") or "user"
    return role in EMBED_WS_ALLOWED_ROLES


def _ssl_context_for(url: str) -> ssl.SSLContext | None:
    """wss 上游常用自签证书：放行证书校验（仅 wss 生效），与 Nest ``rejectUnauthorized=false`` 一致。"""
    if not url.lower().startswith("wss:"):
        return None
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


async def bridge_websockets(
    client: Any,
    upstream_uri: str,
    *,
    headers: dict[str, str] | None = None,
    subprotocols: list[str] | None = None,
    heartbeat_ms: int | None = None,
    on_close: Callable[[BaseException | None], None] | None = None,
) -> None:
    """客户端 ↔ 上游双向桥接（对齐 ``bridgeClientToUpstream``）。

    - 连接建立后双向转发文本 / 二进制帧；
    - 任一端关闭 / 出错都关闭两端，避免句柄泄漏；
    - ``heartbeat_ms`` > 0 时按间隔向上游 ping 保活。
    """
    from websockets.asyncio.client import connect

    closed = False

    def _cleanup(reason: BaseException | None) -> None:
        nonlocal closed
        if closed:
            return
        closed = True
        if on_close is not None:
            on_close(reason)

    try:
        async with connect(
            upstream_uri,
            additional_headers=headers or None,
            subprotocols=subprotocols or None,
            ssl=_ssl_context_for(upstream_uri),
            max_size=WS_MAX_MESSAGE_SIZE,
            open_timeout=10,
        ) as upstream:
            async def client_to_upstream() -> None:
                while True:
                    message = await client.receive()
                    if message.get("type") == "websocket.disconnect":
                        return
                    text = message.get("text")
                    data = message.get("bytes")
                    if text is not None:
                        await upstream.send(text)
                    elif data is not None:
                        await upstream.send(data)
                    # 其他帧类型（如 websocket.connect）忽略

            async def upstream_to_client() -> None:
                async for message in upstream:
                    if isinstance(message, (bytes, bytearray)):
                        await client.send_bytes(bytes(message))
                    else:
                        await client.send_text(str(message))

            async def keepalive() -> None:
                assert heartbeat_ms
                while True:
                    await asyncio.sleep(heartbeat_ms / 1000)
                    await upstream.ping()

            tasks: list[asyncio.Task[Any]] = [
                asyncio.create_task(client_to_upstream()),
                asyncio.create_task(upstream_to_client()),
            ]
            if heartbeat_ms:
                tasks.append(asyncio.create_task(keepalive()))
            done, pending_tasks = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in pending_tasks:
                task.cancel()
            for task in done:
                exc = task.exception()
                if exc is not None and not isinstance(exc, asyncio.CancelledError):
                    raise exc
    except asyncio.CancelledError:
        raise
    except BaseException as exc:
        _cleanup(exc)
        raise
    finally:
        _cleanup(None)
        try:
            await client.close()
        except Exception:
            pass


# --------------------------------------------------------------------------- #
# 鉴权包装（供路由复用）
# --------------------------------------------------------------------------- #
def resolve_go2rtc_ws_user(
    app: Any, cookie_header: str | None, entity_id: str
) -> dict[str, Any] | None:
    """解析 go2rtc WS 握手用户并按 camera 访问限制判定；失败返回 ``None``。"""
    token = extract_auth_token_from_cookie(cookie_header)
    if not token:
        return None
    try:
        with app.state.database.session_factory() as session:
            user = resolve_ws_user(token, session)
    except Exception:
        return None
    return user if assert_web_rtc_ws_token_allowed(user, entity_id) else None


async def resolve_ha_base_url(app: Any) -> str:
    """当前 HA base URL（跟随连接器当前活跃端点，``HA_URL`` 兜底）；未配置返回空串。

    必须用 ``load_active_ha_endpoints`` 而不是静态配置：内网不可达、连接器已切到外网时，
    摄像头 WebRTC 信令再打到内网地址就会一直连不上。
    """
    try:
        from .ha_config import load_active_ha_endpoints

        with app.state.database.session_factory() as session:
            endpoints = load_active_ha_endpoints(session, cipher=app.state.studio_ha.cipher)
        return endpoints.ha_url_primary or ""
    except Exception:
        return ""


def build_ha_webrtc_ws_url(ha_url: str, entity_id: str, token: str) -> str:
    """构造 HA ``/api/webrtc/ws`` 的 ws(s) 上游地址（对齐 Nest 的协议替换）。"""
    from urllib.parse import quote

    base = ha_url.rstrip("/")
    if base.lower().startswith("https"):
        base = "wss" + base[len("https") :]
    elif base.lower().startswith("http"):
        base = "ws" + base[len("http") :]
    return (
        f"{base}/api/webrtc/ws"
        f"?entity_id={quote(entity_id, safe='')}&token={quote(token, safe='')}"
    )


def split_embed_path(path_after_mount: str) -> tuple[str, str]:
    """把 ``<embedId>/<subPath...>`` 拆成 ``(embedId, subPath)``；subPath 缺省为 ``/``。"""
    rest = path_after_mount
    slash = rest.find("/")
    if slash >= 0:
        return rest[:slash].strip(), rest[slash:]
    return rest.strip(), "/"


def client_subprotocols(header: str | None) -> list[str]:
    if not header:
        return []
    return [item.strip() for item in header.split(",") if item.strip()]


__all__ = [
    "EMBED_WS_ALLOWED_ROLES",
    "EMBED_WS_HEARTBEAT_MS",
    "assert_web_rtc_ws_token_allowed",
    "bridge_websockets",
    "build_ha_webrtc_ws_url",
    "client_subprotocols",
    "resolve_go2rtc_ws_user",
    "resolve_ha_base_url",
    "split_embed_path",
    "verify_embed_ws_auth",
]
