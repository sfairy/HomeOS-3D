"""僵尸绑定扫描判定工具（对齐 ``device-management.util.ts``）。

职责：区分「HA 中已删除」与「仅被 HomeOS 同步过滤掉」。
状态库在 syncOnlyEnabledEntities 开启时不含禁用/隐藏实体，不能单独作为存活依据。
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any


#: 存活实体来源：状态库 ∪ HA 注册表（注册表有条目即视为仍存在于 HA）
def build_alive_entity_id_set(
    store_ids: Iterable[str], registry_ids: Iterable[str]
) -> set[str]:
    alive: set[str] = set()
    for raw in store_ids:
        entity_id = str(raw or "").strip()
        if entity_id:
            alive.add(entity_id)
    for raw in registry_ids:
        entity_id = str(raw or "").strip()
        if entity_id:
            alive.add(entity_id)
    return alive


def should_skip_zombie_scan(snapshot: dict[str, Any]) -> bool:
    """HA 尚未同步完成时，本地绑定无法判断是否已在 HA 删除，必须跳过扫描。

    已同步且两侧都空：HA 确实没有实体，本地引用才是真僵尸。
    """
    return (
        int(snapshot.get("storeCount") or 0) == 0
        and int(snapshot.get("registryCount") or 0) == 0
        and not bool(snapshot.get("haSynced"))
    )


__all__ = ["build_alive_entity_id_set", "should_skip_zombie_scan"]
