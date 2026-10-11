"""首装绑定缺口检测与子域归类（对齐 ``@homeos/shared/setup/bindings-gaps.util``）。

汇总各类绑定缺口项（天气 / 摄像头 / 门铃 / 危险传感器 / 燃气与漏水关阀 / 环境房间 /
紧急场景 / 能源账户等），并提供缺口 id → 子域归类与子域过滤。
"""

from __future__ import annotations

from typing import Any

from .account_binding import (
    collect_required_account_binding_categories,
    format_account_binding_label,
    resolve_account_binding_settings_route,
)
from .energy_config import has_energy_config
from .hazard_config import detect_hazard_binding_conflicts, has_any_hazard_sensor_binding, parse_hazard_entity_id_list


def resolve_binding_gap_section(gap_id: str) -> str:
    """按缺口 id 解析归属子域（不改检测语义，仅供展示过滤）。"""
    gid = str(gap_id or "").strip()
    if gid == "weather":
        return "weather"
    if gid == "cameras":
        return "cameras"
    if gid == "env" or gid.startswith("energy-"):
        return "external"
    if gid in ("doorbell", "hazard") or gid.startswith("hazard-"):
        return "security"
    return "external"


def filter_binding_gaps_by_section(
    gaps: list[dict[str, Any]], section: str
) -> list[dict[str, Any]]:
    """过滤某子域缺口；section=overview 返回全量。"""
    if section == "overview":
        return list(gaps)
    return [gap for gap in gaps if resolve_binding_gap_section(gap["id"]) == section]


def collect_binding_gaps(input_data: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """检测当前配置下的各类首装绑定缺口。"""
    data = input_data or {}
    gaps: list[dict[str, Any]] = []
    hc = data.get("haConfig") if isinstance(data.get("haConfig"), dict) else {}
    stats = data.get("statsSensors") if isinstance(data.get("statsSensors"), dict) else {}

    def pick(key: str) -> str:
        return str(hc.get(key) or "").strip()

    format_energy_label = data.get("formatEnergyLabel") or format_account_binding_label
    check_energy = data.get("hasEnergyConfig") or (
        lambda cat: has_energy_config(cat, stats)
    )

    if not pick("weatherEntityId"):
        gaps.append(
            {
                "id": "weather",
                "label": "天气实体",
                "route": "/settings?tab=bindings&section=weather",
                "severity": "warn",
            }
        )

    categories = data.get("requiredAccountCategories")
    if not isinstance(categories, list):
        categories = collect_required_account_binding_categories(data.get("dashboardFooterItems"))
    for cat in categories:
        if not check_energy(cat):
            gaps.append(
                {
                    "id": f"energy-{cat}",
                    "label": f"{format_energy_label(cat)}账户",
                    "route": resolve_account_binding_settings_route(cat),
                    "severity": "info",
                }
            )

    cameras = hc.get("securityCameras")
    if not (isinstance(cameras, list) and cameras) and not pick("securityCamera"):
        gaps.append(
            {
                "id": "cameras",
                "label": "安防摄像头",
                "route": "/settings?tab=bindings&section=cameras",
                "severity": "info",
            }
        )

    doorbells = hc.get("doorbells")
    has_doorbell = isinstance(doorbells, list) and any(
        str((d or {}).get("triggerEntityId") or "").strip()
        for d in doorbells
        if isinstance(d, dict)
    )
    if not has_doorbell:
        gaps.append(
            {
                "id": "doorbell",
                "label": "门铃触发实体",
                "route": "/settings?tab=bindings&section=security",
                "severity": "warn",
            }
        )

    if not has_any_hazard_sensor_binding(hc):
        gaps.append(
            {
                "id": "hazard",
                "label": "危险传感器（烟/气/水浸）",
                "route": "/settings?tab=bindings&section=security",
                "severity": "warn",
            }
        )

    has_smoke_or_gas = bool(
        parse_hazard_entity_id_list(hc, "hazardSmokeEntityIds")
        or parse_hazard_entity_id_list(hc, "hazardGasEntityIds")
    )
    has_leak = bool(parse_hazard_entity_id_list(hc, "hazardLeakEntityIds"))
    if has_smoke_or_gas and not pick("hazardGasValveEntityId"):
        gaps.append(
            {
                "id": "hazard-gas-valve",
                "label": "燃气紧急关阀实体",
                "route": "/settings?tab=bindings&section=security",
                "severity": "info",
            }
        )
    if has_leak and not pick("hazardWaterValveEntityId"):
        gaps.append(
            {
                "id": "hazard-water-valve",
                "label": "漏水紧急关阀实体",
                "route": "/settings?tab=bindings&section=security",
                "severity": "info",
            }
        )

    if detect_hazard_binding_conflicts(hc):
        gaps.append(
            {
                "id": "hazard-conflict",
                "label": "危险传感器绑定冲突",
                "route": "/settings?tab=bindings&section=security",
                "severity": "warn",
            }
        )

    env_map = data.get("envSensorMap") if isinstance(data.get("envSensorMap"), dict) else {}
    env_rooms = 0
    for entry in env_map.values():
        if not isinstance(entry, dict) or entry.get("_hidden"):
            continue
        if str(entry.get("temperature") or "").strip() or str(entry.get("humidity") or "").strip():
            env_rooms += 1
    if env_rooms < 1:
        gaps.append(
            {
                "id": "env",
                "label": "环境传感器房间",
                "route": "/settings?tab=env-health",
                "severity": "info",
            }
        )

    if not pick("hazardEmergencySceneId") and has_any_hazard_sensor_binding(hc):
        gaps.append(
            {
                "id": "hazard-scene",
                "label": "紧急场景 ID",
                "route": "/settings?tab=bindings&section=security",
                "severity": "info",
            }
        )

    return gaps


__all__ = [
    "collect_binding_gaps",
    "filter_binding_gaps_by_section",
    "resolve_binding_gap_section",
]
