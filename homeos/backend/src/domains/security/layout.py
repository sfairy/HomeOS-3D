"""安防布局与危险联动工具（对齐 ``common/http-security/hazard.util.ts`` +
``common/platform/project-paths.util.ts`` 的布局读取子集）。"""

from __future__ import annotations

import logging
import math
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select

from ...platform.core.app_config import load_raw_config
from ...platform.core.entity_domain import get_entity_domain
from ...platform.core.json_field import object_field
from ...platform.core.models import ProjectConfig, SecurityEvent

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
    except Exception as exc:
        logger.warning("读取 activeProfileId 失败，回退 default（按空配置继续）: %s", exc)
        raw = {}
    profiles = object_field(raw, "profiles")
    return str(profiles.get("activeProfileId") or "").strip() or "default"


def load_project_layout_json(session, project_id: str) -> dict[str, Any]:
    try:
        row = session.execute(
            select(ProjectConfig).where(ProjectConfig.project_id == project_id)
        ).scalar_one_or_none()
        if row is None or not row.layout:
            return {}
        return _read_json_object(row.layout)
    except Exception as exc:
        logger.warning("读取项目布局失败（project=%s），回退空布局: %s", project_id, exc)
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
    #: 数值型危险实体的显式触发阈值（``entity_id → 阈值``）。
    #: 未列入的数值实体一律不参与危险判定：燃气表累计用量、水流量这类表计
    #: 任意 >0 的读数都不是泄漏，误判会直接关阀并触发紧急场景。
    numeric_thresholds: dict[str, float] = field(default_factory=dict)
    #: 已废弃：演习曾是一个随布局持久化的开关，打开后会永久跳过真实告警的
    #: 关阀 / 排风。现在演习由 ``HazardDrillService.run_drill`` 一次性触发，
    #: 此字段只用于识别旧布局并留痕，不再影响真实触发。
    hazard_drill_mode: bool = False


def parse_comma_ids(raw: Any) -> list[str]:
    import re

    return [part for part in re.split(r"[,;\s]+", str(raw or "")) if part.strip()]


def _parse_hazard_entity_id_list(hazard_area: dict[str, Any], key: str) -> list[str]:
    value = hazard_area.get(key)
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item or "").strip()]


def _parse_hazard_numeric_thresholds(hazard_area: dict[str, Any]) -> dict[str, float]:
    """解析数值型危险实体的显式阈值；非法值整条丢弃（宁可不触发，也不误关阀）。"""
    raw = hazard_area.get("hazardNumericThresholds")
    if not isinstance(raw, dict):
        return {}
    thresholds: dict[str, float] = {}
    for key, value in raw.items():
        entity_id = str(key or "").strip()
        if not entity_id:
            continue
        try:
            threshold = float(value)
        except (TypeError, ValueError):
            continue
        # NaN / ±inf 不能作为阈值；NaN 的比较永远为 False，会让实体静默失效。
        if not math.isfinite(threshold):
            continue
        thresholds[entity_id] = threshold
    return thresholds


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
        numeric_thresholds=_parse_hazard_numeric_thresholds(ha),
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


def resolve_numeric_hazard_threshold(
    entity_id: str, bindings: HazardLayoutBindings
) -> float | None:
    """数值型实体的显式阈值；没有配置就返回 ``None``（不参与危险判定）。"""
    return bindings.numeric_thresholds.get(str(entity_id or "").strip())


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
            except Exception as exc:
                if attempt >= retries:
                    # 危险告警的自动处置（关阀/排风）失败必须可见：静默返回 False 会让人以为「已处置」。
                    logger.warning(
                        "危险告警自动动作失败，放弃重试 domain=%s service=%s entity=%s: %s",
                        domain,
                        service,
                        entity_id,
                        exc,
                    )
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
    source: str | None = None,
    actor: str | None = None,
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
                    source=source,
                    actor=actor,
                )
            )
            session.commit()
    except Exception as exc:
        logger.debug("SecurityEvent 写入失败: %s", exc)


def _schedule_persist(
    session_factory,
    event_type: str,
    detail: str,
    *,
    mode: str | None,
    entity_id: str | None,
    zones: list[str] | None,
    default_mode: str,
    source: str | None,
    actor: str | None,
) -> None:
    """审计写入改走后台线程：同步 commit 会卡住状态变更/告警链路。"""
    import asyncio

    kwargs = {
        "mode": mode,
        "entity_id": entity_id,
        "zones": zones,
        "default_mode": default_mode,
        "source": source,
        "actor": actor,
    }
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        # 无事件循环（脚本/测试直调）：退化为同步写，保证不丢审计。
        persist_security_event(session_factory, event_type, detail, **kwargs)
        return
    from ...platform.core.background import spawn_awaitable

    spawn_awaitable(
        asyncio.to_thread(persist_security_event, session_factory, event_type, detail, **kwargs)
    )


def schedule_security_event(
    session_factory,
    event_type: str,
    detail: str,
    *,
    mode: str | None = None,
    entity_id: str | None = None,
    zones: list[str] | None = None,
    default_mode: str = "disarmed",
    source: str | None = None,
    actor: str | None = None,
) -> None:
    logger.warning(detail)
    _schedule_persist(
        session_factory,
        event_type,
        detail,
        mode=mode,
        entity_id=entity_id,
        zones=zones,
        default_mode=default_mode,
        source=source,
        actor=actor,
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
    source: str | None = None,
    actor: str | None = None,
) -> None:
    _schedule_persist(
        session_factory,
        event_type,
        detail,
        mode=mode,
        entity_id=entity_id,
        zones=zones,
        default_mode=default_mode,
        source=source,
        actor=actor,
    )
