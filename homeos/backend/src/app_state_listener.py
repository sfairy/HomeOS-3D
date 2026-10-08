"""HA 状态监听与状态变更副作用链（从 ``app.py`` 抽出，便于聚焦维护）。

职责：
- ``_apply_state_change``：单条 HA 状态变更落到 L1（同步热路径），旧状态缺失时从本地补全。
- ``_run_state_change_effects``：冷路径副作用——家庭模式触发 / 安防域 / 通知 / 顾问用量 + WS 广播。
- ``_make_state_listener``：HA 状态监听器——全量快照写 L1/L2，增量变更经事件总线路由。
- ``_make_state_bus_handlers``：HA 事件总线处理器——本进程与 Redis 桥接副本共用同一入口。

这些函数只接受显式参数（``app`` / ``gateway`` / ``store``），不依赖 ``app.py`` 的闭包，
所有服务依赖通过 ``app.state.*`` + ``getattr`` 在运行期按需取得，便于跨副本装配与单测替身。
"""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI


def _apply_state_change(app: FastAPI, gateway: Any, store: Any, change: dict[str, Any]) -> None:
    """把单条 HA 状态变更落到 L1（同步热路径）。

    旧状态缺失（跨副本瘦负载）时从本地 L1 补全，保证副作用消费者拿到完整变更。
    """
    entity_id = change.get("entity_id")
    if not entity_id:
        return
    if change.get("old_state") is None:
        previous = store.get(str(entity_id))
        if previous is not None:
            change = {**change, "old_state": previous}
    store.apply_change(str(entity_id), change.get("new_state"), change.get("changed_at"))


async def _run_state_change_effects(app: FastAPI, gateway: Any, store: Any, change: dict[str, Any]) -> None:
    """冷路径副作用：家庭模式触发 / 安防域 / 通知 / 顾问用量 + WS 广播。"""
    entity_id = change.get("entity_id")
    sync_filter = getattr(app.state, "entity_sync_filter", None)
    if sync_filter is not None and not sync_filter.is_entity_syncable(str(entity_id)):
        return
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
        except Exception:  # noqa: BLE001 - 家庭模式触发失败不影响状态广播
            pass
    for attr in ("mmwave", "presence", "frigate", "security_panel"):
        service = getattr(app.state, attr, None)
        if service is None:
            continue
        try:
            await service.handle_state_change(change)
        except Exception:  # noqa: BLE001 - 安防域单个服务失败不影响状态广播
            pass
    notification = getattr(app.state, "notification", None)
    if notification is not None:
        # 冷路径副作用：设备健康检查（离线/低电量）与告警规则边沿求值。
        for handler in (
            notification.handle_state_change,
            notification.handle_alert_rule_state_change,
        ):
            try:
                handler(change)
            except Exception:  # noqa: BLE001 - 通知冷路径失败不影响状态广播
                pass
    advisor_usage = getattr(app.state, "advisor_usage", None)
    if advisor_usage is not None:
        try:
            advisor_usage.track_usage(change)
        except Exception:  # noqa: BLE001 - 顾问用量统计失败不影响状态广播
            pass
    await gateway.broadcast_state_changed_batch([change])


def _make_state_listener(app: FastAPI, gateway: Any, store: Any):
    """HA 状态监听：全量快照写入 L1 内存并落 L2；增量变更经事件总线路由（可跨副本）。

    状态变更统一走 ``ha.state_changed.batch`` / ``ha.state_changed`` 事件：
    本进程事件总线负责本地 fan-out，Redis 桥接负责其它副本，二者共用同一处理器，
    避免双写与重复广播。
    """

    async def _listener(kind: str, payload: Any) -> None:
        bus = getattr(app.state, "security_bus", None)
        sync_filter = getattr(app.state, "entity_sync_filter", None)
        redis = getattr(app.state, "redis", None)
        if kind == "initial":
            entities = [
                entity for entity in (payload or []) if isinstance(entity, dict) and entity.get("entity_id")
            ]
            if sync_filter is not None:
                entities = sync_filter.filter_syncable_states(entities)
            store.set_all(entities)
            app.state.ha_entity_count = len(entities)
            # L2 快照：供其它副本 initial_states 引用占位符回拉 / 重启冷恢复
            await store.save_shadow_soon(redis)
            presence = getattr(app.state, "presence", None)
            if presence is not None:
                try:
                    presence.seed_from_state_store()
                except Exception:  # noqa: BLE001 - 在场播种失败不影响状态同步
                    pass
            if bus is not None:
                # 广播全量事件（跨副本超阈值时自动降级为引用占位符）
                await bus.emit("ha.initial_states", {"entities": entities})
            return
        event = payload if isinstance(payload, dict) else {}
        raw_data = event.get("data")
        data = raw_data if isinstance(raw_data, dict) else event
        if not data.get("entity_id"):
            return
        change = {
            "entity_id": data.get("entity_id"),
            "old_state": data.get("old_state"),
            "new_state": data.get("new_state"),
            "changed_at": event.get("time_fired") or data.get("last_changed"),
        }
        if bus is None:
            # 事件总线尚未装配（启动早期）：直接走本地副作用路径
            await _run_state_change_effects(app, gateway, store, change)
            return
        coalesce = getattr(app.state, "state_ingress_coalesce", None)
        if coalesce is not None:
            # 入口微窗口合并（对齐 Nest HaStateIngressCoalesceService）：
            # 同 entity 连续变更在窗口内合并，关键域 / 非合并域立即下发。
            coalesce.enqueue(change)
            return
        await bus.emit("ha.state_changed.batch", {"changes": [change]})

    return _listener


def _make_state_bus_handlers(app: FastAPI, gateway: Any, store: Any) -> dict[str, Any]:
    """构造 HA 事件总线处理器：本进程与 Redis 桥接副本共用同一入口。"""

    async def _handle_state_changed_batch(payload: Any) -> None:
        changes = payload.get("changes") if isinstance(payload, dict) else None
        if not isinstance(changes, list):
            return
        for change in changes:
            if not isinstance(change, dict) or not change.get("entity_id"):
                continue
            await _run_state_change_effects(app, gateway, store, change)

    async def _handle_state_changed(payload: Any) -> None:
        # 单条状态变更（区域补全等本地生产者走这条）→ 复用批量路径
        if isinstance(payload, dict) and payload.get("entity_id"):
            await _run_state_change_effects(app, gateway, store, payload)

    async def _handle_initial_states(payload: Any) -> None:
        # 引用占位符：从 Redis L2 快照冷恢复（对齐 Nest ``loadFromRedisShadowRef``）
        if isinstance(payload, dict) and payload.get("_bridgeType") == "initial_states_ref":
            redis = getattr(app.state, "redis", None)
            sync_filter = getattr(app.state, "entity_sync_filter", None)
            restored = await store.recover_initial_states_if_needed(redis, sync_filter)
            if restored:
                app.state.ha_entity_count = store.get_count()
                presence = getattr(app.state, "presence", None)
                if presence is not None:
                    try:
                        presence.seed_from_state_store()
                    except Exception:  # noqa: BLE001
                        pass
            return
        entities = payload.get("entities") if isinstance(payload, dict) else None
        if not isinstance(entities, list):
            return
        sync_filter = getattr(app.state, "entity_sync_filter", None)
        if sync_filter is not None:
            entities = sync_filter.filter_syncable_states(entities)
        store.set_all(entities)
        app.state.ha_entity_count = len(entities)

    return {
        "ha.state_changed": _handle_state_changed,
        "ha.state_changed.batch": _handle_state_changed_batch,
        "ha.initial_states": _handle_initial_states,
    }
