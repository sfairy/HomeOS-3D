"""后台任务托管：持有强引用，避免 asyncio 任务被 GC 提前回收（对齐 RUF006）。"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Coroutine
from typing import Any

_tasks: set[asyncio.Task[Any]] = set()


def spawn_background(coro: Coroutine[Any, Any, Any]) -> asyncio.Task[Any]:
    """把协程调度为后台任务，并在其结束前保持强引用。"""
    task = asyncio.ensure_future(coro)
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return task


async def _await_any(awaitable: Awaitable[Any]) -> Any:
    return await awaitable


def spawn_awaitable(awaitable: Awaitable[Any]) -> asyncio.Task[Any] | None:
    """把**任意** awaitable 调度为后台任务；没有运行中的事件循环时返回 ``None``。

    与 :func:`spawn_background` 的差别只在入参：``emit`` / ``publish`` 的返回值可能是
    ``Future`` 或自定义 awaitable，而 ``loop.create_task()`` **只接受协程**，直接传会抛
    ``TypeError``；调用点此前只挡 ``RuntimeError``，于是「同步发事件」这条路径会以未处理
    异常炸掉整批状态变更（且任务没有强引用，RUF006 也一并回来了）。
    """
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return None
    return spawn_background(_await_any(awaitable))


__all__ = ["spawn_awaitable", "spawn_background"]
