"""进程内滑动窗口限流。

用于「按 IP / 按邮箱 / 按激活码」这类轻量配额。刻意不引入 Redis 或任何外部组件：

* 商店是自托管的单进程部署（``store/run.py`` 目前单 worker），进程内计数已经够用；
* 失败模式简单且安全 —— 进程重启即清零，只会临时放宽，不会因为限流组件本身不可用
  而把正常用户挡在门外（这是限流最常见的自伤方式）；
* 不引入新的部署依赖，符合「一个 compose 文件就能跑起来」的目标。

与 ``store/payments/reconcile.py`` 里的 ``_allow_query`` 的分工：那里按**订单号**节流
（同一笔订单不要重复查），这里按**来源/主体**配额（同一个来源不要打太多次）。
两者互补：只有前者时，攻击者换订单号即可绕过；只有后者时，同一笔订单仍会被反复查。

若将来改成多 worker / 多实例，这里的计数会按进程分裂（实际额度变成 上限 × 进程数），
届时需要换成共享存储。
"""

from __future__ import annotations

import threading
import time
from collections import deque


class SlidingWindowLimiter:
    """固定上限 + 滑动窗口 + 有界 key 表。

    ``max_keys`` 是必须的：键来自请求（IP、邮箱、激活码），不限量就是一个可被撑爆的
    字典 —— 这本身也是一条内存耗尽路径。
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
