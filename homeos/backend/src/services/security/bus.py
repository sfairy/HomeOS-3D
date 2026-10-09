"""进程内事件总线（对齐 Nest ``EventEmitter2`` + ``EventBusService`` 的单副本语义）。

Nest 通过 Redis 事件总线做多副本广播；本 Python 端口当前为单副本，故仅保留
本进程分发 + 可选的对外发布回调（Redis ``homeos:events`` → socket 推送由实时网关消费）。
"""

from __future__ import annotations

import asyncio
import inspect
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from ...core.background import spawn_background

logger = logging.getLogger("homeos.security.events")

Handler = Callable[[Any], Any]


class LocalEventBus:
    def __init__(self, publisher: Callable[[str, dict[str, Any]], Awaitable[None]] | None = None) -> None:
        self._handlers: dict[str, list[Handler]] = {}
        self._publisher = publisher

    def set_publisher(
        self, publisher: Callable[[str, dict[str, Any]], Awaitable[None]] | None
    ) -> None:
        """替换对外发布回调（跨副本桥接在 Redis 就绪后注入）。"""
        self._publisher = publisher

    def on(self, name: str, handler: Handler) -> None:
        self._handlers.setdefault(name, []).append(handler)

    def remove(self, name: str, handler: Handler) -> None:
        handlers = self._handlers.get(name)
        if not handlers:
            return
        try:
            handlers.remove(handler)
        except ValueError:
            pass

    async def dispatch_local(self, name: str, payload: Any = None) -> None:
        """仅在本进程分发（不触发对外发布），供 Redis 桥接接收端回放使用。"""
        for handler in list(self._handlers.get(name, [])):
            try:
                result = handler(payload)
                if inspect.isawaitable(result):
                    await result
            except Exception as exc:
                logger.warning("事件处理失败 [%s]: %s", name, exc)

    async def emit(self, name: str, payload: Any = None) -> None:
        await self.dispatch_local(name, payload)
        if self._publisher is not None:
            try:
                await self._publisher(name, payload if isinstance(payload, dict) else {"value": payload})
            except Exception as exc:
                logger.debug("事件外发失败 [%s]: %s", name, exc)

    def emit_soon(self, name: str, payload: Any = None) -> None:
        """从同步上下文触发事件（对齐 ``setImmediate``）。"""
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return
        spawn_background(self.emit(name, payload))
