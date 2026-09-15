"""登录失败次数限制器（内存态，按进程生效）。

用途：对同一用户名 / 来源连续失败的登录请求做短时封禁，
挡住暴力猜密码，同时不引入外部缓存依赖。
代价是状态不跨进程：多 worker 部署时各自计数，属可接受的取舍。
"""
from __future__ import annotations

from collections import defaultdict, deque
from threading import Lock
# 用 monotonic 而非 time.time：系统时间被校准时不会让封禁窗口提前结束或永久卡死。
from time import monotonic


class LoginAttemptLimiter:
    """滑动窗口计数器 + 封禁表，按 key（通常是用户名）分别计数。

    默认策略：300 秒窗口内失败 5 次，封禁 600 秒。达到阈值时清空窗口计数，
    这样解封后是重新开始计数，而不是一进来就又被立刻封禁。
    """

    def __init__(
        self,
        max_failures: int = 5,
        window_seconds: int = 300,
        block_seconds: int = 600,
    ) -> None:
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self.block_seconds = block_seconds
        self._failures = defaultdict(deque)
        self._blocked_until = {}
        self._lock = Lock()

    def blocked(self, key: str) -> bool:
        """判断该 key 当前是否处于封禁中；顺带清理已过期的记录。"""
        now = monotonic()
        with self._lock:
            blocked_until = self._blocked_until.get(key, 0)
            if blocked_until > now:
                return True
            # 已过封禁时间：删掉封禁标记，避免这张表随 key 数量一直增长。
            self._blocked_until.pop(key, None)
            self._prune(key, now)
            return False

    def record_failure(self, key: str) -> None:
        """记录一次失败；达到阈值就写入封禁时间并清空窗口。"""
        now = monotonic()
        with self._lock:
            # 先剔除窗口外的旧失败，保证计数反映的是「最近一段时间的失败」。
            self._prune(key, now)
            failures = self._failures[key]
            failures.append(now)
            if len(failures) >= self.max_failures:
                self._blocked_until[key] = now + self.block_seconds
                # 清空窗口：解封后重新计数，避免刚解封就被一次失败再次封禁。
                failures.clear()

    def reset(self, key: str) -> None:
        """登录成功后清空该 key 的失败与封禁记录。"""
        with self._lock:
            self._failures.pop(key, None)
            self._blocked_until.pop(key, None)

    def _prune(self, key: str, now: float) -> None:
        """丢弃窗口外的失败时间戳；窗口清空后连键一起删掉。"""
        failures = self._failures.get(key)
        if failures is None:
            return
        cutoff = now - self.window_seconds
        # deque 里时间递增，从头弹出即可；一旦空掉就删除整个键，
        # 否则 defaultdict 会为每个尝试过的用户名永久留一个空 deque。
        while failures and failures[0] < cutoff:
            failures.popleft()
        if not failures:
            self._failures.pop(key, None)
