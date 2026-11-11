"""批量控制的执行器（``POST /api/v1/services/batch``）。

与单条下发共用同一条出口（``CommandProxyService``），区别只在**编排**：

- 限并发（默认 4，上限 16）：串行太慢（100 台设备几十秒），无上限会打爆 HA 与连接池；
- 逐项结果：批量操作最怕「一部分成功、界面说全成功」，所以每项都带 ``ok`` / ``error``；
- ``cancelOnError``：第一条失败即停止**后续**下发，已在途的如实返回。

按实体串行由命令通道自己保证（同实体两次下发不会交错），这里只做跨实体并发。
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from .command_proxy import build_control_result, build_service_call_dto, dispatch_service_call

logger = logging.getLogger("homeos.command_proxy.batch")

DEFAULT_BATCH_CONCURRENCY = 4
MAX_BATCH_CONCURRENCY = 16


def _concurrency(raw: Any) -> int:
    try:
        value = int(raw)
    except (TypeError, ValueError):  # fmt: skip
        logger.debug("批量并发参数非法，回落默认值: %r", raw)
        return DEFAULT_BATCH_CONCURRENCY
    return max(1, min(MAX_BATCH_CONCURRENCY, value))


async def _dispatch_one(proxy: Any, dto: dict[str, Any], index: int) -> dict[str, Any]:
    """单条下发 → 结果行。失败只记在该行，不抛出（整批失败由调用方决定）。"""
    try:
        normalized = build_control_result(await dispatch_service_call(proxy, dto))
        return {
            "index": index,
            "entityId": dto["entity_id"],
            "ok": bool(normalized.get("ok")),
            "pending": bool(normalized.get("pending")),
            "skipped": bool(normalized.get("skipped")),
            "verified": normalized.get("verified"),
        }
    except Exception as exc:  # 单项失败不打断整批（除非调用方要求 cancel_on_error）
        logger.warning("批量控制单项失败: %s", dto["entity_id"], exc_info=True)
        return {
            "index": index,
            "entityId": dto["entity_id"],
            "ok": False,
            "error": str(exc) or exc.__class__.__name__,
        }


async def run_batch(
    proxy: Any,
    items: list[dict[str, Any]],
    *,
    concurrency: Any = None,
    cancel_on_error: bool = False,
) -> dict[str, Any]:
    """并发下发一批服务调用；返回逐项结果 + 汇总。

    ``items`` 是已通过 DTO 校验的原始条目（``CallServiceDto.model_dump()``）。校验（许可 /
    连接 / 实体）由路由层在调用前统一完成 —— 一条不合格就整批拒绝，避免「半批通过」。
    """
    limit = _concurrency(concurrency)
    semaphore = asyncio.Semaphore(limit)
    results: list[dict[str, Any] | None] = [None] * len(items)
    stop = asyncio.Event()

    def _mark_cancelled(index: int) -> bool:
        """已取消时登记「跳过」并返回真；未取消返回假。

        取消检查要出现两次（进入协程前 / 拿到并发槽后）：前者避免为已取消的条目排队，
        后者处理「排队期间才被取消」。把这两处收敛成一次登记，避免漏改其中一处。
        """
        if not stop.is_set():
            return False
        results[index] = {"index": index, "ok": False, "skipped": True, "error": "batch_cancelled"}
        return True

    async def _run_one(index: int, item: dict[str, Any]) -> None:
        if _mark_cancelled(index):
            return
        async with semaphore:
            if _mark_cancelled(index):
                return
            dto = build_service_call_dto(
                domain=str(item.get("domain") or ""),
                service=str(item.get("service") or ""),
                entity_id=str(item.get("entity_id") or ""),
                service_data=item.get("service_data") or {},
                return_response=bool(item.get("return_response")),
                idempotency_key=item.get("idempotency_key"),
            )
            results[index] = await _dispatch_one(proxy, dto, index)
            if cancel_on_error and not results[index]["ok"]:
                stop.set()

    await asyncio.gather(*(_run_one(index, item) for index, item in enumerate(items)))
    finalized = [item for item in results if item is not None]
    succeeded = sum(1 for item in finalized if item.get("ok"))
    return {
        "ok": succeeded == len(finalized) and len(finalized) == len(items),
        "total": len(items),
        "succeeded": succeeded,
        "failed": len(finalized) - succeeded,
        "results": finalized,
    }


__all__ = [
    "DEFAULT_BATCH_CONCURRENCY",
    "MAX_BATCH_CONCURRENCY",
    "run_batch",
]
