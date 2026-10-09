"""登录失败限流：内存滑动窗口 + 封禁。

``security.limiter.rate_limit`` 是按 IP + 路由的固定窗口节流；本模块补齐按账号 + IP
的失败计数与封禁，用于登录、授权激活等「连续失败即封禁、成功即清零」场景。
"""

from __future__ import annotations

from collections import defaultdict, deque
from math import ceil
from threading import Lock
from time import monotonic


def retry_after_headers(seconds: int) -> dict[str, str]:
    """标准 ``Retry-After`` 响应头（至少 1 秒）。"""
    return {"Retry-After": str(max(1, int(seconds)))}


class LoginAttemptLimiter:
    """滑动窗口失败计数 + 期满封禁。

    ``max_failures`` 次窗口内失败即封禁 ``block_seconds`` 秒；``reset`` 在成功后清零。
    线程安全（FastAPI 线程池并发调用）。
    """

    def __init__(
        self,
        max_failures: int = 5,
        window_seconds: float = 300,
        block_seconds: float = 600,
    ) -> None:
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self.block_seconds = block_seconds
        self._failures: dict[str, deque[float]] = defaultdict(deque)
        self._blocked_until: dict[str, float] = {}
        self._lock = Lock()

    def blocked(self, key: str) -> bool:
        now = monotonic()
        with self._lock:
            blocked_until = self._blocked_until.get(key, 0)
            if blocked_until > now:
                return True
            self._blocked_until.pop(key, None)
            self._prune(key, now)
            return False

    def retry_after(self, key: str) -> int:
        """剩余封禁秒数（未封禁为 0）。"""
        now = monotonic()
        with self._lock:
            remaining = self._blocked_until.get(key, 0) - now
            if remaining <= 0:
                self._blocked_until.pop(key, None)
                self._prune(key, now)
                return 0
            return max(1, ceil(remaining))

    def record_failure(self, key: str) -> None:
        now = monotonic()
        with self._lock:
            self._prune(key, now)
            failures = self._failures[key]
            failures.append(now)
            if len(failures) >= self.max_failures:
                self._blocked_until[key] = now + self.block_seconds

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)
            self._blocked_until.pop(key, None)

    def _prune(self, key: str, now: float) -> None:
        failures = self._failures.get(key)
        if failures is None:
            return
        cutoff = now - self.window_seconds
        while failures and failures[0] < cutoff:
            failures.popleft()
        if not failures:
            self._failures.pop(key, None)


__all__ = ["LoginAttemptLimiter", "retry_after_headers"]
