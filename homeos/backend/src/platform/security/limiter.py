"""内存限流（对齐 Nest ``ThrottlerGuard`` 的固定窗口语义 + 中文 429 文案）。

Nest 侧对公开预认证端点用 ``@Throttle({limit, ttl})`` 声明限流；本实现提供等价的
按「客户端 IP + 路由」固定窗口计数依赖，超限抛 429（过滤器本地化为
「操作过于频繁，请约 1 分钟后再试」）。
"""

from __future__ import annotations

import time
from collections import deque
from collections.abc import Callable

from fastapi import Request

from ..core.errors import BusinessException, ErrorCode

_WINDOWS: dict[str, deque[float]] = {}


def _client_key(request: Request, name: str) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "")
    return f"{name}:{ip}"


def rate_limit(limit: int, ttl_seconds: float = 60.0) -> Callable:
    """构造限流依赖：窗口内超过 ``limit`` 次即 429。"""

    async def _dependency(request: Request) -> None:
        key = _client_key(request, f"{request.url.path}:{limit}:{ttl_seconds}")
        now = time.monotonic()
        window = _WINDOWS.setdefault(key, deque())
        while window and now - window[0] > ttl_seconds:
            window.popleft()
        if len(window) >= limit:
            raise BusinessException(ErrorCode.UNKNOWN, "Too Many Requests", 429)
        window.append(now)

    return _dependency


def reset_all() -> None:
    _WINDOWS.clear()
