"""授权判定的纯内存快路径（不触碰数据库）。

中间件对每个请求都调用 ``LicenseGuardMiddleware``；即便 2s 缓存命中，原实现仍要
``asyncio.to_thread(service.allows)`` 一次线程往返。本模块把「读缓存」抽成纯函数，
命中时调用方可以直接留在事件循环里。
"""

from __future__ import annotations


def cached_allow(
    allow_cache: dict[tuple[str, int, str], tuple[float, bool]],
    identity_snapshot: tuple[float, str, int] | None,
    feature: str | None,
    now: float,
) -> bool | None:
    """命中返回判定；未命中/过期返回 None（调用方再走 ``allows``）。"""
    if identity_snapshot is None or identity_snapshot[0] <= now:
        return None
    cached = allow_cache.get((identity_snapshot[1], identity_snapshot[2], feature or "*"))
    if cached is None or cached[0] <= now:
        return None
    return cached[1]


__all__ = ["cached_allow"]
