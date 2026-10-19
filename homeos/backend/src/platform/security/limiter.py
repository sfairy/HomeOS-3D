"""内存限流（对齐 Nest ``ThrottlerGuard`` 的窗口语义 + 中文 429 文案）。

Nest 侧对公开预认证端点用 ``@Throttle({limit, ttl})`` 声明限流；本实现提供等价的
按「客户端 IP + 路由」计数依赖，超限抛 429（过滤器本地化为
「操作过于频繁，请约 1 分钟后再试」）。

修复前的两个缺陷（本次一并解决）：

1. **key 无界**：``_WINDOWS`` 是模块级全局字典，以「路由 + 客户端 IP」为 key，**永不淘汰**。
   而那个 IP 当时来自可伪造的 ``X-Forwarded-For`` —— 每个请求换一个假 IP 就能无限往表里塞键。
   现在改用 ``homeos_shared.rate_limit.SlidingWindowLimiter``：有 ``max_keys`` 上限与淘汰策略。
2. **IP 可伪造**：地址解析改为 ``platform.security.client_address``（先验 TCP 对端是否可信）。
   判不出具体客户端时走**全局桶**而不是「每请求一个新桶」—— 后者等于无限放行。

依赖方向：判定与计数都在 ``homeos_shared``（两个后端各自内联编译一份），本模块只做
「FastAPI 依赖 + 429 文案」这一层适配。
"""
from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import Depends, Request

from homeos_shared.rate_limit import SlidingWindowLimiter, resolve_limiter_key

from .client_address import resolve_client_address_from_request
from ..core.errors import BusinessException, ErrorCode

#: 不同 (limit, ttl) 组合各持一个限流器；key 表上限按组合独立计算。
_LIMITERS: dict[tuple[int, float], SlidingWindowLimiter] = {}

#: 单个限流组合的 key 表上限。取值理由：正常部署里同一组合的活跃客户端 IP 不会到千级，
#: 4096 已经远超真实规模；超出即说明来源不可信或存在扫描，淘汰比无界增长可接受。
DEFAULT_MAX_KEYS = 4096


def _limiter_for(limit: int, ttl_seconds: float) -> SlidingWindowLimiter:
    key = (limit, ttl_seconds)
    limiter = _LIMITERS.get(key)
    if limiter is None:
        limiter = SlidingWindowLimiter(
            limit=limit, window_seconds=ttl_seconds, max_keys=DEFAULT_MAX_KEYS
        )
        _LIMITERS[key] = limiter
    return limiter


def rate_limit(limit: int, ttl_seconds: float = 60.0) -> Callable:
    """构造限流依赖：窗口内超过 ``limit`` 次即 429。"""
    limiter = _limiter_for(limit, ttl_seconds)

    async def _dependency(request: Request) -> None:
        address = resolve_client_address_from_request(request)
        key = resolve_limiter_key(
            address.ip,
            per_client=address.per_client,
            name=f"{request.url.path}:{limit}:{ttl_seconds}",
        )
        if not limiter.allow(key):
            raise BusinessException(ErrorCode.UNKNOWN, "Too Many Requests", 429)

    return _dependency


def rate_limit_authenticated(limit: int, ttl_seconds: float = 60.0) -> Callable:
    """构造「登录用户 + 客户端 IP」双键限流依赖，并透传鉴权用户。

    为什么不直接用 :func:`rate_limit`：
    - 只按 IP 计数时，同一 NAT 出口下的多个账号会互相挤占配额；
    - 只要换出口 IP 就能绕过，对「一句话触发多轮 LLM」的端点保护不足。

    因此 key 取 ``userId``（无则 ``anon``）与客户端 IP 的联合值：单账号换 IP 仍受限，
    多账号共享出口也互不影响。依赖本身依赖 ``require_user``，路由直接用它替代鉴权依赖。
    """
    from .auth_context import require_user

    limiter = _limiter_for(limit, ttl_seconds)

    async def _dependency(
        request: Request, user: dict[str, Any] = Depends(require_user)
    ) -> dict[str, Any]:
        address = resolve_client_address_from_request(request)
        owner = str(user.get("userId") or user.get("username") or "anon")
        address_key = resolve_limiter_key(
            address.ip,
            per_client=address.per_client,
            name=f"{request.url.path}:{limit}:{ttl_seconds}",
        )
        if not limiter.allow(f"{owner}|{address_key}"):
            raise BusinessException(ErrorCode.UNKNOWN, "Too Many Requests", 429)
        return user

    return _dependency
