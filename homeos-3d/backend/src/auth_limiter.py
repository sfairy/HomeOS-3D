from __future__ import annotations

from collections import defaultdict, deque
from math import ceil
from threading import Lock
from time import monotonic


def retry_after_headers(seconds: int) -> dict[str, str]:
    return {'Retry-After': str(max(1, int(seconds)))}


class LoginAttemptLimiter:

    def __init__(self, max_failures=5, window_seconds=300, block_seconds=600) -> None:
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self.block_seconds = block_seconds
        self._failures = defaultdict(deque)
        self._blocked_until = { }
        self._lock = Lock()

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
        now = monotonic()
        with self._lock:
            remaining = self._blocked_until.get(key, 0) - now
            if remaining <= 0:
                self._blocked_until.pop(key, None)
                self._prune(key, now)
                return 0
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
            return
        return

    def reset(self, key) -> None:
        with self._lock:
            self._failures.pop(key, None)
            self._blocked_until.pop(key, None)
            return
        return

    def _prune(self, key, now) -> None:
        failures = self._failures.get(key)
        if failures is None:
            return
        cutoff = now - self.window_seconds
        while failures and failures[0] < cutoff:
            failures.popleft()
        if not failures:
            self._failures.pop(key, None)
        return
