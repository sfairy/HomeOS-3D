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


def has_camera_binding(cameras: Any) -> bool:
    """判断安防摄像头绑定是否至少有一路有效。

    ``securityCameras`` 的项为 ``{entityId, go2rtcUrl?}``：只填 go2rtc 局域网地址也算已绑定。
    """
    if not isinstance(cameras, list):
        return False
    for cam in cameras:
        if isinstance(cam, dict):
            if str(cam.get("entityId") or "").strip() or str(cam.get("go2rtcUrl") or "").strip():
                return True
    return False


def filter_binding_gaps_by_section(
    gaps: list[dict[str, Any]], section: str
) -> list[dict[str, Any]]:
    """过滤某子域缺口；section=overview 返回全量。"""
    if section == "overview":
        return list(gaps)
    return [gap for gap in gaps if resolve_binding_gap_section(gap["id"]) == section]


def _append_weather_and_energy_gaps(
    gaps: list[dict[str, Any]],
    *,
    pick,
    input_config: dict[str, Any],
    stats: dict[str, Any],
) -> None:
    """天气实体与能源账户缺口。"""
    if not pick("weatherEntityId"):
        gaps.append(
            {
                "id": "weather",
                "label": "天气实体",
                "route": "/settings?tab=bindings&section=weather",
                "severity": "warn",
            }
        )

    format_energy_label = input_config.get("formatEnergyLabel") or format_account_binding_label
    check_energy = input_config.get("hasEnergyConfig") or (
        lambda category: has_energy_config(category, stats)
    )
    categories = input_config.get("requiredAccountCategories")
    if not isinstance(categories, list):
        categories = collect_required_account_binding_categories(
            input_config.get("dashboardFooterItems")
        )
    for category in categories:
        if not check_energy(category):
            gaps.append(
                {
                    "id": f"energy-{category}",
                    "label": f"{format_energy_label(category)}账户",
                    "route": resolve_account_binding_settings_route(category),
                    "severity": "info",
                }
            )


def _append_camera_doorbell_gaps(
    gaps: list[dict[str, Any]], *, ha_config: dict[str, Any], pick
) -> None:
    """摄像头与门铃缺口。"""
    cameras = ha_config.get("securityCameras")
    if not has_camera_binding(cameras) and not pick("securityCamera"):
        gaps.append(
            {
                "id": "cameras",
                "label": "安防摄像头",
                "route": "/settings?tab=bindings&section=cameras",
                "severity": "info",
            }
        )

    doorbells = ha_config.get("doorbells")
    has_doorbell = isinstance(doorbells, list) and any(
        str((doorbell or {}).get("triggerEntityId") or "").strip()
        for doorbell in doorbells
        if isinstance(doorbell, dict)
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


def _append_hazard_gaps(
    gaps: list[dict[str, Any]], *, ha_config: dict[str, Any], pick
) -> None:
    """危险传感器、关阀、冲突与紧急场景缺口。"""
    if not has_any_hazard_sensor_binding(ha_config):
        gaps.append(
            {
                "id": "hazard",
                "label": "危险传感器（烟/气/水浸）",
                "route": "/settings?tab=bindings&section=security",
                "severity": "warn",
            }
        )

    has_smoke_or_gas = bool(
        parse_hazard_entity_id_list(ha_config, "hazardSmokeEntityIds")
        or parse_hazard_entity_id_list(ha_config, "hazardGasEntityIds")
    )
    has_leak = bool(parse_hazard_entity_id_list(ha_config, "hazardLeakEntityIds"))
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

    if detect_hazard_binding_conflicts(ha_config):
        gaps.append(
            {
                "id": "hazard-conflict",
                "label": "危险传感器绑定冲突",
                "route": "/settings?tab=bindings&section=security",
                "severity": "warn",
            }
        )


def _append_env_sensor_gaps(
    gaps: list[dict[str, Any]], *, input_config: dict[str, Any]
) -> None:
    """环境传感器房间缺口。"""
    env_sensor_map_raw = input_config.get("envSensorMap")
    env_map: dict[str, Any] = env_sensor_map_raw if isinstance(env_sensor_map_raw, dict) else {}
    env_rooms = 0
    for room_entry in env_map.values():
        if not isinstance(room_entry, dict) or room_entry.get("_hidden"):
            continue
        if str(room_entry.get("temperature") or "").strip() or str(
            room_entry.get("humidity") or ""
        ).strip():
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


def _append_hazard_scene_gap(
    gaps: list[dict[str, Any]], *, ha_config: dict[str, Any], pick
) -> None:
    """紧急场景缺口（保持在环境房间之后追加，与原先顺序一致）。"""
    if not pick("hazardEmergencySceneId") and has_any_hazard_sensor_binding(ha_config):
        gaps.append(
            {
                "id": "hazard-scene",
                "label": "紧急场景 ID",
                "route": "/settings?tab=bindings&section=security",
                "severity": "info",
            }
        )


def collect_binding_gaps(input_data: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """检测当前配置下的各类首装绑定缺口。"""
    input_config = input_data or {}
    gaps: list[dict[str, Any]] = []
    # 一律「先绑定再收窄」：写成 `x.get(K) if isinstance(x.get(K), dict) else {}` 时，静态分析
    # 给出的是 `Any | dict | None`，于是下面每个把 ha_config / stats 传下去的调用都被判成
    # 类型不匹配（6 条噪声），而 `x.get(K)` 还要读两遍。
    ha_config_raw = input_config.get("haConfig")
    ha_config: dict[str, Any] = ha_config_raw if isinstance(ha_config_raw, dict) else {}
    stats_raw = input_config.get("statsSensors")
    stats: dict[str, Any] = stats_raw if isinstance(stats_raw, dict) else {}

    def pick(key: str) -> str:
        return str(ha_config.get(key) or "").strip()

    _append_weather_and_energy_gaps(gaps, pick=pick, input_config=input_config, stats=stats)
    _append_camera_doorbell_gaps(gaps, ha_config=ha_config, pick=pick)
    _append_hazard_gaps(gaps, ha_config=ha_config, pick=pick)
    _append_env_sensor_gaps(gaps, input_config=input_config)
    _append_hazard_scene_gap(gaps, ha_config=ha_config, pick=pick)

    return gaps


__all__ = [
    "collect_binding_gaps",
    "filter_binding_gaps_by_section",
    "resolve_binding_gap_section",
]
