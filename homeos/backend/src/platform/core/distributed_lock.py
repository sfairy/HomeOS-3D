"""进程内互斥锁服务。

自托管家居场景为单副本部署，跨进程互斥需求由单实例内的 ``dict`` 锁满足：
  - ``acquire``：占用有效期内从未释放的 key，成功返回 token，失败返回 ``None``；
  - ``release``：仅持锁 token 匹配时才删除，避免误释放他人持有的锁；
  - ``run_exclusive``：获取失败抛 ``BusinessException(CONFLICT, LOCK_BUSY)`` → HTTP 409。

调用方（保留清理 / 分区维护 / 遗忘设备检测 / 家庭模式切换 / 安防面板串行化）可直接复用。
"""

from __future__ import annotations

import secrets
import time
from collections.abc import Awaitable, Callable
from typing import TypeVar

from .errors import BusinessException, ErrorCode, api_error

T = TypeVar("T")


class DistributedLockService:
    """基于进程内字典的互斥锁（单副本部署下语义完整）。"""

    def __init__(self) -> None:
        #: key → {token, until(秒, 单调时钟)}
        self._locks: dict[str, dict[str, float | str]] = {}

    # ------------------------------------------------------------------ #
    # 加锁 / 释放
    # ------------------------------------------------------------------ #
    async def acquire(self, key: str, ttl_ms: int = 60_000) -> str | None:
        """获取锁，成功返回 token（释放时回传），失败返回 ``None``。"""
        token = secrets.token_hex(12)
        now = time.monotonic()
        existing = self._locks.get(key)
        if existing is not None and float(existing["until"]) > now:
            return None
        self._locks[key] = {"token": token, "until": now + ttl_ms / 1000}
        return token

    async def release(self, key: str, token: str) -> None:
        """释放锁；仅持锁 token 匹配时才删除，避免锁泄漏。"""
        existing = self._locks.get(key)
        if existing is not None and existing["token"] == token:
            self._locks.pop(key, None)

    async def run_exclusive(
        self,
        key: str,
        fn: Callable[[], Awaitable[T]],
        ttl_ms: int = 60_000,
    ) -> T:
        """在持锁上下文中执行异步任务，无论成功或失败都自动释放锁。

        获取锁失败时抛 ``BusinessException(CONFLICT, LOCK_BUSY)`` → HTTP 409。
        """
        token = await self.acquire(key, ttl_ms)
        if token is None:
            raise BusinessException(ErrorCode.CONFLICT, api_error("LOCK_BUSY"), 409)
        try:
            return await fn()
        finally:
            await self.release(key, token)
