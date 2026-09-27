"""滑动窗口计数的公共机械：窗口裁剪、键空间上限与淘汰。
"""
from __future__ import annotations

from collections import OrderedDict, deque


class SlidingWindow:
    """单个键的时间戳窗口。
    """

    __slots__ = ('_marks',)

    def __init__(self) -> None:
        self._marks: deque[float] = deque()

    def __len__(self) -> int:
        """窗口内条数（未裁剪，调用方应先用 ``prune``）。"""
        return len(self._marks)

    def prune(self, window_seconds: float, now: float) -> None:
        """丢掉窗口外的时间戳。
        """
        cutoff = now - window_seconds
        marks = self._marks
        while marks and marks[0] <= cutoff:
            marks.popleft()

    def append(self, now: float) -> None:
        self._marks.append(now)

    def clear(self) -> None:
        """清空窗口（达到阈值封禁后重新计数时用）。"""
        self._marks.clear()


class KeyedWindows:
    """按 key 的窗口表，键数量封顶并按最近使用淘汰。
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
