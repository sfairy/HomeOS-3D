"""滑动窗口计数的公共机械：窗口裁剪、键空间上限与淘汰。

本模块只回答两个问题：**多久以前的时间戳该丢**、**键太多时先丢谁**。配额（允许几次、超限
后果是什么）与记账口径留在各自的限流器里 —— 那是各域的业务，不是可共享的机械。

存在的理由：这两个问题原本在 ``auth_limiter.LoginAttemptLimiter``（登录 / 中控配对 / 授权
激活 / HA 测试）与 ``api/global_logs.ClientLogLimiter``（客户端日志上报）里各写了一遍。两处
对「窗口边界算不算过期」「淘汰时丢计数还是丢封禁」的理解一旦走散，表现是限流在某个入口静默
失效，而且不报错。合并之后这里就是那套判据的唯一出处。
"""
from __future__ import annotations

from collections import OrderedDict, deque


class SlidingWindow:
    """单个键的时间戳窗口。

    时间源由调用方传入（统一用 ``time.monotonic``：系统时间被校准时不会让窗口提前结束或
    永久卡死）。只存时间戳、不存计数 —— 窗口是**滑动**的，条数必须按当前时刻重算，缓存一个
    整数就会在「窗口已过半」时骗过阈值判断。
    """

    __slots__ = ('_marks',)

    def __init__(self) -> None:
        self._marks: deque[float] = deque()

    def __len__(self) -> int:
        """窗口内条数（未裁剪，调用方应先用 ``prune``）。"""
        return len(self._marks)

    def prune(self, window_seconds: float, now: float) -> None:
        """丢掉窗口外的时间戳。

        边界取「``<=`` cutoff 即算过期」：合并两处实现时统一到这一侧（原本登录限流器写的是
        ``<``、客户端日志写的是 ``<=``，差异只在一个时间戳恰好等于边界时成立，浮点时钟下
        不可复现，但留两套判据没有意义）。
        """
        cutoff = now - window_seconds
        marks = self._marks
        while marks and marks[0] <= cutoff:
            marks.popleft()

    def append(self, now: float) -> None:
        """记一个时间戳。后来者必须不早于已有值，``prune`` 从头弹出才成立。"""
        self._marks.append(now)

    def clear(self) -> None:
        """清空窗口（达到阈值封禁后重新计数时用）。"""
        self._marks.clear()


class KeyedWindows:
    """按 key 的窗口表，键数量封顶并按最近使用淘汰。

    键通常来自外部输入（被猜的用户名、被试的配对码、请求对端地址），不封顶就是一条内存放大
    路径：每换一个新键只留一条记录，攒够就吃满内存，而且它们**永不清理** —— 清理只发生在
    「同一个键被再次访问」的时候。

    只做「最近使用」淘汰，不做「按损失大小淘汰」：后者需要知道哪些键正在封禁中，那是限流器
    自己的知识（见 ``LoginAttemptLimiter._trim``）。
    """

    def __init__(self, window_seconds: float, *, max_keys: int) -> None:
        self.window_seconds = window_seconds
        self.max_keys = max(1, int(max_keys))
        self._windows: OrderedDict[str, SlidingWindow] = OrderedDict()

    def window(self, key: str) -> SlidingWindow:
        """取该键的窗口（没有就建），并把它挪到「最近使用」位，顺带按上限淘汰。"""
        window = self._windows.pop(key, None)
        if window is None:
            window = SlidingWindow()
        self._windows[key] = window
        while len(self._windows) > self.max_keys:
            self._windows.popitem(last=False)
        return window

    def count(self, key: str, now: float) -> int:
        """裁剪后该键窗口内的条数；不记账。取窗口会把该键刷成「最近使用」，这是有意的：
        正在被访问的键不该在键空间吃紧时被淘汰。"""
        window = self.window(key)
        window.prune(self.window_seconds, now)
        return len(window)

    def record(self, key: str, now: float) -> int:
        """记一条并返回记账后的条数。"""
        window = self.window(key)
        window.prune(self.window_seconds, now)
        window.append(now)
        return len(window)

    def discard(self, key: str) -> None:
        """丢掉该键（登录成功、配对成功等「从此重新计数」的场合）。"""
        self._windows.pop(key, None)

    def __contains__(self, key: str) -> bool:
        return key in self._windows

    def __len__(self) -> int:
        return len(self._windows)
