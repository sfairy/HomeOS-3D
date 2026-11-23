"""监测器的公共出口：冷却判定与事件发布。

用水 / 用能 / 室内环境三个监测器的「发事件 + 冷却」写法完全一样。各抄一遍不仅重复，
还容易出现语义漂移 —— 例如某一处把冷却写在「判定命中之后、发布之前」，另一处写在之后，
表现为「同一次异常在某个监测器里连发两条」。这里固定顺序：**先判冷却 → 写入冷却 → 发布**。

写入放在发布之前是有意的：发布走的是 ``emit_soon``（异步派发），若等它返回再写冷却，
同一轮里紧接着的第二次判定会看到「未冷却」而重复发布。
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("homeos.monitor")


class MonitorEmitMixin:
    """依赖宿主提供 ``_cooldown`` 与 ``_bus``。"""

    _cooldown: Any = None
    _bus: Any = None

    def in_cooldown(self, namespace: str, key: str, minutes: float) -> bool:
        """是否处于冷却；否则写入冷却并返回 ``False``（调用方据此决定是否发布）。"""
        if self._cooldown is None:
            return False
        if self._cooldown.is_in_cooldown(namespace, key):
            return True
        self._cooldown.set_cooldown(namespace, key, minutes)
        return False

    def publish(self, event: str, payload: dict[str, Any]) -> None:
        if self._bus is not None:
            self._bus.emit_soon(event, payload)


__all__ = ["MonitorEmitMixin"]
