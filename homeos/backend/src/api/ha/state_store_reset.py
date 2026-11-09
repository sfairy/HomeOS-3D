"""断开 HA 连接时同步清空 StateStore（与 StateHub 成对）。"""

from __future__ import annotations

from typing import Any


def clear_state_store_after_ha_disconnect(app_state: Any) -> None:
    """StateHub 与 StateStore 是两份内存模型：只清 Hub 时，WS 首推/replay 仍会吐出旧实体。"""
    realtime = getattr(app_state, "realtime", None)
    state_store = getattr(realtime, "state_store", None) if realtime is not None else None
    if state_store is None:
        return
    state_store.set_all([])
    state_store.handle_ha_disconnected()
