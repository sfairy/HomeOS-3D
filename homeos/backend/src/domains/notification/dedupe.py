"""通知去重（对齐参考实现的四层抑制链中的第 2、3 层）。

参考顺序：全局开关 → **24h 幂等** → **10s 内容去重** → 免打扰 → 规则冷却。
本模块只负责中间两层，且刻意收窄作用面：

- **24h 幂等**只对「显式声明幂等键」或「主动外呼来源」生效。普通站内通知
  如果在 24h 内一律去重，用户手动触发的第二次提醒就会被吞掉 —— 这是行为倒退。
- **10s 内容去重**对所有非生命安全、非 ``resolved``、非 ``danger`` 的通知生效，
  用来压掉同一事件被多条链路重复投递（例如规则 + 事件处理器同时报一次）。

去重表是「进程内 dict + ``runtime_kv`` 增量落库」：单实例部署下足够，
重启后仍能保住 24h 幂等窗口；多实例时会退化为各实例独立去重（可接受）。
"""

from __future__ import annotations

import hashlib
import logging
import threading
import time
from collections.abc import Callable
from typing import Any

logger = logging.getLogger("homeos.notification.dedupe")

IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60
CONTENT_DEDUPE_SECONDS = 10
#: 去重表上限：超过后按时间戳裁掉最旧的一半，避免无限增长。
MAX_ENTRIES = 2000
#: 落库节流：每写入这么多次才持久化一次（避免每条通知都写一次 SQLite）。
PERSIST_EVERY = 25
KV_ID = "notification-dedupe"

#: 来源前缀：主动外呼（管家 / 计划任务）默认参与 24h 幂等。
_PROACTIVE_SOURCE_PREFIXES = ("agent", "watchdog", "task")


def _normalize(message: str) -> str:
    """归一正文：折叠空白并去首尾，大小写不敏感（中文不受影响，英文避免大小写重复）。"""
    return " ".join(str(message or "").split()).lower()


def _digest(*parts: Any) -> str:
    raw = "|".join("" if part is None else str(part) for part in parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


class NotificationDeduplicator:
    """两层去重：24h 幂等 + 10s 内容去重。线程安全，可注入 ``session_factory`` 落库。"""

    def __init__(self, session_factory: Callable[[], Any] | None = None) -> None:
        self._session_factory = session_factory
        self._entries: dict[str, float] = {}
        self._lock = threading.Lock()
        self._loaded = False
        self._writes_since_persist = 0

    # ------------------------------------------------------------------ 公共 API
    def should_suppress(
        self,
        *,
        source: str,
        entity_id: str | None,
        message: str,
        action_prompt: str | None = None,
        idempotency_key: str | None = None,
        level: str = "info",
        resolved: bool = False,
        life_safety: bool = False,
    ) -> bool:
        """返回 ``True`` 表示这条通知应被抑制（不投递、不入库）。

        被抑制的调用**不会**刷新时间戳：否则持续重复的同一事件会一直被续期，
        永远无法在窗口结束后重新送达。
        """
        if life_safety or resolved or level == "danger":
            return False
        key24 = self._idempotency_key(source, entity_id, message, action_prompt, idempotency_key, level=level)
        key10 = _digest("c", source, entity_id or "", _normalize(message))
        now = self._now()
        with self._lock:
            self._ensure_loaded()
            if key24 is not None and self._within(key24, now, IDEMPOTENCY_TTL_SECONDS):
                return True
            if self._within(key10, now, CONTENT_DEDUPE_SECONDS):
                return True
            if key24 is not None:
                self._entries[key24] = now
            self._entries[key10] = now
            self._prune(now)
            self._maybe_persist()
        return False

    def reset(self) -> None:
        """清空去重表（诊断 / 测试用）。"""
        with self._lock:
            self._entries.clear()
            self._loaded = True
            self._writes_since_persist = 0

    # ------------------------------------------------------------------ 内部
    @staticmethod
    def _now() -> float:
        return time.time()

    def _idempotency_key(
        self,
        source: str,
        entity_id: str | None,
        message: str,
        action_prompt: str | None,
        idempotency_key: str | None,
        *,
        level: str,
    ) -> str | None:
        """24h 幂等键；不满足「显式键 / 主动外呼」时返回 ``None``（不做 24h 去重）。"""
        if idempotency_key:
            return _digest("i", idempotency_key)
        proactive = any(str(source or "").startswith(prefix) for prefix in _PROACTIVE_SOURCE_PREFIXES)
        if not proactive:
            return None
        return _digest("i", source, entity_id or "", _normalize(message), action_prompt or "", level)

    def _within(self, key: str, now: float, ttl: float) -> bool:
        seen = self._entries.get(key)
        return seen is not None and now - seen < ttl

    def _prune(self, now: float) -> None:
        if len(self._entries) <= MAX_ENTRIES:
            return
        # 先按 24h 过期清；仍然超限就按时间戳裁掉最旧的一半。
        cutoff = now - IDEMPOTENCY_TTL_SECONDS
        self._entries = {key: at for key, at in self._entries.items() if at >= cutoff}
        if len(self._entries) > MAX_ENTRIES:
            ordered = sorted(self._entries.items(), key=lambda item: item[1])
            keep = ordered[len(ordered) // 2 :]
            self._entries = dict(keep)

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        if self._session_factory is None:
            return
        try:
            from ...platform.core.db.runtime_kv import load_runtime_kv

            with self._session_factory() as session:
                raw = load_runtime_kv(session, KV_ID)
        except Exception as exc:  # 去重表加载失败不应阻断通知
            logger.debug("通知去重表加载失败: %s", exc)
            return
        if not isinstance(raw, dict):
            return
        now = self._now()
        cutoff = now - IDEMPOTENCY_TTL_SECONDS
        for key, at in raw.items():
            try:
                timestamp = float(at)
            except (TypeError, ValueError):  # fmt: skip
                continue
            if timestamp >= cutoff:
                self._entries[str(key)] = timestamp

    def _maybe_persist(self) -> None:
        if self._session_factory is None:
            return
        self._writes_since_persist += 1
        if self._writes_since_persist < PERSIST_EVERY:
            return
        self._writes_since_persist = 0
        try:
            from ...platform.core.db.runtime_kv import persist_runtime_kv

            # 只持久化 24h 档（``i:`` 前缀由 digest 抹平，这里按时间窗口过滤即可）。
            now = self._now()
            cutoff = now - IDEMPOTENCY_TTL_SECONDS
            snapshot = {key: at for key, at in self._entries.items() if at >= cutoff}
            persist_runtime_kv(self._session_factory, KV_ID, snapshot)
        except Exception as exc:
            logger.debug("通知去重表持久化失败: %s", exc)


__all__ = [
    "CONTENT_DEDUPE_SECONDS",
    "IDEMPOTENCY_TTL_SECONDS",
    "NotificationDeduplicator",
]
