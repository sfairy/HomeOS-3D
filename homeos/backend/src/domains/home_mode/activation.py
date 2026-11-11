"""模式激活的执行模式编排（从 ``service.py`` 拆出）。

三种执行模式只影响「拿不到锁时怎么办」，与激活本身（两阶段提交）无关：

- ``queued``（默认 = 旧行为）：等前一次结束后再执行；
- ``single``：已有激活在进行时**直接拒绝** —— 排队会把「连按十次」变成「切十次」；
- ``restart``：取消进行中的那次（含其回滚），立即以新的为准。

拆出来的动机：``service.py`` 已被文件规模棘轮锁住，而这段是并发编排策略，
与「家庭模式是什么」不是同一类知识。
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import Awaitable, Callable
from typing import Any

logger = logging.getLogger("homeos.home_mode.activation")

EXECUTION_MODES = frozenset({"queued", "single", "restart"})


def normalize_execution_mode(raw: Any) -> str:
    """执行模式归一：非法值回落 ``queued``（旧行为）。"""
    value = str(raw or "").strip().lower()
    return value if value in EXECUTION_MODES else "queued"


async def run_with_execution_mode(
    mode_id: str,
    *,
    execution_mode: str,
    lock: asyncio.Lock,
    current_task_holder: list[asyncio.Task | None],
    run: Callable[[], Awaitable[Any]],
) -> Any:
    """按执行模式调用一次 ``run()``。

    ``current_task_holder`` 是一个单元素列表，用来让 ``restart`` 找到「进行中的那个任务」
    —— 服务对象上不需要再挂一个可变字段，编排逻辑也因此可以独立测试。
    """
    if execution_mode == "restart":
        current = current_task_holder[0]
        if current is not None and not current.done() and current is not asyncio.current_task():
            current.cancel()
            # 必须等它跑完：取消会走「回滚已执行动作」，回滚与新激活并发会让设备停在
            # 一个既不属于旧模式也不属于新模式的状态上。
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await current
        async with lock:
            task = asyncio.current_task()
            current_task_holder[0] = task
            try:
                return await run()
            finally:
                if current_task_holder[0] is task:
                    current_task_holder[0] = None

    if execution_mode == "single" and lock.locked():
        return {
            "success": False,
            "modeId": mode_id,
            "active": False,
            "error": "另一个模式切换正在进行，请稍后再试",
            "reason": "activation_in_progress",
        }

    async with lock:
        task = asyncio.current_task()
        current_task_holder[0] = task
        try:
            return await run()
        finally:
            if current_task_holder[0] is task:
                current_task_holder[0] = None


__all__ = ["normalize_execution_mode", "run_with_execution_mode"]
