"""登录失败限流：内存滑动窗口 + 封禁（含指数退避与键数上限）。

``security.limiter.rate_limit`` 是按 IP + 路由的固定窗口节流；本模块补齐按账号 + IP
的失败计数与封禁，用于登录、授权激活等「连续失败即封禁、成功即清零」场景。

两条修正（审计 P4 / P29）：

1. **指数退避**：同一键反复被封时，封禁时长按 ``block_seconds × 2^(n-1)`` 递增（上限
   ``max_block_seconds``）。固定 600 秒对「每天试几次」的慢速爆破几乎没有成本。
2. **键数上限**：``_failures`` / ``_blocked_until`` 原先只清理「再次被访问的键」，任意
   用户名 + 伪造 IP 能无限堆键。现在超过 ``max_keys`` 时按插入顺序淘汰最旧的键；
   正常部署的活跃客户端远低于此上限。
"""

from __future__ import annotations

from collections import defaultdict, deque
from math import ceil
from threading import Lock
from time import monotonic

#: 单个限流器的键数上限。与 ``security.limiter`` 的 ``DEFAULT_MAX_KEYS`` 同量级。
DEFAULT_MAX_KEYS = 4096


def retry_after_headers(seconds: int) -> dict[str, str]:
    """标准 ``Retry-After`` 响应头（至少 1 秒）。"""
    return {"Retry-After": str(max(1, int(seconds)))}


class LoginAttemptLimiter:
    """滑动窗口失败计数 + 期满封禁（可选指数退避）。

    ``max_failures`` 次窗口内失败即封禁 ``block_seconds`` 秒；``reset`` 在成功后清零。
    线程安全（FastAPI 线程池并发调用）。
    """

    def __init__(
        self,
        max_failures: int = 5,
        window_seconds: float = 300,
        block_seconds: float = 600,
        *,
        escalate: bool = False,
        max_block_seconds: float = 3600,
        max_keys: int = DEFAULT_MAX_KEYS,
    ) -> None:
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self.block_seconds = block_seconds
        self.escalate = escalate
        self.max_block_seconds = max_block_seconds
        self.max_keys = max(1, int(max_keys))
        self._failures: dict[str, deque[float]] = defaultdict(deque)
        self._blocked_until: dict[str, float] = {}
        #: 连续被封次数：用于指数退避；成功登录（``reset``）后清零。
        self._block_counts: dict[str, int] = {}
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
                # 只在「从未封禁 → 封禁」这次跃迁上累加次数；已封禁期间继续失败只是
                # 续期同一档时长，否则连续几次失败就会把退避顶到上限（对大量打错字
                # 之后终于输对的用户过于苛刻）。
                already_blocked = self._blocked_until.get(key, 0) > now
                if already_blocked:
                    count = self._block_counts.get(key, 1)
                else:
                    count = self._block_counts.get(key, 0) + 1
                    self._block_counts[key] = count
                self._blocked_until[key] = now + self._block_duration(count)
            self._enforce_key_bound()

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)
            self._blocked_until.pop(key, None)
            self._block_counts.pop(key, None)

    def _block_duration(self, count: int) -> float:
        if not self.escalate:
            return self.block_seconds
        # count=1 → block_seconds；每再被封一次翻倍，封顶 max_block_seconds。
        exponent = max(0, min(count - 1, 8))
        return float(min(self.block_seconds * (2**exponent), self.max_block_seconds))

    def _enforce_key_bound(self) -> None:
        """键数超限时淘汰最旧的失败桶（dict 保持插入顺序，取第一个即最旧）。"""
        if len(self._failures) <= self.max_keys:
            return
        overflow = len(self._failures) - self.max_keys
        for _ in range(overflow):
            oldest_key = next(iter(self._failures), None)
            if oldest_key is None:  # pragma: no cover - 并发下已被清空
                return
            del self._failures[oldest_key]
            # 只淘汰「没有封禁在身」的键；仍在封禁中的键插回队尾，
            # 避免把真正的攻击者挤出表后被立刻放行。
            if self._blocked_until.get(oldest_key, 0) > monotonic():
                self._failures[oldest_key] = deque()
                continue
            self._blocked_until.pop(oldest_key, None)
            self._block_counts.pop(oldest_key, None)

    def _prune(self, key: str, now: float) -> None:
        failures = self._failures.get(key)
        if failures is None:
            return
        cutoff = now - self.window_seconds
        while failures and failures[0] < cutoff:
            failures.popleft()
        if not failures:
            self._failures.pop(key, None)


__all__ = ["DEFAULT_MAX_KEYS", "LoginAttemptLimiter", "retry_after_headers"]
