"""HA 状态变更的落库与副作用扇出（从 ``bootstrap.lifespan`` 拆出）。

这里只关心「一条 HA 状态变更/对账快照进来之后要做什么」：

- 热路径：把单条变更写进 L1 与环形缓冲（``_apply_state_change``）；
- 删除：从 L1 摘掉实体并交给网关广播删除（``_apply_entity_removal``）；
- 冷路径：家庭模式 / 安防域 / 通知 / 顾问用量的独立副作用（``_run_state_change_effects``）；
- 对账：初始与周期快照的整体写入与全量广播（``_apply_initial_snapshot``）。

拆出的原因是 ``lifespan`` 已经是「装配宿主」，这些纯业务判定放进去只会继续把它撑长；
本模块不持有任何全局状态，``app`` 只作为 service locator 使用。
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI

logger = logging.getLogger("homeos.app")


def _apply_state_change(app: FastAPI, gateway: Any, store: Any, change: dict[str, Any]) -> None:
    """把单条 HA 状态变更落到 L1（同步热路径）。

    旧状态缺失时从本地 L1 补全，保证副作用消费者拿到完整变更。
    """
    entity_id = change.get("entity_id")
    if not entity_id:
        return
    if change.get("old_state") is None:
        previous = store.get(str(entity_id))
        if previous is not None:
            # 就地补全：下游（安防边沿判定、通知规则、家庭模式触发）都在同一个 dict 上做
            # 「旧态 → 新态」比较，只改局部变量会让它们全部看到 old_state=None。
            change["old_state"] = previous
    store.apply_change(str(entity_id), change.get("new_state"), change.get("changed_at"))


def _apply_entity_removal(app: FastAPI, store: Any, change: dict[str, Any]) -> dict[str, Any] | None:
    """实体在 HA 中被删除（``state_changed`` 且 ``new_state=None``）。

    只做「从 L1 摘掉 + 交给网关广播删除」两件事：

    - 不跑冷路径副作用（家庭模式 / 安防 / 通知规则）。这些消费者都是拿「旧态 → 新态」
      做边沿比较，而删除事件没有新态，喂进去只会让它们把实体判成 ``unknown`` 而不是
      「消失」；真正需要感知设备离线的链路（``unavailable`` 状态、注册表变更）另有来源。
    - 删除也要进环形缓冲（``apply_change`` 传 ``None``）：断线重连的增量回放必须能拿到
      「这条被删了」，否则客户端只能等下一次全量才把幽灵实体清掉。
    """
    entity_id = str(change.get("entity_id") or "")
    if not entity_id:
        return None
    previous = store.remove(entity_id, change.get("changed_at"))
    if previous is None:
        # 本地本来就没有：不用广播，但也不能算一次变更（否则重复删除事件会刷屏）。
        return None
    if change.get("old_state") is None:
        change["old_state"] = previous
    app.state.ha_entity_count = max(0, int(getattr(app.state, "ha_entity_count", 0)) - 1)
    return change


async def _fan_out_domain_state_change(app: FastAPI, entity_id: Any, change: dict[str, Any]) -> None:
    """安防域（毫米波 / 在场 / 事件 / 面板）各自独立消费状态变更，单个失败不影响其它域。"""
    for attr in ("mmwave", "presence", "frigate", "security_panel"):
        service = getattr(app.state, attr, None)
        if service is None:
            continue
        try:
            await service.handle_state_change(change)
        except Exception:  # 同上：安防域各自独立，失败只影响自身判定
            logger.warning("%s 状态变更处理失败: entity=%s", attr, entity_id, exc_info=True)


def _fan_out_notifications(notification: Any, entity_id: Any, change: dict[str, Any]) -> None:
    """通知域：设备健康检查（离线/低电量）与告警规则边沿求值，两个 handler 相互独立。"""
    for handler in (
        notification.handle_state_change,
        notification.handle_alert_rule_state_change,
    ):
        try:
            handler(change)
        except Exception:  # 同上：两个 handler 相互独立
            logger.warning("通知 %s 处理状态变更失败: entity=%s", handler.__name__, entity_id, exc_info=True)


async def _run_state_change_effects(
    app: FastAPI,
    gateway: Any,
    store: Any,
    change: dict[str, Any],
    *,
    broadcast: bool = True,
) -> dict[str, Any] | None:
    """冷路径副作用：家庭模式触发 / 安防域 / 通知 / 顾问用量 + WS 广播。

    批量调用时传 ``broadcast=False``，由调用方把整批变更一次性交给网关，
    避免每个实体各开一轮广播（每轮都会重算订阅与可见性并逐连接 emit）。
    """
    entity_id = change.get("entity_id")
    if not entity_id:
        return None
    if change.get("removed"):
        return _apply_entity_removal(app, store, change)
    _apply_state_change(app, gateway, store, change)
    home_mode = getattr(app.state, "home_mode", None)
    if home_mode is not None:
        try:
            await home_mode.handle_state_trigger(
                {
                    "entity_id": entity_id,
                    "old_state": change.get("old_state"),
                    "new_state": change.get("new_state"),
                }
            )
        except Exception:  # 冷路径副作用互不隔离：单个失败不能带塌其余副作用
            logger.warning("家庭模式状态触发失败: entity=%s", entity_id, exc_info=True)
    await _fan_out_domain_state_change(app, entity_id, change)
    notification = getattr(app.state, "notification", None)
    if notification is not None:
        _fan_out_notifications(notification, entity_id, change)
    advisor_usage = getattr(app.state, "advisor_usage", None)
    if advisor_usage is not None:
        try:
            advisor_usage.track_usage(change)
        except Exception:  # 用量统计属旁路观测，失败不得阻断状态广播
            logger.debug("顾问用量统计失败: entity=%s", entity_id, exc_info=True)
    if broadcast:
        sync_filter = getattr(app.state, "entity_sync_filter", None)
        if sync_filter is None or sync_filter.is_entity_syncable(str(entity_id)):
            await gateway.broadcast_state_changed_batch([change])
    return change


async def _apply_initial_snapshot(app: FastAPI, store: Any, payload: Any, bus: Any, sync_filter: Any) -> None:
    """初始 / 周期对账快照：L1 收全量，广播按展示过滤。

    载荷既可能是裸列表（旧契约），也可能是 ``{'states': [...], 'preserve': [...]}``
    （周期对账会带上窗口内已更新的实体，见 ``service_sync.sync_once``）。两种都认，
    避免漏一层就整表回退。
    """
    raw_states = payload.get("states") if isinstance(payload, dict) else payload
    preserve = payload.get("preserve") if isinstance(payload, dict) else None
    entities = [entity for entity in (raw_states or []) if isinstance(entity, dict) and entity.get("entity_id")]
    broadcast_entities = entities
    if sync_filter is not None:
        broadcast_entities = sync_filter.filter_syncable_states(entities)
    # L1 必须收全量：隐藏/禁用只是展示策略，安全实体仍需要基线来做边沿判定。
    store.set_all(entities, preserve=preserve)
    app.state.ha_entity_count = len(broadcast_entities)
    presence = getattr(app.state, "presence", None)
    if presence is not None:
        try:
            presence.seed_from_state_store()
        except Exception:  # 在场推断预热属 best-effort，失败不阻断初始快照
            logger.warning("在场推断初始播种失败", exc_info=True)
    if bus is not None:
        # 广播全量事件
        await bus.emit("ha.initial_states", {"entities": broadcast_entities})
