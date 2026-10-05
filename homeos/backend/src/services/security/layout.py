"""安防布局与危险联动工具（对齐 ``common/http-security/hazard.util.ts`` +
``common/platform/project-paths.util.ts`` 的布局读取子集）。"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select

from ...core.app_config import load_raw_config
from ...core.entity_domain import get_entity_domain
from ...core.models import ProjectConfig, SecurityEvent

logger = logging.getLogger("homeos.security")


# ── 项目布局 ────────────────────────────────────────────────────────────


def _read_json_object(raw: Any) -> dict[str, Any]:
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    import json

    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def resolve_active_project_id(session) -> str:
    """对齐 ``resolveActiveProjectId``：profiles.activeProfileId 缺省为 default。"""
    try:
        raw = load_raw_config(session)
    except Exception:  # noqa: BLE001
        raw = {}
    profiles = raw.get("profiles") if isinstance(raw.get("profiles"), dict) else {}
    return str(profiles.get("activeProfileId") or "").strip() or "default"


def load_project_layout_json(session, project_id: str) -> dict[str, Any]:
    try:
        row = session.execute(
            select(ProjectConfig).where(ProjectConfig.project_id == project_id)
        ).scalar_one_or_none()
        if row is None or not row.layout:
            return {}
        return _read_json_object(row.layout)
    except Exception:  # noqa: BLE001
        return {}


def load_active_project_layout(session_factory) -> tuple[str, dict[str, Any]]:
    """返回 ``(projectId, layout)``；读取失败返回 ``('default', {})``。"""
    with session_factory() as session:
        project_id = resolve_active_project_id(session)
        layout = load_project_layout_json(session, project_id)
    return project_id, layout


# ── 危险传感器布局绑定 ──────────────────────────────────────────────────


@dataclass
class HazardLayoutBindings:
    smoke_entity_ids: list[str] = field(default_factory=list)
    gas_entity_ids: list[str] = field(default_factory=list)
    leak_entity_ids: list[str] = field(default_factory=list)
    emergency_scene_ids: list[str] = field(default_factory=list)
    gas_valve_entity_id: str = ""
    water_valve_entity_id: str = ""
    exhaust_fan_entity_ids: list[str] = field(default_factory=list)
    hazard_drill_mode: bool = False


def parse_comma_ids(raw: Any) -> list[str]:
    import re

    return [part for part in re.split(r"[,;\s]+", str(raw or "")) if part.strip()]


def _parse_hazard_entity_id_list(ha: dict[str, Any], key: str) -> list[str]:
    value = ha.get(key)
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item or "").strip()]


def parse_hazard_layout_bindings(layout: dict[str, Any] | None) -> HazardLayoutBindings:
    ha_raw = layout.get("haConfig") if isinstance(layout, dict) else None
    ha = ha_raw if isinstance(ha_raw, dict) else {}

    def pick(key: str) -> str:
        return str(ha.get(key) or "").strip()

    return HazardLayoutBindings(
        smoke_entity_ids=_parse_hazard_entity_id_list(ha, "hazardSmokeEntityIds"),
        gas_entity_ids=_parse_hazard_entity_id_list(ha, "hazardGasEntityIds"),
        leak_entity_ids=_parse_hazard_entity_id_list(ha, "hazardLeakEntityIds"),
        emergency_scene_ids=parse_comma_ids(pick("hazardEmergencySceneId")),
        gas_valve_entity_id=pick("hazardGasValveEntityId"),
        water_valve_entity_id=pick("hazardWaterValveEntityId"),
        exhaust_fan_entity_ids=parse_comma_ids(pick("hazardExhaustFanEntityIds")),
        hazard_drill_mode=bool(ha.get("hazardDrillMode")),
    )


def resolve_bound_hazard_kind(
    entity_id: str, bindings: HazardLayoutBindings
) -> str | None:
    value = str(entity_id or "").strip()
    if not value:
        return None
    if value in bindings.smoke_entity_ids:
        return "smoke"
    if value in bindings.gas_entity_ids:
        return "gas"
    if value in bindings.leak_entity_ids:
        return "leak"
    return None


# ── 危险自动动作（关阀 / 排风） ─────────────────────────────────────────


def summarize_hazard_action_failures(results: list[dict[str, Any]]) -> list[str]:
    out: list[str] = []
    for item in results:
        if item.get("ok"):
            continue
        label = "关阀" if item.get("action") == "close_valve" else "排风"
        out.append(f"{item.get('target')}({label})")
    return out


async def run_hazard_auto_actions(
    bindings: HazardLayoutBindings,
    hazard: str,
    call_service: Callable[[str, str, str], Awaitable[Any]],
) -> list[dict[str, Any]]:
    """执行危险告警自动动作，返回每个动作的执行结果。"""
    import asyncio

    results: list[dict[str, Any]] = []

    async def call_with_retry(domain: str, service: str, entity_id: str, retries: int = 1) -> bool:
        for attempt in range(retries + 1):
            try:
                await call_service(domain, service, entity_id)
                return True
            except Exception:  # noqa: BLE001
                if attempt >= retries:
                    return False
                await asyncio.sleep(0.4)
        return False

    async def close_valve(target: str) -> None:
        ok = await call_with_retry(get_entity_domain(target) or "valve", "turn_off", target, 1)
        results.append({"target": target, "action": "close_valve", "ok": ok})

    async def open_exhaust(target: str) -> None:
        ok = await call_with_retry(get_entity_domain(target) or "fan", "turn_on", target, 0)
        results.append({"target": target, "action": "open_exhaust", "ok": ok})

    is_smoke = hazard == "smoke"
    is_gas = hazard == "gas"
    is_leak = hazard == "leak"

    if is_smoke or is_gas:
        await close_valve(bindings.gas_valve_entity_id or "valve.gas_main")
    if is_leak:
        await close_valve(bindings.water_valve_entity_id or "valve.water_main")
    if is_smoke or is_gas:
        fan_targets = bindings.exhaust_fan_entity_ids or [
            "fan.exhaust",
            "fan.ventilation",
            "switch.exhaust_fan",
        ]
        for target in fan_targets:
            await open_exhaust(target)
    return results


# ── SecurityEvent 异步审计写入 ──────────────────────────────────────────


def persist_security_event(
    session_factory,
    event_type: str,
    detail: str,
    *,
    mode: str | None = None,
    entity_id: str | None = None,
    zones: list[str] | None = None,
    default_mode: str = "disarmed",
) -> None:
    """写入 SecurityEvent；失败仅记录日志，不影响主流程。"""
    import json

    try:
        with session_factory() as session:
            session.add(
                SecurityEvent(
                    type=event_type,
                    mode=mode or default_mode,
                    entity_id=entity_id,
                    detail=detail,
                    zones=json.dumps(zones or [], ensure_ascii=False),
                )
            )
            session.commit()
    except Exception as exc:  # noqa: BLE001
        logger.debug("SecurityEvent 写入失败: %s", exc)


def schedule_security_event(
    session_factory,
    event_type: str,
    detail: str,
    *,
    mode: str | None = None,
    entity_id: str | None = None,
    zones: list[str] | None = None,
    default_mode: str = "disarmed",
) -> None:
    logger.warning(detail)
    persist_security_event(
        session_factory,
        event_type,
        detail,
        mode=mode,
        entity_id=entity_id,
        zones=zones,
        default_mode=default_mode,
    )


def schedule_security_event_silent(
    session_factory,
    event_type: str,
    detail: str,
    *,
    mode: str | None = None,
    entity_id: str | None = None,
    zones: list[str] | None = None,
    default_mode: str = "disarmed",
) -> None:
    persist_security_event(
        session_factory,
        event_type,
        detail,
        mode=mode,
        entity_id=entity_id,
        zones=zones,
        default_mode=default_mode,
    )
