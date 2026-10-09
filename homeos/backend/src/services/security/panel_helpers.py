"""安防面板内部辅助集合（对齐 ``security-panel.internals.ts``）。

包含危险探测识别、告警触发判定、面板状态持久化、HA 联动执行、
入侵告警联动与紧急求助设备联动的对应实现。
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Callable
from typing import Any

from .bus import LocalEventBus
from .config import DEFAULT_SECURITY_EMERGENCY
from .layout import (
    load_active_project_layout,
    parse_hazard_layout_bindings,
    resolve_bound_hazard_kind,
    run_hazard_auto_actions,
    schedule_security_event,
    schedule_security_event_silent,
    summarize_hazard_action_failures,
)
from .zones import normalize_zone_type, should_zone_alarm_in_mode
from ...core.entity_domain import get_entity_domain
from ...core.runtime_kv import load_runtime_kv, persist_runtime_kv

logger = logging.getLogger("homeos.security.panel")

PANEL_RUNTIME_KEY = "security-panel"


# ── 危险探测识别 ────────────────────────────────────────────────────────

_APPLIANCE_RE = re.compile(
    r"热水器|water_heater|壁挂炉|boiler|燃气灶|灶具|stove|cooktop|range_hood|油烟机|烤箱|oven|"
    r"锅炉|furnace|洗碗|dishwasher|洗衣|washer|dryer|烘干"
)
_DETECTOR_INTENT_RE = re.compile(
    r"detector|detect|alarm|sensor|leak|泄漏|报警|探测|检测|感应|感测"
)


def classify_hazard_sensor(
    entity_id: str, attributes: dict[str, Any] | None, state: str
) -> str | None:
    """识别危险探测器类型：smoke / gas / leak / None。"""
    if not entity_id.startswith("binary_sensor."):
        return None
    if state != "on":
        return None

    attrs = attributes if isinstance(attributes, dict) else {}
    lowered = entity_id.lower()
    name = str(attrs.get("friendly_name") or "").lower()
    device_class = str(attrs.get("device_class") or "").lower()
    blob = f"{lowered} {name}"

    if _APPLIANCE_RE.search(blob):
        return None
    has_intent = bool(_DETECTOR_INTENT_RE.search(blob))

    if device_class == "smoke" or re.search(r"smoke|烟雾|烟感", blob):
        return "smoke"
    if device_class in ("gas", "carbon_monoxide"):
        return "gas"
    if re.search(r"\bco\b|methane|甲烷|天然气|煤气|可燃气|一氧化碳", blob) or (
        re.search(r"gas|燃气", blob) and has_intent
    ):
        return "gas"
    if device_class == "moisture" or (
        re.search(r"leak|moisture|flood|漏水|水浸|浸水", blob)
        and (device_class == "moisture" or has_intent or re.search(r"漏水|水浸|浸水", blob))
    ):
        return "leak"
    return None


def is_security_alarm_trigger(
    entity_id: str, new_state: str, lock_unlock_in_grace: bool = False
) -> bool:
    return (
        (entity_id.startswith("binary_sensor.") and new_state == "on")
        or (entity_id.startswith("sensor.") and new_state in ("on", "open"))
        or (entity_id.startswith("lock.") and new_state == "unlocked" and not lock_unlock_in_grace)
        or (entity_id.startswith("alarm_control_panel.") and new_state == "triggered")
    )


# ── 紧急求助配置 ────────────────────────────────────────────────────────


def normalize_security_emergency(raw: dict[str, Any] | None) -> dict[str, Any]:
    data = raw if isinstance(raw, dict) else {}
    cfg = {**DEFAULT_SECURITY_EMERGENCY, **data}
    cfg["lightPool"] = [item for item in data.get("lightPool", []) if item] if isinstance(
        data.get("lightPool"), list
    ) else []
    cfg["actions"] = data.get("actions") if isinstance(data.get("actions"), list) else []
    try:
        brightness = int(float(data.get("lightBrightnessPct") or 100))
    except (TypeError, ValueError):
        brightness = 100
    cfg["lightBrightnessPct"] = min(100, max(1, brightness))
    return cfg


def resolve_emergency_light_pool(cfg: dict[str, Any], away_light_pool: list[str]) -> list[str]:
    if cfg.get("lightPool"):
        return list(cfg["lightPool"])
    if away_light_pool:
        return list(away_light_pool)
    return []


def should_run_custom_emergency_actions(cfg: dict[str, Any]) -> bool:
    return cfg.get("mode") != "notify_only" and bool(cfg.get("actions"))


def should_run_builtin_emergency(cfg: dict[str, Any]) -> bool:
    if cfg.get("mode") == "notify_only":
        return False
    if cfg.get("mode") in ("full_home", "key_areas"):
        return True
    if cfg.get("mode") == "custom":
        return bool(cfg.get("appendBuiltin"))
    return False


def resolve_builtin_profile(cfg: dict[str, Any]) -> str:
    if cfg.get("mode") == "key_areas":
        return "key_areas"
    if cfg.get("mode") == "full_home":
        return "full_home"
    if cfg.get("mode") == "custom" and cfg.get("appendBuiltin"):
        return "key_areas" if cfg.get("appendMode") == "key_areas" else "full_home"
    return "full_home"


# ── 面板状态持久化 ──────────────────────────────────────────────────────


class SecurityPanelStateHelper:
    def __init__(self, session_factory, accessors: dict[str, Callable[..., Any]]) -> None:
        self._session_factory = session_factory
        self._state = accessors

    async def load_persisted_state(self) -> None:
        try:
            with self._session_factory() as session:
                data = load_runtime_kv(session, PANEL_RUNTIME_KEY)
        except Exception:
            return
        if not isinstance(data, dict):
            return
        mode = data.get("mode")
        if mode:
            self._state["setMode"](mode)
        zones = data.get("zones")
        if isinstance(zones, list):
            self._state["setZones"](
                [
                    {
                        "id": z.get("id"),
                        "name": z.get("name"),
                        "sensors": list(z.get("sensors") or []),
                        "armed": bool(z.get("armed")),
                        "zoneType": normalize_zone_type(z.get("zoneType")),
                        "roomId": (str(z.get("roomId")).strip() if z.get("roomId") else None),
                    }
                    for z in zones
                    if isinstance(z, dict)
                ]
            )
        armed_at = data.get("armedAt")
        if isinstance(armed_at, (int, float)):
            self._state["setArmedAt"](int(armed_at))
        logger.info(
            "安防面板状态已恢复: 模式=%s, 区域=%s",
            self._state["getMode"](),
            len(self._state["getZones"]()),
        )

    def persist_panel_state(self) -> None:
        payload = {
            "mode": self._state["getMode"](),
            "zones": self._state["getZones"](),
            "armedAt": self._state["getArmedAt"](),
        }
        try:
            persist_runtime_kv(self._session_factory, PANEL_RUNTIME_KEY, payload)
        except Exception as exc:
            logger.warning("安防面板状态写入失败: %s", exc)

    def schedule_security_event(
        self,
        event_type: str,
        detail: str,
        *,
        mode: str | None = None,
        entity_id: str | None = None,
        zones: list[str] | None = None,
    ) -> None:
        schedule_security_event_silent(
            self._session_factory,
            event_type,
            detail,
            mode=mode,
            entity_id=entity_id,
            zones=zones,
            default_mode=self._state["getMode"](),
        )


# ── HA 联动执行 ─────────────────────────────────────────────────────────


class SecurityLinkageHelper:
    def __init__(self, session_factory, ha_connector, bus: LocalEventBus) -> None:
        self._session_factory = session_factory
        self._ha = ha_connector
        self._bus = bus

    async def load_security_mode_actions(self, mode: str) -> list[dict[str, Any]]:
        _, layout = await asyncio.to_thread(load_active_project_layout, self._session_factory)
        security_modes = layout.get("securityModes")
        if isinstance(security_modes, list):
            for item in security_modes:
                if isinstance(item, dict) and item.get("key") == mode:
                    actions = item.get("actions")
                    return actions if isinstance(actions, list) else []
        return []

    async def execute_ha_actions(
        self, actions: list[dict[str, Any]], label: str, failure_event_type: str
    ) -> dict[str, Any]:
        if not actions:
            return {"executed": 0, "failed": 0, "failedItems": []}

        status = await self._ha.get_status()
        if not status.get("connected"):
            logger.warning("%s 联动动作跳过:HA 未连接", label)
            return {
                "executed": 0,
                "failed": len(actions),
                "failedItems": [
                    {"entity_id": a.get("entity_id"), "message": "HA 未连接，联动动作未执行"}
                    for a in actions
                ],
            }

        executed = 0
        failed = 0
        failed_items: list[dict[str, Any]] = []
        for act in actions:
            entity_id = str(act.get("entity_id") or "").strip()
            service = str(act.get("service") or "").strip()
            if not entity_id or not service:
                continue
            domain = act.get("domain") or get_entity_domain(entity_id)
            try:
                await self._ha.call_service(
                    domain, service, entity_id, act.get("service_data") or {}
                )
                executed += 1
            except Exception as exc:
                failed += 1
                message = str(exc)
                failed_items.append({"entity_id": entity_id, "message": message})
                logger.warning("%s 联动失败 [%s]: %s", label, entity_id, message)
                schedule_security_event(
                    self._session_factory,
                    failure_event_type,
                    f"{label} 联动失败 [{entity_id}]: {message}",
                    entity_id=entity_id,
                )
        if executed or failed:
            logger.info("%s 联动: %s 成功, %s 失败", label, executed, failed)
        return {"executed": executed, "failed": failed, "failedItems": failed_items}

    async def execute_security_mode_actions(self, mode: str) -> dict[str, Any]:
        try:
            actions = await self.load_security_mode_actions(mode)
        except Exception as exc:
            message = str(exc)
            logger.error("加载安防联动动作失败，拒绝布防: %s", message)
            return {
                "executed": 0,
                "failed": 1,
                "failedItems": [{"entity_id": "", "message": f"联动配置读取失败: {message}"}],
            }
        return await self.execute_ha_actions(actions, f"安防模式 {mode}", "linkage_action_failed")

    async def call_service_batch(
        self,
        items: list[dict[str, Any]],
        label: str,
        failure_event_type: str,
        concurrency: int = 10,
    ) -> dict[str, int]:
        if not items:
            return {"ok": 0, "failed": 0}
        status = await self._ha.get_status()
        if not status.get("connected"):
            logger.warning("%s 跳过:HA 未连接", label)
            return {"ok": 0, "failed": len(items)}

        ok = 0
        failed = 0
        for start in range(0, len(items), concurrency):
            chunk = items[start : start + concurrency]
            results = await asyncio.gather(
                *[
                    self._ha.call_service(
                        item["domain"],
                        item["service"],
                        item["entity_id"],
                        item.get("data") or {},
                    )
                    for item in chunk
                ],
                return_exceptions=True,
            )
            for item, result in zip(chunk, results, strict=False):
                if isinstance(result, BaseException):
                    failed += 1
                    message = str(result)
                    schedule_security_event(
                        self._session_factory,
                        failure_event_type,
                        f"{label} 联动失败 [{item['entity_id']}]: {message}",
                        entity_id=item["entity_id"],
                    )
                else:
                    ok += 1
        return {"ok": ok, "failed": failed}


# ── 入侵告警与危险传感器联动 ────────────────────────────────────────────


class SecurityAlarmHelper:
    def __init__(
        self,
        *,
        session_factory,
        bus: LocalEventBus,
        ha_connector,
        state_helper: SecurityPanelStateHelper,
        config_reader: Callable[[], dict[str, Any]],
        get_current_mode: Callable[[], str],
        get_zones: Callable[[], list[dict[str, Any]]],
        get_armed_at: Callable[[], int | None],
        is_zone_alarm_in_cooldown: Callable[[str], bool],
        set_zone_alarm_cooldown: Callable[[str, float], None],
    ) -> None:
        self._session_factory = session_factory
        self._bus = bus
        self._ha = ha_connector
        self._state_helper = state_helper
        self._config_reader = config_reader
        self._get_current_mode = get_current_mode
        self._get_zones = get_zones
        self._get_armed_at = get_armed_at
        self._is_zone_alarm_in_cooldown = is_zone_alarm_in_cooldown
        self._set_zone_alarm_cooldown = set_zone_alarm_cooldown
        self._safety_last_alarm: dict[str, int] = {}

    def _prune_safety_last_alarm(self, now: int, cooldown_ms: int) -> None:
        if cooldown_ms <= 0:
            return
        for entity_id, last_at in list(self._safety_last_alarm.items()):
            if now - last_at >= cooldown_ms:
                self._safety_last_alarm.pop(entity_id, None)

    def _is_lock_unlock_in_arm_exit_grace(self, entity_id: str, new_state: str) -> bool:
        if not entity_id.startswith("lock.") or new_state != "unlocked":
            return False
        grace_sec = int(self._config_reader().get("armExitGraceSeconds") or 0)
        if grace_sec <= 0:
            return False
        armed_at = self._get_armed_at()
        if armed_at is None:
            return False
        import time

        return time.time() * 1000 - armed_at < grace_sec * 1000

    async def handle_sensor_trigger(self, event: dict[str, Any]) -> None:
        if self._get_current_mode() == "disarmed":
            return
        entity_id = str(event.get("entity_id") or "")
        new_state_obj = event.get("new_state") or {}
        old_state_obj = event.get("old_state") or {}
        new_state = new_state_obj.get("state")
        old_state = old_state_obj.get("state")
        if not new_state or new_state == old_state:
            return

        triggered = [
            zone
            for zone in self._get_zones()
            if zone.get("armed")
            and entity_id in (zone.get("sensors") or [])
            and should_zone_alarm_in_mode(self._get_current_mode(), zone.get("zoneType"))
        ]
        if not triggered:
            return
        if not is_security_alarm_trigger(
            entity_id,
            new_state,
            self._is_lock_unlock_in_arm_exit_grace(entity_id, new_state),
        ):
            return

        cooldown_sec = int(self._config_reader().get("sensorAlertCooldownSec") or 0)
        zones_to_alert = (
            triggered
            if cooldown_sec <= 0
            else [z for z in triggered if not self._is_zone_alarm_in_cooldown(str(z.get("id")))]
        )
        if not zones_to_alert:
            return
        if cooldown_sec > 0:
            for zone in zones_to_alert:
                self._set_zone_alarm_cooldown(str(zone.get("id")), cooldown_sec / 60)

        friendly_name = (new_state_obj.get("attributes") or {}).get("friendly_name") or entity_id
        zone_names = "、".join(str(z.get("name")) for z in zones_to_alert)
        logger.warning("🚨 安防告警: %s 触发 (%s)", friendly_name, zone_names)

        zone_ids = [str(z.get("id")) for z in zones_to_alert]
        await self._bus.emit(
            "security.alarm",
            {
                "entityId": entity_id,
                "friendlyName": friendly_name,
                "zones": zone_ids,
                "zoneNames": zone_names,
                "mode": self._get_current_mode(),
                "timestamp": _iso_now(),
            },
        )
        self._state_helper.schedule_security_event(
            "alarm",
            f"{friendly_name} 触发告警 ({zone_names})",
            entity_id=entity_id,
            zones=zone_ids,
        )

    async def handle_safety_sensor(self, event: dict[str, Any]) -> None:
        entity_id = str(event.get("entity_id") or "")
        new_state_obj = event.get("new_state") or {}
        new_state = new_state_obj.get("state")
        old_state = (event.get("old_state") or {}).get("state")
        if not new_state or new_state == old_state:
            return
        if new_state not in ("on", "wet") and not _positive_float(new_state):
            return

        _, layout = await asyncio.to_thread(load_active_project_layout, self._session_factory)
        bindings = parse_hazard_layout_bindings(layout)

        hazard = classify_hazard_sensor(
            entity_id, new_state_obj.get("attributes") or {}, new_state
        )
        if not hazard:
            hazard = resolve_bound_hazard_kind(entity_id, bindings)
        if not hazard:
            return

        import time

        now = int(time.time() * 1000)
        cooldown_ms = int(self._config_reader().get("sensorAlertCooldownSec") or 0) * 1000
        self._prune_safety_last_alarm(now, cooldown_ms)
        last = self._safety_last_alarm.get(entity_id, 0)
        if cooldown_ms > 0 and now - last < cooldown_ms:
            return
        self._safety_last_alarm[entity_id] = now

        is_smoke = hazard == "smoke"
        is_gas = hazard == "gas"
        friendly_name = (new_state_obj.get("attributes") or {}).get("friendly_name") or entity_id
        label = "烟雾" if is_smoke else ("燃气" if is_gas else "漏水")
        logger.warning("🔴 安全传感器触发: %s (%s)", friendly_name, label)

        drill_mode = bindings.hazard_drill_mode
        action_results: list[dict[str, Any]] = []
        if not drill_mode:
            action_results = await run_hazard_auto_actions(
                bindings,
                hazard,
                self._ha.call_service_via_rest,
            )
            failures = summarize_hazard_action_failures(action_results)
            if failures:
                logger.warning("危险传感器联动部分失败: %s", ",".join(failures))
        else:
            logger.warning("演习模式:已跳过关阀/排风自动动作")

        action_failures = summarize_hazard_action_failures(action_results)
        await self._bus.emit(
            "security.alarm",
            {
                "entityId": entity_id,
                "friendlyName": friendly_name,
                "type": "smoke" if is_smoke else ("gas_leak" if is_gas else "water_leak"),
                "autoActions": not drill_mode,
                "drillMode": drill_mode,
                "actionResults": action_results,
                "actionFailures": action_failures,
                "zones": [],
                "zoneNames": "烟雾告警" if is_smoke else ("燃气泄漏" if is_gas else "漏水告警"),
                "mode": "safety",
                "timestamp": _iso_now(),
            },
        )

        suffix = f"（联动失败：{'、'.join(action_failures)}）" if action_failures else ""
        self._state_helper.schedule_security_event(
            "hazard", f"{friendly_name} {label}告警{suffix}", entity_id=entity_id, mode="safety"
        )

        for scene_id in bindings.emergency_scene_ids:
            try:
                await self._ha.call_service(
                    get_entity_domain(scene_id) or "scene", "turn_on", scene_id, {}
                )
            except Exception as exc:
                logger.warning("紧急场景触发失败 [%s]: %s", scene_id, exc)


# ── 紧急求助设备联动 ────────────────────────────────────────────────────


class SecurityEmergencyRunnerHelper:
    def __init__(self, *, session_factory, bus: LocalEventBus, ha_connector, linkage, arm) -> None:
        self._session_factory = session_factory
        self._bus = bus
        self._ha = ha_connector
        self._linkage = linkage
        self._arm = arm

    async def load_emergency_layout(self) -> tuple[dict[str, Any], list[str]]:
        try:
            from sqlalchemy import select

            from ...core.models import ProjectConfig

            with self._session_factory() as session:
                row = session.execute(
                    select(ProjectConfig).where(ProjectConfig.project_id == "default")
                ).scalar_one_or_none()
            if row is None or not row.layout:
                return normalize_security_emergency(None), []
            layout = row.layout if isinstance(row.layout, dict) else json.loads(row.layout)
            if not isinstance(layout, dict):
                return normalize_security_emergency(None), []
            light_pool = layout.get("awaySimulationLightPool")
            return (
                normalize_security_emergency(layout.get("securityEmergency")),
                [item for item in light_pool if item] if isinstance(light_pool, list) else [],
            )
        except Exception:
            return normalize_security_emergency(None), []

    async def run_builtin_emergency(
        self, profile: str, cfg: dict[str, Any], away_light_pool: list[str]
    ) -> dict[str, int]:
        results = {"sirens": 0, "lights": 0, "failed": 0}
        brightness = cfg.get("lightBrightnessPct")

        try:
            sirens = await self._ha.fetch_entities_by_domain("siren")
            siren_result = await self._linkage.call_service_batch(
                [
                    {"domain": "siren", "service": "turn_on", "entity_id": s["entity_id"], "data": {}}
                    for s in sirens
                ],
                "紧急求助 sirens",
                "emergency_action_failed",
            )
            results["sirens"] = siren_result["ok"]
            results["failed"] += siren_result["failed"]
        except Exception:
            pass

        light_ids: list[str] = []
        if profile == "full_home":
            try:
                lights = await self._ha.fetch_entities_by_domain("light")
                light_ids = [light["entity_id"] for light in lights]
            except Exception:
                pass
        else:
            light_ids = resolve_emergency_light_pool(cfg, away_light_pool)
            if not light_ids:
                logger.warning(
                    "重点区域模式未配置灯池,已跳过灯光联动"
                    "(仍可配置 emergency.lightPool 或 awaySimulationLightPool)"
                )

        if light_ids:
            light_result = await self._linkage.call_service_batch(
                [
                    {
                        "domain": "light",
                        "service": "turn_on",
                        "entity_id": entity_id,
                        "data": {"brightness_pct": brightness},
                    }
                    for entity_id in light_ids
                ],
                "紧急求助 lights",
                "emergency_action_failed",
            )
            results["lights"] = light_result["ok"]
            results["failed"] += light_result["failed"]
        return results

    async def run_emergency_actions(self) -> dict[str, int]:
        cfg, away_light_pool = await self.load_emergency_layout()
        results = {"executed": 0, "sirens": 0, "lights": 0, "failed": 0}

        if should_run_custom_emergency_actions(cfg):
            custom = await self._linkage.execute_ha_actions(
                cfg.get("actions") or [], "紧急求助", "emergency_action_failed"
            )
            results["executed"] = custom["executed"]
            results["failed"] += custom["failed"]

        if should_run_builtin_emergency(cfg):
            builtin = await self.run_builtin_emergency(
                resolve_builtin_profile(cfg), cfg, away_light_pool
            )
            results["sirens"] = builtin["sirens"]
            results["lights"] = builtin["lights"]
            results["failed"] += builtin["failed"]
        elif not should_run_custom_emergency_actions(cfg):
            if cfg.get("mode") == "notify_only":
                logger.warning("紧急求助:静默通知模式,跳过设备联动")
            elif cfg.get("mode") == "custom" and not cfg.get("appendBuiltin"):
                logger.warning("紧急求助:完全自定义且无叠加内置,无设备联动")

        if cfg.get("autoArmAway"):
            try:
                await self._arm(
                    "armed_away",
                    None,
                    {
                        "source": "emergency",
                        "skipActions": True,
                        "force": True,
                    },
                )
                logger.warning("紧急求助:已自动离家布防(跳过布防联动,避免与求救声光冲突)")
            except Exception as exc:
                schedule_security_event(
                    self._session_factory,
                    "emergency_action_failed",
                    f"紧急求助自动布防失败: {exc}",
                )

        await self._bus.emit(
            "security.emergencyCompleted",
            {**results, "mode": cfg.get("mode"), "timestamp": _iso_now()},
        )
        logger.warning(
            "求救联动完成: 自定义 %s, 警报器 %s, 灯具 %s, 失败 %s",
            results["executed"],
            results["sirens"],
            results["lights"],
            results["failed"],
        )
        return results


def _positive_float(value: Any) -> bool:
    try:
        return float(value) > 0
    except (TypeError, ValueError):
        return False


def _iso_now() -> str:
    from datetime import UTC, datetime

    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
