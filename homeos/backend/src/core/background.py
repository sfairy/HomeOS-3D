"""后台任务托管：持有强引用，避免 asyncio 任务被 GC 提前回收（对齐 RUF006）。"""

from __future__ import annotations

import asyncio
from collections.abc import Coroutine
from typing import Any

_tasks: set[asyncio.Task[Any]] = set()


def spawn_background(coro: Coroutine[Any, Any, Any]) -> asyncio.Task[Any]:
    """把协程调度为后台任务，并在其结束前保持强引用。"""
    task = asyncio.ensure_future(coro)
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return task


__all__ = ["spawn_background"]
