"""安防面板服务（对齐 ``SecurityPanelService``）。

维护布防模式与区域传感器配置，对接 HA 状态变更做入侵告警与危险传感器联动，
并提供紧急求助的设备联动执行。单副本部署下即为 Leader，直接执行实际布防。
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any

from sqlalchemy import select

from ...core.errors import api_error, bad_request
from ...core.models import SecurityEvent
from .bus import LocalEventBus
from .config import load_security_config, resolve_notification_fetch_limit
from .cooldown import NotificationCooldownService
from .panel_helpers import (
    SecurityAlarmHelper,
    SecurityEmergencyRunnerHelper,
    SecurityLinkageHelper,
    SecurityPanelStateHelper,
)
from .zones import normalize_zone_type

logger = logging.getLogger("homeos.security.panel")

ARMING_MODES = ("disarmed", "armed_home", "armed_away", "armed_night")
_SENSOR_ENTITY_RE = re.compile(r"^[\w.]+\.[\w]+$")


class SecurityConfigProvider:
    """安防配置 TTL 缓存：避免每个传感器事件都查库。"""

    def __init__(self, session_factory, ttl_seconds: float = 5.0) -> None:
        self._session_factory = session_factory
        self._ttl = ttl_seconds
        self._cached: dict[str, Any] | None = None
        self._at = 0.0

    def get(self) -> dict[str, Any]:
        now = time.monotonic()
        if self._cached is None or now - self._at > self._ttl:
            try:
                with self._session_factory() as session:
                    self._cached = load_security_config(session)
            except Exception:  # noqa: BLE001
                self._cached = self._cached or {}
            self._at = now
        return self._cached

    def refresh(self) -> None:
        self._at = 0.0


class SecurityPanelService:
    def __init__(
        self,
        session_factory,
        ha_connector,
        bus: LocalEventBus,
        cooldown: NotificationCooldownService,
        config_provider: SecurityConfigProvider,
    ) -> None:
        self._session_factory = session_factory
        self._ha = ha_connector
        self._bus = bus
        self._cooldown = cooldown
        self._config = config_provider

        self._mode = "disarmed"
        self._zones: list[dict[str, Any]] = []
        self._armed_at: int | None = None
        self._emergency_running = False
        self._last_emergency_at = 0
        self._transition_lock = asyncio.Lock()

        self.state_helper = SecurityPanelStateHelper(
            session_factory,
            {
                "getMode": lambda: self._mode,
                "setMode": self._set_mode_value,
                "getZones": lambda: self._zones,
                "setZones": self._set_zones_value,
                "getArmedAt": lambda: self._armed_at,
                "setArmedAt": self._set_armed_at_value,
            },
        )
        self.linkage_helper = SecurityLinkageHelper(session_factory, ha_connector, bus)
        self.emergency_runner = SecurityEmergencyRunnerHelper(
            session_factory=session_factory,
            bus=bus,
            ha_connector=ha_connector,
            linkage=self.linkage_helper,
            arm=self.arm,
        )
        self.alarm_helper = SecurityAlarmHelper(
            session_factory=session_factory,
            bus=bus,
            ha_connector=ha_connector,
            state_helper=self.state_helper,
            config_reader=self._config.get,
            get_current_mode=self.get_mode,
            get_zones=self.get_zones,
            get_armed_at=self.get_armed_at,
            is_zone_alarm_in_cooldown=lambda zone_id: self._cooldown.is_in_cooldown(
                "security", f"zone-alarm:{zone_id}"
            ),
            set_zone_alarm_cooldown=lambda zone_id, minutes: self._cooldown.set_cooldown(
                "security", f"zone-alarm:{zone_id}", minutes
            ),
        )

    # ------------------------------------------------------------------ #
    # 状态访问
    # ------------------------------------------------------------------ #
    def _set_mode_value(self, mode: str) -> None:
        self._mode = mode

    def _set_zones_value(self, zones: list[dict[str, Any]]) -> None:
        self._zones = zones

    def _set_armed_at_value(self, value: int | None) -> None:
        self._armed_at = value

    async def start(self) -> None:
        await self.state_helper.load_persisted_state()

    def get_mode(self) -> str:
        return self._mode

    def get_zones(self) -> list[dict[str, Any]]:
        return self._zones

    def get_armed_at(self) -> int | None:
        return self._armed_at

    # ------------------------------------------------------------------ #
    # 区域配置
    # ------------------------------------------------------------------ #
    def configure_zones(self, zones: list[dict[str, Any]] | None) -> None:
        if not isinstance(zones, list) or not zones:
            self._zones = []
            self.state_helper.persist_panel_state()
            self._bus.emit_soon(
                "security.zonesConfigured", {"count": 0, "zones": [], "timestamp": _iso_now()}
            )
            logger.info("已清空安防区域配置")
            return

        seen: set[str] = set()
        for zone in zones:
            zone_id = str(zone.get("id") or "").strip() if isinstance(zone, dict) else ""
            name = str(zone.get("name") or "").strip() if isinstance(zone, dict) else ""
            if not zone_id or not name:
                bad_request(api_error("SECURITY_ZONE_ID_NAME_REQUIRED"))
            if zone_id in seen:
                bad_request(api_error("SECURITY_ZONE_ID_DUPLICATE", zone_id))
            seen.add(zone_id)
            for sensor in zone.get("sensors") or []:
                if not _SENSOR_ENTITY_RE.match(str(sensor or "").strip()):
                    bad_request(api_error("SECURITY_SENSOR_ENTITY_INVALID", str(sensor)))

        previous_armed = {str(z.get("id")): bool(z.get("armed")) for z in self._zones}
        self._zones = [
            {
                "id": str(z.get("id") or "").strip(),
                "name": str(z.get("name") or "").strip(),
                "sensors": list(z.get("sensors") or []),
                "armed": previous_armed.get(str(z.get("id")), False),
                "zoneType": normalize_zone_type(z.get("zoneType")),
                "roomId": (str(z.get("roomId")).strip() if z.get("roomId") else None),
            }
            for z in zones
        ]
        self.state_helper.persist_panel_state()
        self._bus.emit_soon(
            "security.zonesConfigured",
            {
                "count": len(self._zones),
                "zones": [dict(z) for z in self._zones],
                "timestamp": _iso_now(),
            },
        )
        logger.info("已配置 %s 个安防区域", len(zones))

    # ------------------------------------------------------------------ #
    # 布防 / 撤防
    # ------------------------------------------------------------------ #
    async def set_mode(self, mode: str, source: str = "home-mode") -> dict[str, Any]:
        """家庭模式联动入口：等价 ``security.panel.setMode`` 事件。"""
        if mode == "disarmed":
            return await self.disarm({"source": source})
        return await self.arm(mode, None, {"source": source})

    async def arm(
        self,
        mode: str,
        zone_ids: list[str] | None = None,
        opts: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if mode == "disarmed":
            return await self.disarm(opts)
        async with self._transition_lock:
            return await self._arm_inner(mode, zone_ids, opts or {})

    async def _arm_inner(
        self, mode: str, zone_ids: list[str] | None, opts: dict[str, Any]
    ) -> dict[str, Any]:
        same_mode = self._mode == mode
        if same_mode and opts.get("skipActionsIfSameMode", True) and not opts.get("force"):
            return {
                "success": True,
                "mode": mode,
                "zoneCount": sum(1 for z in self._zones if z.get("armed")),
                "actions": {"executed": 0, "failed": 0, "failedItems": []},
                "skipped": True,
            }

        target_zones = (
            [z for z in self._zones if z.get("id") in zone_ids]
            if zone_ids
            else list(self._zones)
        )
        if zone_ids and not target_zones:
            bad_request(api_error("SECURITY_ZONE_NOT_FOUND"))

        if opts.get("skipActions"):
            action_result = {"executed": 0, "failed": 0, "failedItems": []}
        else:
            action_result = await self.linkage_helper.execute_security_mode_actions(mode)

        degraded = action_result["failed"] > 0
        if degraded:
            logger.warning(
                "安防布防失败(联动未完成): %s,失败 %s 条,保持模式=%s",
                mode,
                action_result["failed"],
                self._mode,
            )
            self.state_helper.schedule_security_event(
                "arm_failed", f"布防失败: {mode}", mode=self._mode
            )
            return {
                "success": False,
                "degraded": True,
                "mode": self._mode,
                "requestedMode": mode,
                "zoneCount": sum(1 for z in self._zones if z.get("armed")),
                "actions": action_result,
                "failedItems": action_result["failedItems"],
            }

        for zone in self._zones:
            zone["armed"] = False
        for zone in target_zones:
            zone["armed"] = True

        self._mode = mode
        self._armed_at = int(time.time() * 1000)
        armed_zone_ids = [str(z.get("id")) for z in self._zones if z.get("armed")]

        await self._bus.emit(
            "security.modeChanged",
            {
                "mode": mode,
                "zones": armed_zone_ids,
                "zonesDetail": [dict(z) for z in self._zones],
                "armedAt": self._armed_at,
                "timestamp": _iso_now(),
                "source": opts.get("source") or "manual",
                "degraded": False,
                "failedItems": [],
            },
        )
        logger.info("安防已布防: %s (%s 个区域)", mode, len(target_zones))
        self.state_helper.persist_panel_state()
        self.state_helper.schedule_security_event(
            "arm", f"布防: {mode}", mode=mode, zones=armed_zone_ids
        )
        return {
            "success": True,
            "degraded": False,
            "mode": mode,
            "zoneCount": len(target_zones),
            "actions": action_result,
            "failedItems": action_result["failedItems"],
        }

    async def disarm(self, opts: dict[str, Any] | None = None) -> dict[str, Any]:
        opts = opts or {}
        async with self._transition_lock:
            return await self._disarm_inner(opts)

    async def _disarm_inner(self, opts: dict[str, Any]) -> dict[str, Any]:
        if self._mode == "disarmed" and opts.get("skipActionsIfSameMode", True) and not opts.get(
            "force"
        ):
            return {
                "success": True,
                "mode": "disarmed",
                "actions": {"executed": 0, "failed": 0, "failedItems": []},
                "skipped": True,
            }

        if opts.get("skipActions"):
            action_result = {"executed": 0, "failed": 0, "failedItems": []}
        else:
            action_result = await self.linkage_helper.execute_security_mode_actions("disarmed")

        degraded = action_result["failed"] > 0
        for zone in self._zones:
            zone["armed"] = False
        self._mode = "disarmed"
        self._armed_at = None

        await self._bus.emit(
            "security.modeChanged",
            {
                "mode": "disarmed",
                "zones": [],
                "zonesDetail": [dict(z) for z in self._zones],
                "armedAt": None,
                "timestamp": _iso_now(),
                "source": opts.get("source") or "manual",
                "degraded": degraded,
                "failedItems": action_result["failedItems"],
            },
        )
        logger.info("安防已撤防%s", " [联动降级]" if degraded else "")
        self.state_helper.persist_panel_state()
        self.state_helper.schedule_security_event("disarm", "撤防")
        return {
            "success": not degraded,
            "degraded": degraded,
            "mode": "disarmed",
            "actions": action_result,
            "failedItems": action_result["failedItems"],
        }

    # ------------------------------------------------------------------ #
    # 传感器事件
    # ------------------------------------------------------------------ #
    async def handle_state_change(self, change: dict[str, Any]) -> None:
        await self.alarm_helper.handle_sensor_trigger(change)
        await self.alarm_helper.handle_safety_sensor(change)

    # ------------------------------------------------------------------ #
    # 紧急求助
    # ------------------------------------------------------------------ #
    async def trigger_emergency(self, action: str = "panic") -> dict[str, Any]:
        now = time.time() * 1000
        cooldown_ms = int(self._config.get().get("emergencyCooldownSec") or 0) * 1000
        if self._emergency_running or (cooldown_ms > 0 and now - self._last_emergency_at < cooldown_ms):
            return {
                "success": False,
                "action": action,
                "queued": False,
                "reason": "in_progress" if self._emergency_running else "cooldown",
            }
        self._last_emergency_at = now

        await self._bus.emit("security.emergency", {"action": action, "timestamp": _iso_now()})
        self.state_helper.schedule_security_event("emergency", f"紧急求助: {action}")
        logger.warning("🆘 紧急求助触发: %s", action)

        asyncio.get_running_loop().create_task(self._run_emergency())

        return {"success": True, "action": action, "queued": True}

    async def _run_emergency(self) -> None:
        if self._emergency_running:
            return
        self._emergency_running = True
        try:
            await self.emergency_runner.run_emergency_actions()
        except Exception as exc:  # noqa: BLE001
            logger.warning("紧急求助联动失败: %s", exc)
        finally:
            self._emergency_running = False

    # ------------------------------------------------------------------ #
    # 事件历史
    # ------------------------------------------------------------------ #
    async def get_events(self, event_type: str | None = None, limit: Any = None) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            from .config import load_frontend_config, load_notification_config

            fetch_limit = resolve_notification_fetch_limit(
                limit,
                load_frontend_config(session),
                load_notification_config(session),
            )
            statement = select(SecurityEvent).order_by(SecurityEvent.created_at.desc()).limit(
                fetch_limit
            )
            if event_type:
                statement = statement.where(SecurityEvent.type == event_type)
            rows = session.execute(statement).scalars().all()
        return [_event_to_dict(row) for row in rows]


def _event_to_dict(row: SecurityEvent) -> dict[str, Any]:
    import json

    try:
        zones = json.loads(row.zones) if row.zones else []
    except (TypeError, ValueError):
        zones = []
    created = row.created_at
    return {
        "id": row.id,
        "type": row.type,
        "mode": row.mode,
        "entityId": row.entity_id,
        "detail": row.detail,
        "zones": zones,
        "createdAt": (
            created.strftime("%Y-%m-%dT%H:%M:%S.") + f"{created.microsecond // 1000:03d}Z"
            if created is not None
            else None
        ),
    }


def _iso_now() -> str:
    from datetime import UTC, datetime

    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
