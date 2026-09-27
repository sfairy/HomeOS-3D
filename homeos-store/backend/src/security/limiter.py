"""进程内滑动窗口限流。
"""

from __future__ import annotations

import threading
import time
from collections import deque


class SlidingWindowLimiter:
    """固定上限 + 滑动窗口 + 有界 key 表。
    """

    def __init__(
        self,
        *,
        limit: int,
        window_seconds: float,
        max_keys: int = 4096,
    ) -> None:
        if limit < 1:
            raise ValueError("limit 必须 >= 1")
        if window_seconds <= 0:
            raise ValueError("window_seconds 必须为正")
        if max_keys < 1:
            raise ValueError("max_keys 必须 >= 1")
        self.limit = limit
        self.window_seconds = float(window_seconds)
        self.max_keys = max_keys
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str, *, now: float | None = None) -> bool:
        """消耗一次配额。返回是否放行。"""
        moment = time.monotonic() if now is None else now
        cutoff = moment - self.window_seconds
        with self._lock:
            bucket = self._hits.get(key)
            if bucket is None:
                if len(self._hits) >= self.max_keys:
                    self._evict(cutoff)
                bucket = deque()
                self._hits[key] = bucket
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= self.limit:
                return False
            bucket.append(moment)
            return True

    def retry_after(self, key: str, *, now: float | None = None) -> float:
        """还要等多少秒才可能被放行；当前就放行则返回 0。"""
        moment = time.monotonic() if now is None else now
        cutoff = moment - self.window_seconds
        with self._lock:
            bucket = self._hits.get(key)
            if bucket is None:
                return 0.0
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) < self.limit:
                return 0.0
            # 窗口内最早的一次过期后，就少占一个名额
            return max(0.0, bucket[0] + self.window_seconds - moment)

    def reset(self, key: str | None = None) -> None:
        """清空配额。``key`` 为空时清空全部（测试与运维用）。"""
        with self._lock:
            if key is None:
                self._hits.clear()
            else:
                self._hits.pop(key, None)

    def _evict(self, cutoff: float) -> None:
        """key 表达到上限时腾位置：先丢空桶，再丢最久没活动的桶。"""
        stale = [name for name, bucket in self._hits.items() if not bucket or bucket[-1] <= cutoff]
        for name in stale:
            self._hits.pop(name, None)
        if len(self._hits) < self.max_keys:
            return
        # 仍然满：按最后一次命中的时间排序，丢掉最旧的四分之一
        overflow = max(1, len(self._hits) - self.max_keys // 2)
        for name, _ in sorted(self._hits.items(), key=lambda item: item[1][-1] if item[1] else 0.0)[:overflow]:
            self._hits.pop(name, None)
