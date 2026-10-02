from __future__ import annotations
from collections import defaultdict, deque
from math import ceil
from threading import Lock
from time import monotonic

class LoginAttemptLimiter:

    def __init__(self, max_failures=5, window_seconds=300, block_seconds=600) -> None:
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self.block_seconds = block_seconds
        self._failures = defaultdict(deque)
        self._blocked_until = { }
        self._lock = Lock()
        return None

    def blocked(self, key) -> bool:
        now = monotonic()
        with self._lock:
            blocked_until = self._blocked_until.get(key, 0)
            if blocked_until > now:
                return True
            self._blocked_until.pop(key, None)
            self._prune(key, now)
            return False
        return None

    def retry_after(self, key) -> int:
        # [补充说明] 该键还要等多少秒才能再试（未封禁时返回 0）。
        #
        # 与 blocked() 的分工：blocked() 只回答「现在行不行」，这里要给出秒数，
        # 调用方才能拼出 Retry-After 响应头 —— 否则客户端只知道被挡下，不知道该等多久，
        # 就会用固定间隔反复重试，把限流窗口一直撑满。
        now = monotonic()
        with self._lock:
            remaining = self._blocked_until.get(key, 0) - now
            if remaining <= 0:
                # 已解封：顺手清掉过期记录，避免封禁表只增不减。
                self._blocked_until.pop(key, None)
                self._prune(key, now)
                return 0
            # 向上取整且下限 1 秒：剩 0.2 秒时回 Retry-After: 0 等于让客户端立刻再来。
            return max(1, ceil(remaining))
        return None

    def record_failure(self, key) -> None:
        now = monotonic()
        with self._lock:
            self._prune(key, now)
            failures = self._failures[key]
            failures.append(now)
            if len(failures) >= self.max_failures:
                self._blocked_until[key] = now + self.block_seconds
                failures.clear()
            return None
        return None

    def reset(self, key) -> None:
        with self._lock:
            self._failures.pop(key, None)
            self._blocked_until.pop(key, None)
            return None
        return None

    def _prune(self, key, now) -> None:
        failures = self._failures.get(key)
        if failures is None:
            return None
        cutoff = now - self.window_seconds
        while failures and failures[0] < cutoff:
            failures.popleft()
        if not failures:
            self._failures.pop(key, None)
        return None
