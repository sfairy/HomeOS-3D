"""HA 状态模型的**唯一**重置入口。

## 为什么必须只有一个入口

系统里有两份内存状态模型（``StateHub`` 写侧 / ``StateStore`` 读侧），断连清空时
**必须成对清理**。此前这件事被拆成两个小模块、由调用方自己按顺序调：

- ``api/ha/state_store_reset.clear_state_store_after_ha_disconnect``（只清 L1）
- ``api/ha/connection_clear.clear_ha_catalog_after_disconnect``（清 Hub 后**顺带**调上一个）

代码注释里记着两起由此产生的事故：

1. 只清 Hub 时，``/ws/runtime`` 首推与 ``state_replay`` 仍会吐出旧实体（L1 没清）；
2. 只清 L1 时，隐藏/禁用实体会从内存里消失，下一次对账才回来（Hub 没清）。

「两个都要调」这种约束靠人记是不可靠的。这里收成一个函数，调用方只表达**意图**
（「断开后清空」），具体清哪些、按什么顺序、要不要广播，都由本模块负责。

## 放在域层而不是 api 层

重置的对象是域层的内存模型（Hub / L1），api 只是触发者。放在 ``domains/ha`` 还让
「谁在重置状态」这件事可以被领域层的自检直接 import 到，不必穿过 HTTP 面。
"""

from __future__ import annotations

import logging
from typing import Any

from ....realtime.state_divergence import compare_state_models, record_divergence

logger = logging.getLogger("homeos.ha.state_reset")


async def _clear_hub(connector: Any, reason: str) -> int:
    """清空 Hub，返回清理前的实体数。"""
    state_hub = getattr(connector, "state_hub", None) if connector is not None else None
    if state_hub is None:
        return 0
    try:
        count = len(await state_hub.state_pairs())
        await state_hub.replace([])
        return count
    except Exception:
        logger.warning("重置 StateHub 失败（reason=%s）", reason, exc_info=True)
        return 0


def _clear_l1(app_state: Any, reason: str) -> int:
    """清空 L1，返回清理前的实体数。

    用 ``set_all([])`` 而不是直接清字典：它会同时写环形缓冲与计数，让「重连后的
    ``state_replay``」也从空基线开始（否则客户端会拿到一堆指向已删除实体的旧变更）。
    """
    realtime = getattr(app_state, "realtime", None)
    state_store = getattr(realtime, "state_store", None) if realtime is not None else None
    if state_store is None:
        return 0
    try:
        count = state_store.get_count()
        state_store.set_all([])
        state_store.handle_ha_disconnected()
        return count
    except Exception:
        logger.warning("重置 StateStore 失败（reason=%s）", reason, exc_info=True)
        return 0


async def _notify_catalog_cleared(connector: Any, reason: str) -> None:
    notifier = getattr(connector, "notify_catalog_changed", None) if connector is not None else None
    if not callable(notifier):
        return
    try:
        await notifier("cleared", {"entities": 0, "devices": 0, "areas": 0})
    except Exception:
        logger.warning("广播目录清空失败（reason=%s）", reason, exc_info=True)


async def _verify_clean(app_state: Any, connector: Any, reason: str) -> None:
    """重置后立刻对一次漂移：残留会即时可见，而不是等到下次快照。"""
    state_hub = getattr(connector, "state_hub", None) if connector is not None else None
    realtime = getattr(app_state, "realtime", None)
    state_store = getattr(realtime, "state_store", None) if realtime is not None else None
    if state_hub is None or state_store is None:
        return
    try:
        report = record_divergence(compare_state_models(await state_hub.state_pairs(), state_store.get_all()))
    except Exception:
        logger.debug("重置后漂移自检失败（忽略）", exc_info=True)
        return
    if report.total:
        logger.warning("状态模型重置后仍有残留：%s（reason=%s）", report.as_dict(), reason)


async def reset_ha_state_models(
    app_state: Any,
    connector: Any,
    *,
    reason: str,
    notify_catalog: bool = True,
) -> dict[str, Any]:
    """清空两份状态模型并（可选）广播目录清空。

    顺序刻意是「先 Hub 后 L1」：Hub 的清理会触发 ``state_removed`` 推送，此时 L1 若仍是
    旧表，REST ``/entities`` 与事件日志那一侧会短暂读到「已被删除但仍在」的实体；反过来
    先清 L1 则 WS 侧短暂读到旧实体。两个窗口都无法完全消除（这不是一个原子操作），但
    「先 Hub」让**客户端**先收到权威的删除，比让它们看到幽灵实体更好。

    任何一步失败都不抛给调用方 —— 「清不干净」不该让断连处理本身失败，但必须留下
    WARNING。返回清理前后的实体数，便于调用方写审计日志。
    """
    hub_cleared = await _clear_hub(connector, reason)
    l1_cleared = _clear_l1(app_state, reason)
    if notify_catalog:
        await _notify_catalog_cleared(connector, reason)
    await _verify_clean(app_state, connector, reason)
    logger.info("已重置状态模型：hub %d → 0，l1 %d → 0（reason=%s）", hub_cleared, l1_cleared, reason)
    return {"reason": reason, "hubCleared": hub_cleared, "l1Cleared": l1_cleared}


__all__ = ["reset_ha_state_models"]
