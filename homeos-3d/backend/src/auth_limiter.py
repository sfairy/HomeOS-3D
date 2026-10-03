from __future__ import annotations

from collections import defaultdict, deque
from math import ceil
from threading import Lock
from time import monotonic


def retry_after_headers(seconds: int) -> dict[str, str]:
    # [补充说明] 统一的 429 响应头：秒数由各自的限流器给出，头名与下限只在这里定。
    #
    # 下限 1 秒：剩 0.2 秒时回 Retry-After: 0 等于让客户端立刻再来，反而把窗口撑满。
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
                # 封禁时**不**清空失败时间戳：清空等于解封后又白送一整个 max_failures 预算，
                # 攻击者只要每 block_seconds 打五个密码就能长期慢慢试。保留时间戳后，
                # 解封瞬间窗口里仍留着失败记录，再失败一次立刻重新封禁，直到时间戳自然过期。
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
