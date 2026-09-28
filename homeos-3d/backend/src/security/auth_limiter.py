"""登录失败次数限制器（内存态，按进程生效）。
"""
from __future__ import annotations

from collections import OrderedDict
from math import ceil
from threading import Lock

# 用 monotonic 而非 time.time：系统时间被校准时不会让封禁窗口提前结束或永久卡死。
from time import monotonic

from .sliding_window import SlidingWindow

#: ``LoginAttemptLimiter`` 内部两张表合计保留的键数量上限。键常常来自外部（被猜的用户名、
MAX_TRACKED_KEYS = 4096
#: 清扫的摊还步长：攒够 ``max_keys / 8`` 个新键才再扫一次。清扫本身是 O(n)，
TRIM_STEP_RATIO = 8


class BoundedAttemptLimiter:
    """带键上限的失败计数器：包一层 ``LoginAttemptLimiter`` 并管理键空间。
    """

    def __init__(
        self,
        max_failures: int = 5,
        window_seconds: int = 300,
        block_seconds: int = 600,
        *,
        max_keys: int = 1024,
    ) -> None:
        """透传阈值给内部的计数器，并记下键上限。
        """
        self._limiter = LoginAttemptLimiter(max_failures, window_seconds, block_seconds)
        self._keys: OrderedDict[str, None] = OrderedDict()
        self.max_keys = max(1, int(max_keys))
        self._lock = Lock()

    # 两个只读属性透传出去：调用方要用 block_seconds 拼 Retry-After。
    @property
    def block_seconds(self) -> int:
        """超限后的封禁时长（秒）。"""
        return self._limiter.block_seconds

    def retry_after(self, key: str) -> int:
        """该键还要等多少秒才能再试（未封禁时返回 0）。"""
        with self._lock:
            return self._limiter.retry_after(key)

    def blocked(self, key: str) -> bool:
        """该键当前是否处于封禁中。"""
        with self._lock:
            self._remember(key)
            return self._limiter.blocked(key)

    def record_failure(self, key: str) -> None:
        """记一次失败，达到阈值即封禁该键。"""
        with self._lock:
            self._remember(key)
            self._limiter.record_failure(key)

    def reset(self, key: str) -> None:
        """清空该键的失败与封禁记录（配对成功时调用）。"""
        with self._lock:
            self._keys.pop(key, None)
            self._limiter.reset(key)

    def _remember(self, key: str) -> None:
        """把键挪到队尾并按上限淘汰；调用方必须已持有 _lock。"""
        self._keys.pop(key, None)
        self._keys[key] = None
        while len(self._keys) > self.max_keys:
            (oldest, _unused) = self._keys.popitem(last=False)
            self._limiter.reset(oldest)


class LoginAttemptLimiter:
    """滑动窗口计数器 + 封禁表，按 key（通常是用户名）分别计数。
    """

    def __init__(
        self,
        max_failures: int = 5,
        window_seconds: int = 300,
        block_seconds: int = 600,
        *,
        max_keys: int = MAX_TRACKED_KEYS,
    ) -> None:
        """记录阈值。
        """
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self.block_seconds = block_seconds
        self.max_keys = max(1, int(max_keys))
        # 用 SlidingWindow 而不是裸 deque：窗口裁剪这套判据与客户端日志限流器共用一份。
        self._failures: dict[str, SlidingWindow] = {}
        self._blocked_until: dict[str, float] = {}
        self._lock = Lock()
        # 下一次清扫的触发线：每次清扫后抬一个步长，见 _trim。
        self._trim_threshold = self.max_keys

    def blocked(self, key: str) -> bool:
        """判断该 key 当前是否处于封禁中；顺带清理已过期的记录。"""
        now = monotonic()
        with self._lock:
            blocked_until = self._blocked_until.get(key, 0)
            if blocked_until > now:
                return True
            self._blocked_until.pop(key, None)
            self._prune(key, now)
            return False

    def record_failure(self, key: str) -> None:
        """记录一次失败；达到阈值就写入封禁时间并清空窗口。"""
        now = monotonic()
        with self._lock:
            # 先剔除窗口外的旧失败，保证计数反映的是「最近一段时间的失败」。
            window = self._failure_window(key)
            window.prune(self.window_seconds, now)
            window.append(now)
            if len(window) >= self.max_failures:
                self._blocked_until[key] = now + self.block_seconds
                window.clear()
            # 记账是唯一会让内部状态增长的动作，压回上限也放在这里。
            self._trim(now, keep_key=key)

    def reset(self, key: str) -> None:
        """登录成功后清空该 key 的失败与封禁记录。"""
        with self._lock:
            self._failures.pop(key, None)
            self._blocked_until.pop(key, None)

    def _failure_window(self, key: str) -> SlidingWindow:
        """取该键的失败窗口（没有就建）；调用方必须已持有 ``_lock``。"""
        window = self._failures.get(key)
        if window is None:
            window = SlidingWindow()
            self._failures[key] = window
        return window

    def _trim(self, now: float, *, keep_key: str | None = None) -> None:
        """把内部状态压回 ``max_keys`` 以内；调用方必须已持有 ``_lock``。
        """
        if len(self._failures) + len(self._blocked_until) <= self._trim_threshold:
            return
        # 第 1 步：到期的先清掉。
        for key, blocked_until in list(self._blocked_until.items()):
            if blocked_until <= now:
                del self._blocked_until[key]
        for key in list(self._failures):
            self._prune(key, now)
        overflow = len(self._failures) + len(self._blocked_until) - self.max_keys
        # 第 2 步：dict 保持插入顺序，从头丢等于先丢最早来的那些。
        if overflow > 0:
            for key in list(self._failures):
                if overflow <= 0:
                    break
                if key in self._blocked_until:
                    continue
                del self._failures[key]
                overflow -= 1
        # 第 3 步：剩下的全是封禁中的键时，只能按「最快解封」丢。
        if overflow > 0:
            for key in sorted(
                self._blocked_until, key=lambda candidate: self._blocked_until[candidate]
            ):
                if overflow <= 0:
                    break
                if key == keep_key:
                    continue
                del self._blocked_until[key]
                self._failures.pop(key, None)
                overflow -= 1
        # 抬高触发线：攒够一个步长的新键才再扫一次，清扫成本因此是摊还的。
        self._trim_threshold = self.max_keys + max(1, self.max_keys // TRIM_STEP_RATIO)

    def retry_after(self, key: str) -> int:
        """该 key 还要等多少秒才能再试（未封禁时返回 0）。
        """
        now = monotonic()
        with self._lock:
            remaining = self._blocked_until.get(key, 0) - now
            if remaining <= 0:
                self._blocked_until.pop(key, None)
                self._prune(key, now)
                return 0
            return max(1, ceil(remaining))

    def _prune(self, key: str, now: float) -> None:
        """丢弃窗口外的失败时间戳；窗口清空后连键一起删掉。
        """
        window = self._failures.get(key)
        if window is None:
            return
        window.prune(self.window_seconds, now)
        if not len(window):
            del self._failures[key]
