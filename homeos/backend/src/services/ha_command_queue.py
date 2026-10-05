"""HA 断连命令队列（对齐 ha-connector/command-queue.helper.ts）。

HA WebSocket 断连期间，非高危控制指令入队等待重连 flush；超出 TTL / 队列上限 /
实例重启的命令进入 ``dropped`` 列表，供 admin 查询与重试。
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from ..core.errors import BusinessException, ErrorCode, api_error

logger = logging.getLogger("homeos.ha_command_queue")


def _consume_future_exception(future: asyncio.Future) -> None:
    """断连队列为 fire-and-forget，结果 future 由 flush/TTL 失败填充，需吞掉异常告警。"""
    if not future.cancelled():
        future.exception()

DROPPED_CAP = 50
DEFAULT_MAX_SIZE = 500


@dataclass
class _Queued:
    domain: str
    service: str
    entity_id: str
    service_data: dict[str, Any] | None
    return_response: bool
    request_id: str | None
    enqueued_at: float
    ttl_ms: int
    future: asyncio.Future = field(default=None)  # type: ignore[assignment]


class HaCommandQueue:
    def __init__(
        self,
        *,
        sender: Callable[[str, str, str, dict[str, Any] | None, bool], Awaitable[Any]],
        is_connected: Callable[[], bool],
        max_size: int = DEFAULT_MAX_SIZE,
    ) -> None:
        self._sender = sender
        self._is_connected = is_connected
        self._max_size = max_size
        self._items: list[_Queued] = []
        self._dropped: list[dict[str, Any]] = []
        self._dropped_total = 0
        self._lock = asyncio.Lock()

    def length(self) -> int:
        """当前队列长度（供 /system/diagnostics 展示）。"""
        return len(self._items)

    def dropped_total(self) -> int:
        """累计丢弃命令数（进程级计数器，仅增不减）。"""
        return self._dropped_total

    def get_dropped_recent(self) -> list[dict[str, Any]]:
        return list(self._dropped)

    def _push_dropped(self, reason: str, item: _Queued) -> None:
        self._dropped_total += 1
        self._dropped.append(
            {
                "domain": item.domain,
                "service": item.service,
                "entityId": item.entity_id,
                "serviceData": item.service_data,
                "reason": reason,
                "at": int(time.time() * 1000),
            }
        )
        if len(self._dropped) > DROPPED_CAP:
            self._dropped = self._dropped[-DROPPED_CAP:]

    async def enqueue(
        self,
        domain: str,
        service: str,
        entity_id: str,
        service_data: dict[str, Any] | None = None,
        return_response: bool = False,
        *,
        ttl_ms: int | None = None,
        request_id: str | None = None,
    ) -> Any:
        loop = asyncio.get_running_loop()
        item = _Queued(
            domain=domain,
            service=service,
            entity_id=entity_id,
            service_data=service_data,
            return_response=return_response,
            request_id=request_id,
            enqueued_at=time.monotonic(),
            ttl_ms=ttl_ms if ttl_ms is not None else 60_000,
        )
        item.future = loop.create_future()
        item.future.add_done_callback(_consume_future_exception)
        async with self._lock:
            self._expire_locked()
            if len(self._items) >= self._max_size:
                self._push_dropped("full", item)
                raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, api_error("HA_COMMAND_QUEUE_FULL"))
            self._items.append(item)
        return {"queued": True, "position": len(self._items)}

    def _expire_locked(self) -> None:
        now = time.monotonic()
        alive: list[_Queued] = []
        for item in self._items:
            if (now - item.enqueued_at) * 1000 > item.ttl_ms:
                self._push_dropped("ttl", item)
                if not item.future.done():
                    item.future.set_exception(
                        BusinessException(ErrorCode.SERVICE_UNAVAILABLE, api_error("HA_COMMAND_QUEUE_TTL_EXPIRED"))
                    )
            else:
                alive.append(item)
        self._items = alive

    async def flush(self) -> dict[str, int]:
        """重连后按序重放队列；失败的记入 dropped。"""
        async with self._lock:
            items = self._items
            self._items = []
        sent = 0
        failed = 0
        for item in items:
            if not self._is_connected():
                async with self._lock:
                    self._items.insert(0, item)
                break
            try:
                await self._sender(
                    item.domain, item.service, item.entity_id, item.service_data, item.return_response
                )
                sent += 1
                if not item.future.done():
                    item.future.set_result({"queued": False, "flushed": True})
            except Exception as exc:  # noqa: BLE001
                failed += 1
                self._push_dropped("restart", item)
                if not item.future.done():
                    item.future.set_exception(exc)
        return {"sent": sent, "failed": failed}

    async def retry_dropped(self) -> dict[str, int]:
        items = self._dropped
        self._dropped = []
        retried = 0
        queued = 0
        failed = 0
        connected = self._is_connected()
        for snapshot in items:
            domain = str(snapshot.get("domain") or "")
            service = str(snapshot.get("service") or "")
            entity_id = str(snapshot.get("entityId") or "")
            service_data = snapshot.get("serviceData") if isinstance(snapshot.get("serviceData"), dict) else None
            try:
                if connected:
                    await self._sender(domain, service, entity_id, service_data, False)
                    retried += 1
                else:
                    await self.enqueue(domain, service, entity_id, service_data)
                    queued += 1
            except Exception:  # noqa: BLE001
                failed += 1
                self._dropped.append(
                    {
                        "domain": domain,
                        "service": service,
                        "entityId": entity_id,
                        "serviceData": service_data,
                        "reason": snapshot.get("reason") or "restart",
                        "at": int(time.time() * 1000),
                    }
                )
        return {"retried": retried, "queued": queued, "failed": failed}
