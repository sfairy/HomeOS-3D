"""通知 / 联动冷却服务（对齐 ``common/alert-support/notification-cooldown.service.ts``）。

进程内 L1 缓存 + 事件总线广播，**可选**持久化到 ``runtime_kv``：

- 没有持久化时，进程重启会把冷却全部清空 —— 崩溃循环会变成「每重启一次就重发一轮告警」；
- 传入 ``session_factory`` 后，冷却在首次使用时从 ``runtime_kv`` 载入，写入时按
  最短间隔落盘（避免每条通知一次 DB 写），过期条目在载入时就丢掉。
"""

from __future__ import annotations

import logging
import time

from .bus import LocalEventBus
from ...platform.core.db.runtime_kv import load_runtime_kv, persist_runtime_kv

logger = logging.getLogger("homeos.security.cooldown")

COOLDOWN_SET_EVENT = "homeos.cooldownSet"

#: 冷却持久化的 ``runtime_kv`` 键。
COOLDOWN_KV_KEY = "security.cooldown.v1"

#: 落盘最短间隔（秒）：冷却写入很频繁，每条都落盘会把它变成 DB 热点。
_PERSIST_MIN_INTERVAL_SECONDS = 5.0

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
    def __init__(self, bus: LocalEventBus | None = None, session_factory=None) -> None:
        self._cache: dict[str, float] = {}
        self._bus = bus
        self._session_factory = session_factory
        self._loaded = session_factory is None
        self._last_persist_at = 0.0
        if bus is not None:
            bus.on(COOLDOWN_SET_EVENT, self.handle_cooldown_set)

    def _ensure_loaded(self) -> None:
        """首次使用时从 ``runtime_kv`` 载入未过期条目。"""
        if self._loaded or self._session_factory is None:
            return
        self._loaded = True
        try:
            with self._session_factory() as session:
                raw = load_runtime_kv(session, COOLDOWN_KV_KEY)
        except Exception:  # 读失败就按空缓存继续，冷却只是抑制手段，不能阻断通知
            logger.debug("载入冷却记录失败，按空缓存继续", exc_info=True)
            return
        if not isinstance(raw, dict):
            return
        now = time.time() * 1000
        restored = 0
        for key, until in raw.items():
            if not isinstance(key, str) or not isinstance(until, (int, float)):
                continue
            if until > now:
                self._cache[key] = float(until)
                restored += 1
        if restored:
            logger.info("已恢复冷却记录 %s 条", restored)

    def _persist(self, force: bool = False) -> None:
        if self._session_factory is None:
            return
        now = time.time()
        if not force and now - self._last_persist_at < _PERSIST_MIN_INTERVAL_SECONDS:
            return
        self._last_persist_at = now
        # 只落未过期的，避免文件随运行时间无限增长。
        cutoff = now * 1000
        snapshot = {key: until for key, until in self._cache.items() if until > cutoff}
        try:
            persist_runtime_kv(self._session_factory, COOLDOWN_KV_KEY, snapshot)
        except Exception:  # 落盘属增强：失败只影响重启后的抑制效果
            logger.debug("冷却记录落盘失败", exc_info=True)

    @staticmethod
    def _full_key(namespace: str, key: str) -> str:
        return f"{namespace}:{key}"

    def is_in_cooldown(self, namespace: str, key: str) -> bool:
        self._ensure_loaded()
        full = self._full_key(namespace, key)
        until = self._cache.get(full)
        if not until:
            return False
        if time.time() * 1000 >= until:
            self._cache.pop(full, None)
            return False
        return True

    def set_cooldown(self, namespace: str, key: str, minutes: float) -> None:
        self._ensure_loaded()
        full = self._full_key(namespace, key)
        try:
            valid = float(minutes)
        except (TypeError, ValueError):  # fmt: skip
            valid = 0.0
        if not (valid > 0):
            self._cache.pop(full, None)
            if self._bus is not None:
                self._bus.emit_soon(COOLDOWN_SET_EVENT, {"key": full, "until": 0})
            self._persist(force=True)
            return
        until = time.time() * 1000 + valid * 60_000
        self._cache[full] = until
        if self._bus is not None:
            self._bus.emit_soon(COOLDOWN_SET_EVENT, {"key": full, "until": until})
        self._persist()

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
        self._ensure_loaded()
        now = time.time() * 1000
        removed = 0
        for key, until in list(self._cache.items()):
            if any(key.startswith(prefix) for prefix in _COOLDOWN_PREFIXES) and until <= now:
                self._cache.pop(key, None)
                removed += 1
        if removed:
            logger.debug("清理过期冷却记录 %s 条", removed)
        return removed
