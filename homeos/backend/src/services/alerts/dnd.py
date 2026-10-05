"""免打扰（DND）时段判断与默认窗口（对齐 ``@homeos/shared`` notification/dnd.util.ts）。

- ``start > end``：跨午夜（如 22→8）；
- ``start == end``：视为全天免打扰；
- ``start < end``：同日窗口；
- 任一缺失视为未配置，``is_dnd_active_now`` 返回 False。
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any

#: 缺省 DND 窗口（与 AppConfig notification 默认值对齐）。
DEFAULT_DND_START = 22
DEFAULT_DND_END = 8


def is_dnd_active(hour: float, dnd_start: float, dnd_end: float) -> bool:
    h = math.floor(hour)
    s = math.floor(dnd_start)
    e = math.floor(dnd_end)
    if s > e:
        return h >= s or h < e
    if s == e:
        return True
    return h >= s and h < e


def is_dnd_active_now(cfg: dict[str, Any] | None, now: datetime | None = None) -> bool:
    """基于配置判断指定时刻是否处于免打扰；``dndStart`` / ``dndEnd`` 任一缺失返回 False。"""
    cfg = cfg or {}
    dnd_start = cfg.get("dndStart")
    dnd_end = cfg.get("dndEnd")
    if dnd_start is None or dnd_end is None:
        return False
    reference = now or datetime.now()
    return is_dnd_active(reference.hour, int(dnd_start), int(dnd_end))


def dnd_duration_hours(dnd_start: int, dnd_end: int) -> int:
    """计算勿扰持续小时数（相等视为全天 24）。"""
    if dnd_start > dnd_end:
        return 24 - dnd_start + dnd_end
    if dnd_start == dnd_end:
        return 24
    return dnd_end - dnd_start


__all__ = [
    "DEFAULT_DND_START",
    "DEFAULT_DND_END",
    "is_dnd_active",
    "is_dnd_active_now",
    "dnd_duration_hours",
]
