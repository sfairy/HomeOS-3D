"""受管后台任务：``asyncio.create_task`` 的替身。

为什么要它
----------
``asyncio.create_task(coro)`` 有三个常见陷阱，仓库里有 50 处这样的调用：

1. **异常丢失**：任务里漏出的异常只在事件循环关闭时打一条
   ``Task exception was never retrieved``，与「哪个组件、哪次操作」完全脱节；
2. **引用丢失**：事件循环只保留任务的弱引用，任务在 ``await`` 期间可能被 GC 回收
   （真实故障形态是「后台刷新偶尔跑一半就没了」，且不可复现）；
3. **停机不等待**：进程退出时这些任务被直接掐断，写到一半的文件 / 事务没有收尾机会。

本模块把这三点收进一个地方：``spawn`` 保留强引用、异常统一落日志、``shutdown`` 统一
取消并等待。

用法
----
    from homeos.backend.src.platform.core.runtime.background_tasks import background_tasks

    background_tasks.spawn(self._refresh_later(), label="ha.sync.refresh")

    # 进程停机
    await background_tasks.shutdown()

注意：``spawn`` 只接**协程对象**（不是可调用对象）——传入 ``self.fn()`` 而不是
``self.fn``，这样创建协程的时机在调用点、异常也能追溯到调用点。
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from typing import Any

LOGGER = logging.getLogger(__name__)

#: 停机等待上限：超过就放弃等待并记一条告警（不能让一个卡死的后台任务拖住整个停机）。
DEFAULT_SHUTDOWN_TIMEOUT = 5.0


class BackgroundTasks:
    """后台任务的登记簿（一个进程一个实例即可）。"""

    def __init__(self, *, name: str = "background") -> None:
        self._name = name
        self._tasks: set[asyncio.Task[Any]] = set()

    def spawn(self, coro: Any, *, label: str = "") -> asyncio.Task[Any]:
        """创建并登记一个后台任务；协程异常由 ``_on_done`` 统一记录。"""
        task = asyncio.create_task(coro, name=f"{self._name}:{label or 'task'}")
        self._tasks.add(task)
        task.add_done_callback(lambda done: self._on_done(done, label))
        return task

    def _on_done(self, task: asyncio.Task[Any], label: str) -> None:
        # 先摘引用再取异常：取出异常后的任务不再需要强引用。
        self._tasks.discard(task)
        if task.cancelled():
            LOGGER.debug("后台任务已取消：%s", label or task.get_name())
            return
        error = task.exception()
        if error is not None:
            # ``exception()`` 已消费异常，不会被事件循环再报一次「never retrieved」。
            LOGGER.error("后台任务失败：%s", label or task.get_name(), exc_info=error)

    def pending(self) -> int:
        return len(self._tasks)

    async def shutdown(self, timeout: float = DEFAULT_SHUTDOWN_TIMEOUT) -> None:
        """取消全部在飞任务并等待收尾；超时则放弃等待（不阻塞停机）。"""
        if not self._tasks:
            return
        tasks = list(self._tasks)
        LOGGER.info("停机等待 %d 个后台任务", len(tasks))
        for task in tasks:
            task.cancel()
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait(tasks, timeout=timeout)


#: 进程级登记簿。测试里不要复用全局实例（会跨用例累积），需要隔离时自建一个。
background_tasks = BackgroundTasks()
