"""动作序列执行（对齐 shared/home-exec/execute-action-sequence.util.ts）。

算法：按顺序扫描动作，把连续的「无延时」动作作为一批并发执行；遇到带延时的动作时
先等待延时再单独串行执行。单条失败不影响批次内其它动作（等价 Promise.allSettled）。
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

DelayUnit = str  # 'seconds' | 'milliseconds'


def delay_to_ms(delay: Any, unit: DelayUnit = "milliseconds") -> int:
    if not isinstance(delay, (int, float)) or isinstance(delay, bool):
        return 0
    if delay <= 0:
        return 0
    return int(delay * 1000) if unit == "seconds" else int(delay)


def _fallback_result(error: Exception) -> dict[str, Any]:
    return {
        "entity_id": "unknown",
        "service": "unknown",
        "success": False,
        "error": str(error) or error.__class__.__name__,
    }


async def execute_action_sequence(
    items: list[dict[str, Any]],
    execute_one: Callable[[dict[str, Any]], Awaitable[dict[str, Any]]],
    delay_unit: DelayUnit = "milliseconds",
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    index = 0
    total = len(items)
    while index < total:
        batch: list[dict[str, Any]] = []
        while index < total and not items[index].get("delay"):
            batch.append(items[index])
            index += 1
        if batch:
            settled = await asyncio.gather(
                *(execute_one(item) for item in batch), return_exceptions=True
            )
            for outcome in settled:
                if isinstance(outcome, Exception):
                    results.append(_fallback_result(outcome))
                else:
                    results.append(outcome)
        if index < total:
            item = items[index]
            wait_ms = delay_to_ms(item.get("delay"), delay_unit)
            if wait_ms > 0:
                await asyncio.sleep(wait_ms / 1000)
            # 单条失败不得中断后续步骤（与无延时批次的 allSettled 语义保持一致），
            # 否则一个异常动作会让整条「回家/离家」序列半途而废。
            try:
                results.append(await execute_one(item))
            except Exception as exc:
                results.append(_fallback_result(exc))
            index += 1
    return results
