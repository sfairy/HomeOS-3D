"""领域事件 → Socket.IO 广播桥（对齐 ``modules/ws-push/domain-events.helper.ts``）。

进程内事件总线（``LocalEventBus``）上的领域事件在此转译为 WS 客户端事件。
覆盖范围（对齐 Nest ``WsPushDomainEventsHelper``）：

 - ``notification.created`` → ``notification``（按实体 ACL 过滤 + 用户房间去重）；
 - ``homeMode.activated`` / ``homeMode.deactivated`` → ``home_mode``；
 - ``automation.executed`` → ``automation_executed``；
 - ``security.modeChanged`` / ``zonesConfigured`` / ``alarm`` / ``emergency`` /
   ``emergencyCompleted`` → ``security_*``；
 - ``presence.changed`` / ``everyoneLeft`` / ``roomChanged`` → ``presence_*`` / ``room_presence``；
 - ``energy.anomaly`` → ``energy_anomaly``；
 - ``frigate.detection`` → ``frigate_detection``；
 - ``tts.speak`` → 选路播报后广播 ``tts_speak``；
 - ``earthquake.alert`` / ``earthquake.confirmation`` → 地震全屏预警 / 公报弹层。
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("homeos.realtime.domain_events")


class DomainEventBridge:
    """把事件总线上的领域事件转译并广播给在线 WS 客户端。"""

    def __init__(self, event_bus: Any, gateway: Any, tts_speak: Any = None) -> None:
        self._event_bus = event_bus
        self._gateway = gateway
        self._tts_speak = tts_speak

    def bind(self) -> None:
        if self._event_bus is None:
            return
        handlers = {
            "notification.created": self._handle_notification,
            "homeMode.activated": self._handle_home_mode_activated,
            "homeMode.deactivated": self._handle_home_mode_deactivated,
            "automation.executed": self._handle_automation_executed,
            "security.modeChanged": self._handle_security_mode_changed,
            "security.zonesConfigured": self._handle_security_zones_changed,
            "security.alarm": self._handle_security_alarm,
            "security.emergency": self._handle_security_emergency,
            "security.emergencyCompleted": self._handle_security_emergency_completed,
            "presence.changed": self._handle_presence_changed,
            "presence.everyoneLeft": self._handle_everyone_left,
            "presence.roomChanged": self._handle_room_presence,
            "energy.anomaly": self._handle_energy_anomaly,
            "frigate.detection": self._handle_frigate_detection,
            "tts.speak": self._handle_tts_speak,
            "earthquake.alert": self._handle_earthquake_alert,
            "earthquake.confirmation": self._handle_earthquake_confirmation,
        }
        for event, handler in handlers.items():
            self._event_bus.on(event, handler)

    # ------------------------------------------------------------------ #
    # 通用分发
    # ------------------------------------------------------------------ #
    async def _safe(self, label: str, method: Any, data: Any) -> None:
        if not isinstance(data, dict):
            return
        try:
            await method(data)
        except Exception as exc:
            logger.warning("%s WS 推送失败: %s", label, exc)

    # ------------------------------------------------------------------ #
    # 通知
    # ------------------------------------------------------------------ #
    async def _handle_notification(self, data: Any) -> None:
        if not isinstance(data, dict):
            return
        try:
            await self._gateway.broadcast_notification(data)
        except Exception as exc:
            logger.warning("通知 WS 推送失败: %s", exc)

    # ------------------------------------------------------------------ #
    # 家庭模式 / 自动化
    # ------------------------------------------------------------------ #
    async def _handle_home_mode_activated(self, data: Any) -> None:
        await self._safe("家庭模式激活", self._gateway.broadcast_home_mode_activated, data)

    async def _handle_home_mode_deactivated(self, data: Any) -> None:
        await self._safe("家庭模式停用", self._gateway.broadcast_home_mode_deactivated, data)

    async def _handle_automation_executed(self, data: Any) -> None:
        await self._safe("自动化执行", self._gateway.broadcast_automation_executed, data)

    # ------------------------------------------------------------------ #
    # 安防
    # ------------------------------------------------------------------ #
    async def _handle_security_mode_changed(self, data: Any) -> None:
        await self._safe("安防模式", self._gateway.broadcast_security_mode_changed, data)

    async def _handle_security_zones_changed(self, data: Any) -> None:
        await self._safe("安防区域", self._gateway.broadcast_security_zones_changed, data)

    async def _handle_security_alarm(self, data: Any) -> None:
        await self._safe("安防告警", self._gateway.broadcast_security_alarm, data)

    async def _handle_security_emergency(self, data: Any) -> None:
        await self._safe("紧急求助", self._gateway.broadcast_security_emergency, data)

    async def _handle_security_emergency_completed(self, data: Any) -> None:
        await self._safe(
            "紧急求助结束", self._gateway.broadcast_security_emergency_completed, data
        )

    # ------------------------------------------------------------------ #
    # 在场 / 能耗 / 检测 / 儿童模式
    # ------------------------------------------------------------------ #
    async def _handle_presence_changed(self, data: Any) -> None:
        await self._safe("在场状态", self._gateway.broadcast_presence_changed, data)

    async def _handle_everyone_left(self, data: Any) -> None:
        await self._safe("全员离家", self._gateway.broadcast_presence_all_left, data)

    async def _handle_room_presence(self, data: Any) -> None:
        await self._safe("房间在场", self._gateway.broadcast_room_presence, data)

    async def _handle_energy_anomaly(self, data: Any) -> None:
        await self._safe("能耗异常", self._gateway.broadcast_energy_anomaly, data)

    async def _handle_frigate_detection(self, data: Any) -> None:
        await self._safe("Frigate 检测", self._gateway.broadcast_frigate_detection, data)

    # ------------------------------------------------------------------ #
    # TTS / 地震
    # ------------------------------------------------------------------ #
    async def _handle_tts_speak(self, data: Any) -> None:
        if not isinstance(data, dict) or self._tts_speak is None:
            return
        try:
            await self._gateway.broadcast_tts_speak(data, self._tts_speak)
        except Exception as exc:
            logger.warning("TTS 播报 WS 推送失败: %s", exc)

    async def _handle_earthquake_alert(self, data: Any) -> None:
        await self._safe("地震预警", self._gateway.broadcast_earthquake_alert, data)

    async def _handle_earthquake_confirmation(self, data: Any) -> None:
        await self._safe("地震速报", self._gateway.broadcast_earthquake_confirmation, data)


__all__ = ["DomainEventBridge"]
