"""短票据（media ticket）：给 ``<img>`` / MJPEG / SSE 这类无法带自定义头的请求用。

登录态的主通道是 HttpOnly Cookie。但下面两类场景拿不到 Cookie：

- 跨源嵌入的仪表盘（``/embed/*``）里，图片与视频流由第三方页面发起；
- 某些 WebView 的 ``<img>`` / ``EventSource`` 不携带 SameSite Cookie。

参考实现用 JWT 的 ``?ticket=`` 解决。本项目是 DB 会话，不能凭空签一个 JWT，
因此改为**进程内短票据**：票据是 32 字节随机串，只映射到「原始会话令牌」，
默认 60 秒过期。

安全性取舍（票据**不是**第二张会话 Cookie）：
- 只在 :data:`MEDIA_TICKET_PATH_PREFIXES`（媒体路径）上生效；任何业务读写路由都不认票据，
  否则一次 URL 泄露就等于拿到全 API 的 Bearer 凭据；
- 票据命中的请求**不续期会话、不回写 Cookie**（``authenticate_session`` 里显式跳过），
  泄露窗口被限制在票据自己的 60 秒；
- 票据只在内存里、上限 512 条，不记录明文到日志；
- 同一票据在有效期内可被多个媒体请求复用（一个页面常有多个摄像头贴片），
  这是「单次使用」与「缓存续签」之间的取舍；60 秒上限承担了主要风险。
"""

from __future__ import annotations

import secrets
import threading
import time

#: 票据有效期（秒）。与参考实现的 60s 一致。
TICKET_TTL_SECONDS = 60
#: 同时存在的票据上限：超过后按过期时间淘汰最旧的一批。
MAX_TICKETS = 512

#: 票据**只**在这些路径上生效（媒体代理 / HLS / 图片）。
#: 少一条会让对应媒体拉不到，多一条就是权限放大 —— 新增媒体路由时必须同步这里。
MEDIA_TICKET_PATH_PREFIXES = (
    "/api/camera_proxy/",
    "/api/camera_proxy_stream/",
    "/api/image_proxy/",
    "/api/media_player_proxy/",
    "/api/hls/",
    "/api/camera_hls/",
)

_tickets: dict[str, tuple[str, float]] = {}
_lock = threading.Lock()


def ticket_path_allowed(path: str) -> bool:
    """该请求路径是否允许用 ``?ticket=`` 鉴权（仅媒体）。"""
    text = str(path or "")
    return any(text.startswith(prefix) for prefix in MEDIA_TICKET_PATH_PREFIXES)


def issue_ticket(session_token: str, ttl: int = TICKET_TTL_SECONDS) -> str:
    """为一条有效会话令牌签发短票据。空令牌不签（调用方应先校验登录态）。"""
    token = str(session_token or "").strip()
    if not token:
        raise ValueError("session token is required")
    ticket = secrets.token_urlsafe(32)
    expires_at = time.monotonic() + max(1, int(ttl))
    with _lock:
        _prune()
        if len(_tickets) >= MAX_TICKETS:
            oldest = sorted(_tickets, key=lambda key: _tickets[key][1])[: len(_tickets) // 2]
            for key in oldest:
                _tickets.pop(key, None)
        _tickets[ticket] = (token, expires_at)
    return ticket


def resolve_ticket(ticket: str | None) -> str | None:
    """票据 → 原始会话令牌；无效/过期返回 ``None``（并顺手删除过期项）。"""
    key = str(ticket or "").strip()
    if not key:
        return None
    with _lock:
        entry = _tickets.get(key)
        if entry is None:
            return None
        token, expires_at = entry
        if expires_at <= time.monotonic():
            _tickets.pop(key, None)
            return None
        return token


def _prune() -> None:
    now = time.monotonic()
    for key in [key for key, (_, expires_at) in _tickets.items() if expires_at <= now]:
        _tickets.pop(key, None)


def clear_tickets() -> None:
    """测试 / 停机清理。"""
    with _lock:
        _tickets.clear()


__all__ = [
    "MAX_TICKETS",
    "TICKET_TTL_SECONDS",
    "clear_tickets",
    "issue_ticket",
    "resolve_ticket",
]
