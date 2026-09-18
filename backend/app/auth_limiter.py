"""登录失败次数限制器（内存态，按进程生效）。

用途：对同一用户名 / 来源连续失败的登录请求做短时封禁，
挡住暴力猜密码，同时不引入外部缓存依赖。
代价是状态不跨进程：多 worker 部署时各自计数，属可接受的取舍。

页面上还有一个「键由外部输入决定」的场景：中控配对的 6 位码。那类键空间等于
外部可以随便造，因此另配 ``BoundedAttemptLimiter``（带键上限的一层包装）。
"""
from __future__ import annotations

from collections import OrderedDict, defaultdict, deque
from threading import Lock
# 用 monotonic 而非 time.time：系统时间被校准时不会让封禁窗口提前结束或永久卡死。
from time import monotonic


class BoundedAttemptLimiter:
    """带键上限的失败计数器：包一层 ``LoginAttemptLimiter`` 并管理键空间。

    为什么需要这一层：``LoginAttemptLimiter`` 的键由调用方给定，一旦键来自外部
    输入（被尝试的配对码、被猜的用户名），键空间就等于外部可以随便造 —— 不封顶
    就是一条内存放大路径，也是 B33 记的那个问题。

    策略：按最近使用顺序记住键，超过 ``max_keys`` 就淘汰最久未用的那个（连它的
    失败与封禁记录一起清掉）。代价是「被淘汰的键等于重新开始计数」—— 想挤掉自己
    正在磨的那个键，得先造出 ``max_keys`` 个其它键，每一次都要花掉调用方那一层的
    共享预算（配对码的跨来源预算 30 次/分钟，见 ``api/displays.py``），因此这条路
    比正常记账贵得多。也正因如此，这一层只用来兜底，不能替代共享预算。
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

        参数:
            max_failures: 窗口内允许的失败次数上限。
            window_seconds: 统计窗口长度（秒）。
            block_seconds: 超限后的封禁时长（秒）。
            max_keys: 同时记住的键数量上限。
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

    def tracked_keys(self) -> int:
        """当前记住的键数量（自检用）。"""
        with self._lock:
            return len(self._keys)

    def _remember(self, key: str) -> None:
        """把键挪到队尾并按上限淘汰；调用方必须已持有 _lock。"""
        self._keys.pop(key, None)
        self._keys[key] = None
        while len(self._keys) > self.max_keys:
            (oldest, _unused) = self._keys.popitem(last=False)
            self._limiter.reset(oldest)


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
        """记录阈值。

        参数:
            max_failures: 窗口内允许的失败次数上限。
            window_seconds: 统计窗口长度（秒）。
            block_seconds: 超限后的封禁时长（秒）。
        """
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
