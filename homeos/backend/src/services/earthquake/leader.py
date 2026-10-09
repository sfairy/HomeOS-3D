"""EEW 主节点选举（对齐 ``earthquake/eew-leader.service.ts`` + ``shared/redis/leader-election.helper``）。

多副本部署中仅主节点维护 WolfX WebSocket 连接，避免重复预警。
Redis 未配置 / 不可用时降级为 standalone 模式（本实例即主节点），
与 Nest ``RedisLeaderElection`` 的降级语义一致。
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from collections.abc import Callable
from typing import Any

logger = logging.getLogger("homeos.earthquake.leader")

#: 选举锁键名
EEW_LEADER_KEY = "homeos:eew-leader"
#: 锁 TTL（毫秒）
LEADER_TTL_MS = 15_000
#: 续约间隔（毫秒）
LEADER_RENEW_MS = 5_000
#: 从节点尝试抢占间隔（毫秒）
FOLLOWER_RETRY_MS = 5_000

STANDALONE_WARNING = (
    "Redis 不可用：本实例以 standalone 模式运行 EEW Wolfx 连接。"
    " 多副本部署须配置 REDIS_URL，否则会出现重复预警连接。"
)


class EewLeaderService:
    """基于 Redis 的 EEW 主节点选举（standalone 降级）。"""

    def __init__(self, redis: Any = None) -> None:
        self._redis = redis
        self._instance_id = f"{os.getpid()}-{uuid.uuid4().hex[:8]}"
        self._is_leader = False
        self._mode = "standalone"
        self._on_leader: Callable[[], None] | None = None
        self._on_follower: Callable[[], None] | None = None
        self._task: asyncio.Task[None] | None = None
        self._started = False

    def set_callbacks(
        self,
        on_leader: Callable[[], None] | None = None,
        on_follower: Callable[[], None] | None = None,
    ) -> None:
        self._on_leader = on_leader
        self._on_follower = on_follower

    async def start(self) -> None:
        if self._started:
            return
        self._started = True
        if self._redis is None or not self._redis.is_ready():
            self._is_leader = True
            self._mode = "standalone"
            logger.warning(STANDALONE_WARNING)
            self._notify_leader()
            return
        self._mode = "redis"
        await self._try_acquire()
        self._task = asyncio.create_task(self._loop(), name="eew-leader-election")

    async def stop(self) -> None:
        if self._task is not None and not self._task.done():
            self._task.cancel()
        self._task = None
        self._started = False
        await self._release()

    async def _loop(self) -> None:
        while True:
            await asyncio.sleep((LEADER_RENEW_MS if self._is_leader else FOLLOWER_RETRY_MS) / 1000)
            try:
                if self._is_leader:
                    await self._renew()
                else:
                    await self._try_acquire()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.debug("EEW 主节点选举循环异常: %s", exc)

    async def _try_acquire(self) -> None:
        client = self._redis.get_client() if self._redis is not None else None
        if client is None:
            return
        try:
            acquired = await client.set(EEW_LEADER_KEY, self._instance_id, nx=True, px=LEADER_TTL_MS)
        except Exception as exc:
            logger.debug("EEW 主节点选举获取失败: %s", exc)
            return
        if acquired:
            became_leader = not self._is_leader
            self._is_leader = True
            if became_leader:
                logger.info("本实例已成为 EEW 主节点")
                self._notify_leader()

    async def _renew(self) -> None:
        client = self._redis.get_client() if self._redis is not None else None
        if client is None:
            return
        current = await client.get(EEW_LEADER_KEY)
        if isinstance(current, bytes):
            current = current.decode("utf-8", "ignore")
        if current == self._instance_id:
            await client.set(EEW_LEADER_KEY, self._instance_id, px=LEADER_TTL_MS)
            return
        # 锁已被其他实例持有 → 降为从节点
        self._is_leader = False
        logger.warning("本实例已失去 EEW 主节点身份")
        self._notify_follower()

    async def _release(self) -> None:
        client = self._redis.get_client() if self._redis is not None else None
        if client is None:
            return
        try:
            current = await client.get(EEW_LEADER_KEY)
            if isinstance(current, bytes):
                current = current.decode("utf-8", "ignore")
            if current == self._instance_id:
                await client.delete(EEW_LEADER_KEY)
        except Exception:
            pass

    def _notify_leader(self) -> None:
        if self._on_leader is not None:
            try:
                self._on_leader()
            except Exception as exc:
                logger.debug("EEW onLeader 回调失败: %s", exc)

    def _notify_follower(self) -> None:
        if self._on_follower is not None:
            try:
                self._on_follower()
            except Exception as exc:
                logger.debug("EEW onFollower 回调失败: %s", exc)

    def is_eew_leader(self) -> bool:
        return self._is_leader

    def get_status(self) -> dict[str, Any]:
        return {"isLeader": self._is_leader, "mode": self._mode}


__all__ = ["EEW_LEADER_KEY", "EewLeaderService"]
