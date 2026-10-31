"""进程内互斥锁服务。

自托管家居场景为单副本部署，跨进程互斥需求由单实例内的 ``dict`` 锁满足：
  - ``acquire``：占用有效期内从未释放的 key，成功返回 token，失败返回 ``None``；
  - ``release``：仅持锁 token 匹配时才删除，避免误释放他人持有的锁；
  - ``renew``：给仍在执行的长任务续租，防止任务跑过 TTL 后锁自然过期；
  - ``run_exclusive``：获取失败抛 ``BusinessException(CONFLICT, LOCK_BUSY)`` → HTTP 409，
    并在 ``fn`` 执行期间自动续租。

调用方（保留清理 / 分区维护 / 遗忘设备检测 / 家庭模式切换 / 安防面板串行化）可直接复用。
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import secrets
import time
from collections.abc import Awaitable, Callable
from typing import TypeVar

from ..http.errors import BusinessException, ErrorCode, api_error

T = TypeVar("T")

logger = logging.getLogger("homeos.distributed_lock")

#: 每 N 次加锁顺带清一次过期锁：key 按设备 / 客户端 / 任务名生成，数量无界，
#: 不清理就是一条慢性内存泄漏（长跑的保留清理任务尤其明显）。
_SWEEP_EVERY = 64


class DistributedLockService:
    """基于进程内字典的互斥锁（单副本部署下语义完整）。"""

    def __init__(self) -> None:
        #: key → {token, until(秒, 单调时钟)}
        self._locks: dict[str, dict[str, float | str]] = {}
        #: 加锁次数，用于按间隔触发过期锁清理
        self._acquires = 0

    def _sweep(self, now: float) -> None:
        """清掉已过期的锁条目（过期 ≠ 仍在持锁，留着只会让字典越来越大）。"""
        stale = [key for key, value in self._locks.items() if float(value["until"]) <= now]
        for key in stale:
            self._locks.pop(key, None)
        if stale:
            logger.debug("清理过期锁 %s 条，剩余 %s 条", len(stale), len(self._locks))

    # 加锁 / 续租 / 释放
    async def acquire(self, key: str, ttl_ms: int = 60_000) -> str | None:
        """获取锁，成功返回 token（释放时回传），失败返回 ``None``。"""
        token = secrets.token_hex(12)
        now = time.monotonic()
        self._acquires += 1
        if self._acquires % _SWEEP_EVERY == 0:
            self._sweep(now)
        existing = self._locks.get(key)
        if existing is not None:
            if float(existing["until"]) > now:
                return None
            # 过期条目直接接管：旧持有者的 token 已不再匹配，它的 release 不会误删新锁
            self._locks.pop(key, None)
        self._locks[key] = {"token": token, "until": now + ttl_ms / 1000}
        return token

    async def renew(self, key: str, token: str, ttl_ms: int = 60_000) -> bool:
        """续租：仅当该 key 仍由 ``token`` 持有时延长有效期。

        锁已被别人接管（自己跑太久过期了）时返回 ``False`` —— 此时继续执行会与本进程内
        的另一个执行者并发，调用方应把它当成「已失去互斥」处理。
        """
        existing = self._locks.get(key)
        if existing is None or existing["token"] != token:
            return False
        existing["until"] = time.monotonic() + ttl_ms / 1000
        return True

    async def release(self, key: str, token: str) -> None:
        """释放锁；仅持锁 token 匹配时才删除，避免锁泄漏。"""
        existing = self._locks.get(key)
        if existing is not None and existing["token"] == token:
            self._locks.pop(key, None)

    async def _keep_alive(self, key: str, token: str, ttl_ms: int) -> None:
        """持锁期间周期性续租：任务比 TTL 长时，锁不能在任务还没跑完时就自然过期。"""
        interval = max(ttl_ms / 3000, 0.05)  # 每 1/3 个 TTL 续一次
        while True:
            await asyncio.sleep(interval)
            if not await self.renew(key, token, ttl_ms):
                logger.warning("锁 %s 已不再由本执行者持有（续租失败）", key)
                return

    async def run_exclusive(
        self,
        key: str,
        fn: Callable[[], Awaitable[T]],
        ttl_ms: int = 60_000,
    ) -> T:
        """在持锁上下文中执行异步任务，无论成功或失败都自动释放锁。

        执行期间后台续租，避免「任务比 TTL 长 → 锁静默过期 → 第二个调用方并发执行」。
        获取锁失败时抛 ``BusinessException(CONFLICT, LOCK_BUSY)`` → HTTP 409。
        """
        token = await self.acquire(key, ttl_ms)
        if token is None:
            raise BusinessException(ErrorCode.CONFLICT, api_error("LOCK_BUSY"), 409)
        keeper = asyncio.create_task(self._keep_alive(key, token, ttl_ms))
        try:
            return await fn()
        finally:
            keeper.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await keeper
            await self.release(key, token)
