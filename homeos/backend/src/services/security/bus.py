"""进程内事件总线（对齐 Nest ``EventEmitter2`` + ``EventBusService`` 的单副本语义）。

本 Python 端口为单副本，故仅保留本进程分发。
"""

from __future__ import annotations

import asyncio
import inspect
import logging
from collections.abc import Callable
from typing import Any

from ...core.background import spawn_background

logger = logging.getLogger("homeos.security.events")

Handler = Callable[[Any], Any]


class LocalEventBus:
    def __init__(self) -> None:
        self._handlers: dict[str, list[Handler]] = {}

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
        """仅在本进程分发（不触发对外发布）。"""
        for handler in list(self._handlers.get(name, [])):
            try:
                result = handler(payload)
                if inspect.isawaitable(result):
                    await result
            except Exception as exc:
                logger.warning("事件处理失败 [%s]: %s", name, exc)

    async def emit(self, name: str, payload: Any = None) -> None:
        await self.dispatch_local(name, payload)

    def emit_soon(self, name: str, payload: Any = None) -> None:
        """从同步上下文触发事件（对齐 ``setImmediate``）。"""
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return
        spawn_background(self.emit(name, payload))
