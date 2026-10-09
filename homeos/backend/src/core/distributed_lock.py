"""分布式锁服务（对齐 ``common/resilience/distributed-lock.service.ts``）。

双路径策略：
  - 主路径：Redis ``SET key token PX ttlMs NX`` 加锁，Lua 脚本「校验 token 后 del」释放，
    保证只有持锁者能释放；SET NX 瞬时故障短退避重试；
  - 降级路径：未配置 REDIS_URL 或 Redis 故障时回退进程内 ``dict`` 锁，
    单副本部署下互斥语义完整，仅一次性告警避免日志噪声；
  - ``run_exclusive``：获取失败抛 ``BusinessException(CONFLICT, LOCK_BUSY)`` → HTTP 409。

调用方（保留清理 / 分区维护 / 遗忘设备检测 / 家庭模式切换 / 安防面板串行化）可直接复用。
"""

from __future__ import annotations

import asyncio
import logging
import secrets
import time
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

from .errors import BusinessException, ErrorCode, api_error

logger = logging.getLogger("homeos.distributed-lock")

T = TypeVar("T")

#: 原子释放脚本：仅当 KEYS[1] 当前值等于 ARGV[1]（持锁 token）时才 del。
RELEASE_SCRIPT = """
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
"""

#: Redis 锁瞬时故障的额外重试次数与短退避基数（ms）。
LOCK_RETRY_COUNT = 2
LOCK_RETRY_BASE_DELAY_MS = 50


class DistributedLockService:
    """基于 Redis 的分布式锁（Redis 不可用时降级进程内锁）。"""

    def __init__(self, redis: Any = None) -> None:
        self._redis = redis
        #: key → {token, until(秒, 单调时钟)}
        self._local_locks: dict[str, dict[str, float | str]] = {}
        #: Redis 不可用时回退进程内锁的一次性告警标记
        self._fallback_warned = False

    # ------------------------------------------------------------------ #
    # 内部工具
    # ------------------------------------------------------------------ #
    def _warn_fallback_once(self, detail: str) -> None:
        """Redis 不可用、回退进程内锁的一次性告警。"""
        if self._fallback_warned:
            return
        self._fallback_warned = True
        logger.warning(
            "[降级] 分布式锁回退进程内锁(%s).单副本部署下无跨进程互斥需求.", detail
        )

    @staticmethod
    def _is_ready(redis: Any) -> bool:
        try:
            return bool(redis.is_ready())
        except Exception:
            return False

    @staticmethod
    def _is_configured(redis: Any) -> bool:
        try:
            return bool(redis.is_configured())
        except Exception:
            return False

    async def _set_nx_with_retry(
        self, client: Any, redis_key: str, token: str, ttl_ms: int
    ) -> Any:
        """带短退避重试的 SET NX：应对 Redis 瞬时抖动，超限后上抛触发降级。"""
        attempt = 0
        while True:
            try:
                return await client.set(redis_key, token, px=max(1, int(ttl_ms)), nx=True)
            except Exception:
                if attempt >= LOCK_RETRY_COUNT:
                    raise
                attempt += 1
                await asyncio.sleep(LOCK_RETRY_BASE_DELAY_MS * attempt / 1000)

    # ------------------------------------------------------------------ #
    # 加锁 / 释放
    # ------------------------------------------------------------------ #
    async def acquire(self, key: str, ttl_ms: int = 60_000) -> str | None:
        """获取分布式锁，成功返回 token（释放时回传），失败返回 ``None``。"""
        token = secrets.token_hex(12)
        redis_key = f"lock:{key}"

        # ── Redis 已配置：优先分布式锁；不可用时降级进程内锁 ──
        if self._redis is not None and self._is_configured(self._redis):
            if not self._is_ready(self._redis):
                self._warn_fallback_once("Redis 未就绪")
            else:
                client = self._redis.get_client()
                if client is not None:
                    try:
                        ok = await self._set_nx_with_retry(
                            client, redis_key, token, ttl_ms
                        )
                        return token if ok else None
                    except Exception as exc:
                        self._warn_fallback_once(f"Redis 锁获取失败: {exc}")

        # ── 未配置 REDIS_URL 或 Redis 故障降级：进程内锁 ──
        now = time.monotonic()
        existing = self._local_locks.get(key)
        if existing is not None and float(existing["until"]) > now:
            return None
        self._local_locks[key] = {"token": token, "until": now + ttl_ms / 1000}
        return token

    async def release(self, key: str, token: str) -> None:
        """释放锁；仅持锁 token 匹配时才删除（进程内锁与 Redis 均如此）。"""
        redis_key = f"lock:{key}"
        client = None
        if self._redis is not None:
            try:
                client = self._redis.get_client()
            except Exception:
                client = None
        if client is not None:
            try:
                await client.eval(RELEASE_SCRIPT, 1, redis_key, token)
            except Exception as exc:
                logger.warning("Redis 锁释放失败: %s", exc)

        # 无论 Redis 释放是否成功/命中，都尝试清理进程内锁，避免降级期锁泄漏。
        existing = self._local_locks.get(key)
        if existing is not None and existing["token"] == token:
            self._local_locks.pop(key, None)

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
