"""短票据（media ticket）：给 ``<img>`` / MJPEG / SSE 这类无法带自定义头的请求用。

登录态的主通道是 HttpOnly Cookie。但下面两类场景拿不到 Cookie：

- 跨源嵌入的仪表盘（``/embed/*``）里，图片与视频流由第三方页面发起；
- 某些 WebView 的 ``<img>`` / ``EventSource`` 不携带 SameSite Cookie。

参考实现用 JWT 的 ``?ticket=`` 解决。本项目是 DB 会话，不能凭空签一个 JWT，
因此改为**进程内短票据**：票据是 32 字节随机串，只映射到「原始会话令牌」，
默认 60 秒过期，用完即弃。

安全性取舍：
- 票据只在内存里、只活 60 秒、上限 512 条，泄露窗口远小于会话本身；
- 票据不能续期会话（媒体端点本来就用 ``refresh=False``）；
- 不记录票据明文到日志（``global_log`` 只记实体与路径）。
"""

from __future__ import annotations

import secrets
import threading
import time

#: 票据有效期（秒）。与参考实现的 60s 一致。
TICKET_TTL_SECONDS = 60
#: 同时存在的票据上限：超过后按过期时间淘汰最旧的一批。
MAX_TICKETS = 512

_tickets: dict[str, tuple[str, float]] = {}
_lock = threading.Lock()


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
