"""EEW 主节点（单副本部署下本实例即主节点）。

多副本部署中仅主节点维护 WolfX WebSocket 连接，避免重复预警；本 Python 端口为单副本，
故恒为 standalone 模式，本实例即主节点。
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

logger = logging.getLogger("homeos.earthquake.leader")


class EewLeaderService:
    """EEW 主节点服务（standalone：本实例即主节点）。"""

    def __init__(self) -> None:
        self._is_leader = False
        self._mode = "standalone"
        self._on_leader: Callable[[], None] | None = None
        self._on_follower: Callable[[], None] | None = None
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
        self._is_leader = True
        self._mode = "standalone"
        self._notify_leader()

    async def stop(self) -> None:
        self._started = False
        self._is_leader = False

    def _notify_leader(self) -> None:
        if self._on_leader is not None:
            try:
                self._on_leader()
            except Exception as exc:
                logger.debug("EEW onLeader 回调失败: %s", exc)

    def is_eew_leader(self) -> bool:
        return self._is_leader

    def get_status(self) -> dict[str, Any]:
        return {"isLeader": self._is_leader, "mode": self._mode}


__all__ = ["EewLeaderService"]
