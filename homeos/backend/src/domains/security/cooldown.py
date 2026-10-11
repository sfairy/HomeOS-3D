"""通知 / 联动冷却服务（对齐 ``common/alert-support/notification-cooldown.service.ts``）。

纯进程内 L1 缓存 + 事件总线广播；冷却为短时抑制语义，进程重启后自行重建。
"""

from __future__ import annotations

import logging
import time

from .bus import LocalEventBus

logger = logging.getLogger("homeos.security.cooldown")

COOLDOWN_SET_EVENT = "homeos.cooldownSet"

#: 冷却 dedupKey 的命名空间前缀集合（用于批量清理）。
_COOLDOWN_PREFIXES = (
    "notify:",
    "energy:",
    "water:",
    "security:",
    "clientPower:",
    "weather:",
)


class NotificationCooldownService:
    def __init__(self, bus: LocalEventBus | None = None) -> None:
        self._cache: dict[str, float] = {}
        self._bus = bus
        if bus is not None:
            bus.on(COOLDOWN_SET_EVENT, self.handle_cooldown_set)

    @staticmethod
    def _full_key(namespace: str, key: str) -> str:
        return f"{namespace}:{key}"

    def is_in_cooldown(self, namespace: str, key: str) -> bool:
        full = self._full_key(namespace, key)
        until = self._cache.get(full)
        if not until:
            return False
        if time.time() * 1000 >= until:
            self._cache.pop(full, None)
            return False
        return True

    def set_cooldown(self, namespace: str, key: str, minutes: float) -> None:
        full = self._full_key(namespace, key)
        try:
            valid = float(minutes)
        except (TypeError, ValueError):
            valid = 0.0
        if not (valid > 0):
            self._cache.pop(full, None)
            if self._bus is not None:
                self._bus.emit_soon(COOLDOWN_SET_EVENT, {"key": full, "until": 0})
            return
        until = time.time() * 1000 + valid * 60_000
        self._cache[full] = until
        if self._bus is not None:
            self._bus.emit_soon(COOLDOWN_SET_EVENT, {"key": full, "until": until})

    def handle_cooldown_set(self, payload: dict | None) -> None:
        if not isinstance(payload, dict):
            return
        key = payload.get("key")
        until = payload.get("until")
        if not isinstance(key, str) or not isinstance(until, (int, float)):
            return
        if until <= 0:
            self._cache.pop(key, None)
            return
        current = self._cache.get(key)
        if current is None or until > current:
            self._cache[key] = float(until)

    def prune_expired(self) -> int:
        now = time.time() * 1000
        removed = 0
        for key, until in list(self._cache.items()):
            if any(key.startswith(prefix) for prefix in _COOLDOWN_PREFIXES) and until <= now:
                self._cache.pop(key, None)
                removed += 1
        if removed:
            logger.debug("清理过期冷却记录 %s 条", removed)
        return removed
