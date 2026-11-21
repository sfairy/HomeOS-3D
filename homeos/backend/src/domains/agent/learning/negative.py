"""负经验：记住「哪些设备 + 服务最近失败过」，用于歧义候选排除。

只在**同一轮对话内**或最近 15 分钟内生效：失败可能是暂时的（设备离线、正在重启），
把它永久记住会让一个设备再也不能被语音控制。

命中 ``has_failure`` 会递增 ``retryAvoidCount``（有副作用）：调用方用它排序候选，
「越试越失败」的设备排到后面。这与参考实现一致。
"""

from __future__ import annotations

import threading
import time
from collections import OrderedDict

TTL_SECONDS = 15 * 60
MAX_ENTRIES = 100


class NegativeExperienceService:
    """``entityId:service`` 指纹 → 最近失败时间。"""

    def __init__(self, ttl_seconds: int = TTL_SECONDS, max_entries: int = MAX_ENTRIES) -> None:
        self._ttl = max(1, int(ttl_seconds))
        self._max = max(1, int(max_entries))
        self._entries: OrderedDict[str, tuple[float, int]] = OrderedDict()
        self._lock = threading.Lock()

    @staticmethod
    def fingerprint(entity_id: str | None, service: str | None) -> str:
        return f"{str(entity_id or '').strip().lower()}:{str(service or '').strip().lower()}"

    def record_failure(self, entity_id: str | None, service: str | None) -> None:
        key = self.fingerprint(entity_id, service)
        if key == ":":
            return
        now = time.monotonic()
        with self._lock:
            _, retries = self._entries.get(key, (now, 0))
            self._entries[key] = (now, retries)
            self._entries.move_to_end(key)
            self._prune(now)

    def has_failure(self, entity_id: str | None, service: str | None) -> bool:
        key = self.fingerprint(entity_id, service)
        if key == ":":
            return False
        now = time.monotonic()
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return False
            recorded_at, retries = entry
            if now - recorded_at > self._ttl:
                self._entries.pop(key, None)
                return False
            self._entries[key] = (recorded_at, retries + 1)
            self._entries.move_to_end(key)
            return True

    def retry_avoid_count(self, entity_id: str | None, service: str | None) -> int:
        key = self.fingerprint(entity_id, service)
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return 0
            recorded_at, retries = entry
            if time.monotonic() - recorded_at > self._ttl:
                self._entries.pop(key, None)
                return 0
            return retries

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()

    def _prune(self, now: float) -> None:
        for key in [k for k, (at, _) in self._entries.items() if now - at > self._ttl]:
            self._entries.pop(key, None)
        while len(self._entries) > self._max:
            self._entries.popitem(last=False)


__all__ = ["MAX_ENTRIES", "TTL_SECONDS", "NegativeExperienceService"]
