"""统一事件总线 Redis Pub/Sub 跨副本桥接（对齐 ``shared/redis/event-bus.service.ts``）。

- 单副本：Redis 未就绪时零开销回退（仅进程内分发）；
- 多副本：对桥接白名单事件（``BRIDGED_EVENTS``）异步发布到 ``homeos:event-bus``；
- 订阅端按 ``origin``（本实例 12 位 hex）忽略自己，避免回环；
- HA 状态类事件按 Nest 瘦负载策略压缩（STATE_CHANGED 剥离 ``old_state``、
  STATE_CHANGED_BATCH 批量剥离、INITIAL_STATES 超阈值改引用占位符）。
"""

from __future__ import annotations

import asyncio
import logging
import secrets
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger("homeos.shared.event_bus")

#: Redis Pub/Sub 跨副本桥接频道名（对齐 Nest ``BRIDGE_CHANNEL``）
BRIDGE_CHANNEL = "homeos:event-bus"

#: 桥接白名单（对齐 ``getBridgedEventSet()`` / ``HOMEOS_EVENT_CATALOG`` 中 bridged=true）
BRIDGED_EVENTS: frozenset[str] = frozenset(
    {
        # HA 生命周期 / 状态
        "ha.state_changed.batch",
        "ha.initial_states",
        "ha.connected",
        "ha.disconnected",
        "ha.reconnecting",
        "redis.status",
        # 系统配置
        "app.config.updated",
        # 通知
        "notification.created",
        # 家庭模式 / 自动化
        "homeMode.activated",
        "homeMode.deactivated",
        "automation.executed",
        "automation.failed",
        "automation.dropped",
        "scene.executed",
        # 安防
        "security.panel.setMode.request",
        "security.modeChanged",
        "security.zonesConfigured",
        "security.alarm",
        "security.emergency",
        "security.emergencyCompleted",
        "security.awaySimulation",
        # 在场 / 房间
        "presence.changed",
        "presence.everyoneLeft",
        "presence.roomChanged",
        "room.context",
        # 能耗
        "energy.anomaly",
        # 语音 / 检测
        "frigate.detection",
        # 冷却
        "cooldown.set",
        # UI 布局
        "SYSTEM_CONFIG_UPDATED",
        # 客户端电量
        "clientPower.reported",
        "clientPower.low",
        "clientPower.charged",
        # 地震 / 天气
        "earthquake.alert",
        "earthquake.confirmation",
        "weather.alert",
    }
)

#: INITIAL_STATES 超过该条数改用引用占位符（对齐 ``INITIAL_STATES_REF_THRESHOLD``）
INITIAL_STATES_REF_THRESHOLD = 50


def prepare_bridged_payload(event: str, payload: Any) -> Any:
    """按桥接策略转换负载（瘦负载 / 引用占位符），节省 Pub/Sub 带宽。"""
    if event == "ha.state_changed" and isinstance(payload, dict):
        return {
            "entity_id": payload.get("entity_id"),
            "new_state": payload.get("new_state"),
            "old_state": None,
            "changed_at": payload.get("changed_at"),
            "_slim": True,
        }
    if event == "ha.state_changed.batch" and isinstance(payload, dict):
        changes = payload.get("changes")
        changes = changes if isinstance(changes, list) else []
        return {
            "_bridgeType": "state_changed_batch",
            "changes": [
                {
                    "entity_id": item.get("entity_id"),
                    "new_state": item.get("new_state"),
                    "old_state": None,
                    "changed_at": item.get("changed_at"),
                    "_slim": True,
                }
                for item in changes
                if isinstance(item, dict)
            ],
        }
    if event == "ha.initial_states":
        if isinstance(payload, list) and len(payload) >= INITIAL_STATES_REF_THRESHOLD:
            return {
                "_bridgeType": "initial_states_ref",
                "count": len(payload),
                "at": _iso_now(),
            }
        if isinstance(payload, dict):
            entities = payload.get("entities")
            if isinstance(entities, list) and len(entities) >= INITIAL_STATES_REF_THRESHOLD:
                return {
                    "_bridgeType": "initial_states_ref",
                    "count": len(entities),
                    "at": _iso_now(),
                }
    return payload


def enrich_slim_state_change(event: Any, get_previous_state: Any) -> Any:
    """补全瘦负载事件的 ``old_state``（若缺失则从本地 L1 缓存查询）。"""
    if not isinstance(event, dict) or event.get("old_state") is not None:
        return event
    if event.get("_slim") is not True:
        return event
    try:
        previous = get_previous_state(event.get("entity_id"))
    except Exception:  # noqa: BLE001
        previous = None
    enriched = dict(event)
    enriched["old_state"] = previous
    return enriched


def _iso_now() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


def _as_payload_dict(payload: Any) -> dict[str, Any]:
    if isinstance(payload, dict):
        return payload
    if isinstance(payload, list):
        return {"entities": payload}
    return {"value": payload}


class EventBusBridge:
    """事件总线跨副本桥接：发布白名单事件 + 订阅回放（忽略本实例 origin）。"""

    def __init__(self, bus: Any, redis: Any) -> None:
        self._bus = bus
        self._redis = redis
        #: 本实例唯一标识（12 位 hex，对齐 Nest ``instanceId``）
        self.instance_id = secrets.token_hex(6)
        self._unsubscribe: Any | None = None
        self._enabled = False

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def start(self) -> None:
        """订阅桥接频道并把发布器挂到事件总线；Redis 未就绪时静默降级。"""
        if self._redis is None or not self._redis.is_ready():
            logger.warning("Redis 未就绪，事件总线仅走进程内通信（多副本需配置 REDIS_URL）")
            self._bus.set_publisher(self.publish)
            return
        try:
            self._unsubscribe = await self._redis.subscribe(BRIDGE_CHANNEL, self._on_message)
            self._enabled = self._unsubscribe is not None
        except Exception as exc:  # noqa: BLE001
            logger.warning("事件总线 Redis 桥接订阅失败: %s", exc)
        self._bus.set_publisher(self.publish)
        if self._enabled:
            logger.info("事件总线 Redis Pub/Sub 桥接已启用（多副本实时同步）")

    async def stop(self) -> None:
        if self._unsubscribe is not None:
            try:
                self._unsubscribe()
            except Exception:  # noqa: BLE001
                pass
            self._unsubscribe = None
        self._enabled = False

    async def publish(self, name: str, payload: Any) -> None:
        """发布白名单事件到桥接频道（fire-and-forget，不阻塞热路径）。"""
        if not self._enabled or self._redis is None:
            return
        if name not in BRIDGED_EVENTS:
            return
        try:
            await self._redis.publish(
                BRIDGE_CHANNEL,
                {
                    "event": name,
                    "payload": prepare_bridged_payload(name, _as_payload_dict(payload)),
                    "origin": self.instance_id,
                },
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("事件总线桥接发布失败 %s: %s", name, exc)

    def _on_message(self, message: Any) -> None:
        """订阅回调：忽略本实例 origin，其余事件在本进程回放（不再外发）。"""
        if not isinstance(message, dict):
            return
        event = message.get("event")
        if not event or message.get("origin") == self.instance_id:
            return
        payload = message.get("payload")
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        loop.create_task(self._bus.dispatch_local(event, payload))


__all__ = [
    "BRIDGE_CHANNEL",
    "BRIDGED_EVENTS",
    "INITIAL_STATES_REF_THRESHOLD",
    "EventBusBridge",
    "enrich_slim_state_change",
    "prepare_bridged_payload",
]
