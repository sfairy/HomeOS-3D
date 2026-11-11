"""家庭模式的设备快照采集（从 ``actions.py`` 拆出）。

快照是「模式激活 → 可撤销」的基础：激活前记下目标设备的当前状态，停用或失败回滚时
按它恢复。这里只负责**采集**（读取 + 目标筛选）与读取的容错，恢复逻辑仍在 ``actions.py``
（它与执行序列、域覆盖表耦合更紧）。

拆出来的动机：``actions.py`` 已被文件规模棘轮锁住，而快照目标筛选属于「数据整形」，
和激活状态机不是同一类知识。
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from .presets import resolve_action_kind

logger = logging.getLogger("homeos.home_mode.snapshot")

#: 采集快照时的并发上限：大户型一次激活可能有几十个目标实体，
#: 串行读取会把激活延迟拉到秒级，并发过高又会打满 HA 的 REST 通道。
HA_ENTITY_FETCH_CONCURRENCY = 8


def is_snapshot_target(action: dict[str, Any]) -> bool:
    """该动作是否是「可快照回滚的设备」：只有实体类动作才算。

    ``notify`` 的目标是消息文本、``security`` 的目标是布防档位，两者都不是实体；
    ``scene`` / ``script`` 是一次性动作，没有可回滚的「当前状态」语义。
    """
    return resolve_action_kind(action) == "entity"


async def fetch_entity_state(deps: Any, entity_id: str) -> dict[str, Any] | None:
    """读取实体当前状态；失败按「读不到」处理（调用方据此记录 missing）。"""
    try:
        return await deps.fetch_entity_state(entity_id)
    except Exception:
        logger.debug("读取实体状态失败: %s", entity_id, exc_info=True)
        return None


async def collect_device_snapshot(deps: Any, entity_configs: list[dict[str, Any]]) -> tuple[dict[str, Any], list[str]]:
    """并发采集**设备动作**目标实体的当前状态，作为回滚快照。

    返回 ``(snapshot, missing)``：``missing`` 是没采集到状态的实体 —— 它们一旦被本次激活
    改过就再也恢复不回去，必须如实上报，不能悄悄从快照里消失。

    只收「设备类」动作：``notify`` 的 ``entity_id`` 是**消息文本**、``security`` 的是
    布防档位（``armed_home`` 之类），它们不是实体。以前对所有动作都去查状态，这两个
    必然查不到，于是几乎每次激活都会报「N 个设备未采集到快照」—— 真正缺快照的设备
    反而被这条噪声淹没。
    """
    snapshot: dict[str, Any] = {}
    missing: list[str] = []
    try:
        entity_ids = [
            str(config_item.get("entity_id"))
            for config_item in entity_configs
            if isinstance(config_item.get("entity_id"), str)
            and config_item.get("entity_id")
            and is_snapshot_target(config_item)
        ]
        semaphore = asyncio.Semaphore(HA_ENTITY_FETCH_CONCURRENCY)
        fetched: list[tuple[str, dict[str, Any]] | None] = []

        async def _fetch(entity_id: str) -> None:
            async with semaphore:
                state_row = await fetch_entity_state(deps, entity_id)
                fetched.append((entity_id, state_row) if state_row else None)
                if not state_row:
                    missing.append(entity_id)

        await asyncio.gather(*(_fetch(entity_id) for entity_id in entity_ids))
        for row in fetched:
            if row:
                snapshot[row[0]] = row[1]
    except Exception as exc:
        deps.warn(f"采集设备快照失败: {exc}")
    return snapshot, sorted(set(missing))


__all__ = [
    "HA_ENTITY_FETCH_CONCURRENCY",
    "collect_device_snapshot",
    "fetch_entity_state",
    "is_snapshot_target",
]
