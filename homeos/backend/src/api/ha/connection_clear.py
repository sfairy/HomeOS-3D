"""断开 HA 连接后清空 StateHub / StateStore 并广播目录清空。"""

from __future__ import annotations

from typing import Any

from .state_store_reset import clear_state_store_after_ha_disconnect


async def clear_ha_catalog_after_disconnect(app_state: Any, connector: Any) -> None:
    await connector.state_hub.replace([])
    clear_state_store_after_ha_disconnect(app_state)
    await connector.notify_catalog_changed("cleared", {"entities": 0, "devices": 0, "areas": 0})
