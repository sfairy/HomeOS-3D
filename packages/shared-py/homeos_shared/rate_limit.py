"""有界滑动窗口限流器：两个后端共用同一份实现（进程内、无外部依赖）。

为什么必须在共享包里
--------------------
主应用此前的限流实现（``platform/security/limiter.py``）是一个**模块级全局字典**
``_WINDOWS: dict[str, deque[float]]``，key 是「路由 + 客户端 IP」，**永不淘汰、没有上限**。
两个直接后果：

1. 内存不有界：key 里带 IP，而那个 IP 在修复前来自可伪造的 ``X-Forwarded-For`` ——
   攻击者每请求换一个假 IP 就能无限往表里塞键（配合 ``client_ip`` 的修复一并堵住）。
2. 即使 IP 不可伪造，IPv6 网段 / NAT 后的真实客户端数量也足以把表撑到任意大小。

商店侧的 ``security/limiter.py`` 早就实现了带 ``max_keys`` 与淘汰的正确版本，只是没被主应用复用。
本模块把那份实现提成真源，两侧共用：改一处即同时生效，不会出现「一边修了、另一边还在漏」。

语义
----
* **滑动窗口**（不是固定窗口）：记录最近 ``window_seconds`` 内的命中时间戳，超出窗口的逐出。
* **有界**：key 表达到 ``max_keys`` 时先丢空桶 / 过期桶，仍不够则丢掉最久未活动的桶。
  淘汰的代价是「极冷 key 的计数被重置」，换来的是内存上限 —— 限流器的可用性优先。
* **线程安全**：``allow`` / ``retry_after`` / ``reset`` 都在同一把锁内，供 FastAPI 线程池调用。
"""
from __future__ import annotations

import threading
import time
from collections import deque

__all__ = ["SlidingWindowLimiter", "resolve_limiter_key"]


class SlidingWindowLimiter:
    """固定上限 + 滑动窗口 + 有界 key 表。

    典型用法：::

        limiter = SlidingWindowLimiter(limit=60, window_seconds=60.0)
        if not limiter.allow(client_key):
            retry_after = limiter.retry_after(client_key)
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
            return max(0.0, bucket[0] + self.window_seconds - moment)

    def reset(self, key: str | None = None) -> None:
        """清空配额。``key`` 为空时清空全部（测试与运维用）。"""
        with self._lock:
            if key is None:
                self._hits.clear()
            else:
                self._hits.pop(key, None)

    def key_count(self) -> int:
        """当前保留的 key 数量（测试与运维观测用）。"""
        with self._lock:
            return len(self._hits)

    def _evict(self, cutoff: float) -> None:
        """key 表达到上限时腾位置：先丢空桶 / 过期桶，再丢最久没活动的桶。"""
        stale = [name for name, bucket in self._hits.items() if not bucket or bucket[-1] <= cutoff]
        for name in stale:
            self._hits.pop(name, None)
        if len(self._hits) < self.max_keys:
            return
        overflow = max(1, len(self._hits) - self.max_keys // 2)
        for name, _ in sorted(
            self._hits.items(), key=lambda item: item[1][-1] if item[1] else 0.0
        )[:overflow]:
            self._hits.pop(name, None)


def resolve_limiter_key(client_ip: str, *, per_client: bool, name: str) -> str:
    """把「客户端地址判定」折成限流 key。

    判不出客户端地址时（``per_client=False``）退化成**全局桶**：所有来源不明的请求共享
    同一配额。这看起来更严，实际上是必须的 —— 若改按空地址分桶，则来源不明的请求
    各占一个独立桶，限流形同虚设；若每请求新建一个桶，key 表还会被直接撑爆。
    """
    scope = client_ip if per_client and client_ip else "global"
    return f"{name}:{scope}"
