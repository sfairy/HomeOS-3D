"""WS 广播 API（领域事件 / 通知 / 安防 / 地震 / TTS）—— 从 ``RealtimeGateway`` 拆出的协作者之一。

拆分动机：``gateway.py`` 1161 行里「连接生命周期 + 订阅索引 + 广播载荷」三类职责混在一个类，
广播一侧尤其容易膨胀（每个领域事件一个包装器，21 个）。这里把**载荷构造**集中成
``build_*``-风格的一行式 ``ws_event`` 调用，网关只保留 ``sio`` 与连接状态。

**服务端事件类型优先**：所有载荷统一走 :func:`ws_payloads.ws_event`，调用方带来的
``type`` 一律被服务端覆盖（旧写法 ``{"type": X, **event}`` 允许上游伪造事件类型）。
"""
# 这些实例字段由组合方 ``RealtimeGateway.__init__`` 初始化；mixin 只提供方法，
# 不重复声明默认值（那会在类上留下共享可变对象）。
# pyright: reportUninitializedInstanceVariable=false

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from .ws_payloads import (
    DomainBroadcastEvent,
    NotificationBroadcastEvent,
    entity_visible,
    ha_status_payload,
    iso_now,
    ws_event,
)

if TYPE_CHECKING:
    import socketio

logger = logging.getLogger("homeos.realtime.gateway")


class BroadcastMixin:
    """领域事件 → 前端 store 的 fan-out。由 ``RealtimeGateway`` 组合使用。"""

    # 由 RealtimeGateway.__init__ 注入：
    sio: socketio.AsyncServer
    connected: set[str]
    app: Any

    if TYPE_CHECKING:
        # 会话镜像由 SubscriptionIndexMixin 提供；这里只声明契约。
        def _session_for(self, sid: str) -> dict[str, Any]: ...

    # ------------------------------------------------------------------ HA 状态
    async def broadcast_ha_status(self, status: str, **extra: Any) -> None:
        await self.sio.emit("ha_status", ha_status_payload(status, extra))

    async def broadcast_entities_stale(self, reason: str = "ha_disconnected") -> None:
        await self.sio.emit(
            "entities_stale",
            ws_event("entities_stale", reason=reason, timestamp=iso_now()),
        )

    async def broadcast_ha_queue_dropped(self, message: dict[str, Any]) -> None:
        # 上游 message 里的 timestamp 优先于这里的兜底（保持旧语义）。
        await self.sio.emit(
            "ha_queue_dropped",
            ws_event("ha_queue_dropped", {"timestamp": iso_now(), **message}),
        )

    # ------------------------------------------------------------------ 站内通知
    async def broadcast_notification(self, event: NotificationBroadcastEvent | dict[str, Any]) -> None:
        """站内通知广播（对齐 ws-push ``handleNotification``）。

        - ``channels`` 不含 ``socket`` 时跳过；
        - 无 ``entityId`` 的通知全员广播；
        - 绑定实体的通知按 ACL 过滤，并按 user room 去重推送；
        - 实际送达后异步回写 ``deliveredAt`` / ``deliveryChannels``。
        """
        raw_channels = event.get("channels")
        channels = raw_channels if isinstance(raw_channels, list) and raw_channels else ["in_app", "socket"]
        if "socket" not in channels:
            return
        message = ws_event("notification", event)
        entity_id = event.get("entityId")
        delivered = 0
        if not entity_id:
            await self.sio.emit("notification", message)
            delivered = len(self.connected)
        else:
            from .subscription import resolve_user_room_key

            rooms: set[str] = set()
            for sid in list(self.connected):
                session = self._session_for(sid)
                user = session.get("user") or {}
                if not entity_visible(user, str(entity_id)):
                    continue
                rooms.add(resolve_user_room_key(user, sid))
            if rooms:
                # 一个 room 发送失败不能让整条通知丢失：return_exceptions 让其余 room 照常收到。
                results = await asyncio.gather(
                    *[self.sio.emit("notification", message, to=room) for room in rooms],
                    return_exceptions=True,
                )
                for result in results:
                    if isinstance(result, Exception):
                        logger.warning("站内通知推送失败: %s", result)
            delivered = len(rooms)
        notification_id = event.get("id")
        if delivered > 0 and notification_id:
            await self._mark_notification_delivered(str(notification_id), ["socket"])

    async def _mark_notification_delivered(self, notification_id: str, channels: list[str]) -> None:
        """通知送达回写（失败留痕；对齐 ``markNotificationDelivered`` 的"不阻断投递"语义）。"""
        from ..platform.core.json_field import parse_json_array
        from ..platform.core.models import Notification

        def _write() -> None:
            database = self.app.state.database
            with database.session_factory() as session:
                row = session.get(Notification, notification_id)
                if row is None:
                    return
                existing = [item for item in parse_json_array(row.delivery_channels) if isinstance(item, str)]
                merged = list(dict.fromkeys([*existing, *channels]))
                row.delivered_at = datetime.now(UTC).replace(tzinfo=None)
                row.delivery_channels = json.dumps(merged, ensure_ascii=False)
                session.commit()

        try:
            await asyncio.to_thread(_write)
        except Exception:  # 回写失败只影响"已送达"标记，留痕后由下轮重投
            logger.warning("通知送达回写失败（下轮将重投）：id=%s channels=%s", notification_id, channels, exc_info=True)

    # ------------------------------------------------------------------ 地震预警
    async def broadcast_earthquake_alert(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """地震早期预警：高优先级全屏推送，携带震感与震中信息。"""
        await self.sio.emit(
            "earthquake_alert", ws_event("earthquake_alert", event, timestamp=iso_now())
        )

    async def broadcast_earthquake_confirmation(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """台网核定速报 / 迟到确认：轻量公报弹层（非全屏倒计时）。"""
        payload = ws_event("earthquake_confirmation", event)
        payload.setdefault("alertKind", "confirmation")
        payload["timestamp"] = iso_now()
        await self.sio.emit("earthquake_confirmation", payload)

    # ------------------------------------------------------------------ 领域事件 fan-out
    async def _emit_domain(self, event: str, message: DomainBroadcastEvent | dict[str, Any]) -> None:
        await self.sio.emit(event, message)

    async def broadcast_home_mode_activated(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """家庭模式激活：广播模式 ID / 名称与执行统计。"""
        await self._emit_domain(
            "home_mode",
            ws_event(
                "home_mode_activated",
                modeId=event.get("modeId"),
                modeName=event.get("modeName"),
                successCount=event.get("successCount"),
                totalCount=event.get("totalCount"),
                timestamp=iso_now(),
            ),
        )

    async def broadcast_home_mode_deactivated(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """家庭模式停用：携带 modeId + exclusiveGroup + 仍激活的模式 id 列表。

        多互斥组可以同时激活，前端不能因为收到一条停用事件就清空所有激活标记。
        """
        remaining = event.get("remainingActiveModeIds")
        await self._emit_domain(
            "home_mode",
            ws_event(
                "home_mode_deactivated",
                modeId=event.get("modeId"),
                exclusiveGroup=event.get("exclusiveGroup"),
                remainingActiveModeIds=list(remaining) if isinstance(remaining, list) else [],
                timestamp=iso_now(),
            ),
        )

    async def broadcast_home_mode_restore_incomplete(
        self, event: DomainBroadcastEvent | dict[str, Any]
    ) -> None:
        """模式停用但部分域无法恢复：前端据此提示「已恢复 N 个，M 类域跳过」。"""
        await self._emit_domain(
            "home_mode",
            ws_event(
                "home_mode_restore_incomplete",
                modeId=event.get("modeId"),
                exclusiveGroup=event.get("exclusiveGroup"),
                skippedDomains=event.get("skippedDomains") or [],
                restored=event.get("restored"),
                timestamp=iso_now(),
            ),
        )

    async def broadcast_automation_executed(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """自动化执行结果：供前端展示成功/失败状态。"""
        await self._emit_domain(
            "automation_executed",
            ws_event(
                "automation_executed",
                automationId=event.get("id"),
                name=event.get("name"),
                success=event.get("success"),
                timestamp=event.get("timestamp"),
            ),
        )

    async def broadcast_security_mode_changed(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """安防布防/撤防模式变更。"""
        await self._emit_domain("security_mode", ws_event("security_mode_changed", event))

    async def broadcast_security_zones_changed(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """安防区域配置变更：前端据此刷新区域列表。"""
        await self._emit_domain("security_zones", ws_event("security_zones_changed", event))

    async def broadcast_security_alarm(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """安防告警：携带告警实体、区域、模式与动作失败列表。"""
        await self._emit_domain("security_alarm", ws_event("security_alarm", event))

    async def broadcast_security_emergency(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """紧急事件（如 SOS）：默认 action 为 SOS。"""
        await self._emit_domain(
            "security_emergency",
            ws_event(
                "security_emergency",
                action=event.get("action") or "SOS",
                timestamp=event.get("timestamp") or iso_now(),
            ),
        )

    async def broadcast_security_emergency_completed(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """紧急事件解除：通知前端关闭告警 UI。"""
        await self._emit_domain(
            "security_emergency_completed", ws_event("security_emergency_completed", event)
        )

    async def broadcast_presence_changed(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """在场状态变化：成员是否在家。"""
        await self._emit_domain("presence_changed", ws_event("presence_changed", event))

    async def broadcast_presence_all_left(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """全员离家：触发离家模式相关自动化。"""
        await self._emit_domain("presence_all_left", ws_event("presence_all_left", event))

    async def broadcast_energy_anomaly(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """能耗异常检测：携带异常设备与原因。"""
        await self._emit_domain("energy_anomaly", ws_event("energy_anomaly", event))

    async def broadcast_frigate_detection(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """Frigate 检测事件：携带摄像头/事件 ID。"""
        await self._emit_domain("frigate_detection", ws_event("frigate_detection", event))

    async def broadcast_room_presence(self, event: DomainBroadcastEvent | dict[str, Any]) -> None:
        """房间级在场检测：携带房间名/是否有人/触发传感器。"""
        await self._emit_domain("room_presence", ws_event("room_presence", event))

    async def broadcast_tts_speak(self, event: DomainBroadcastEvent | dict[str, Any], tts_speak: Any) -> None:
        """TTS 播报：调用 ``TtsSpeakService`` 选路播报，并广播播报结果。"""
        message = event.get("message") or ""
        result = await tts_speak.speak(message)
        ts = event.get("ts")
        try:
            timestamp = (
                datetime.fromtimestamp(float(ts) / 1000, tz=UTC) if ts else datetime.now(UTC)
            )
        except (TypeError, ValueError):
            # 上游给的 ts 不是数值毫秒（旧版事件或前端异常）：回退到服务端时间，
            # 但留一行线索，避免「时间戳来源不一致」永远查不到。
            logger.warning('TTS 播报时间戳非法，回退到服务端当前时间 ts=%r', ts)
            timestamp = datetime.now(UTC)
        await self._emit_domain(
            "tts_speak",
            ws_event(
                "tts_speak",
                message=message,
                success=result.get("success"),
                detail=result.get("message"),
                timestamp=timestamp.strftime("%Y-%m-%dT%H:%M:%S.")
                + f"{timestamp.microsecond // 1000:03d}Z",
            ),
        )
