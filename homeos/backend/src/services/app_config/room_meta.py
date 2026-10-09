"""房间元信息 / 语音房间解析（对齐 ``@homeos/shared`` room 相关工具）。

覆盖 ``buildPublicRoomMeta`` / ``buildDeviceGroupLabelMap`` / ``sortEnvSensorMapRoomIds``、
``resolveVoiceRooms``、``resolveVoiceRoomsFromHaAreas``、``buildPublicRoomMetaFromHaAreas``
与 ``filterEnvSensorMapToKnownAreas``（HA area_registry 合并分支）。
"""

from __future__ import annotations

import math
from typing import Any

from ..rooms import (
    DEFAULT_ROOM_CATALOG,
    RoomCatalogEntry,
    find_catalog_for_ha_area,
    normalize_ha_areas,
    resolve_room_label,
)

EnvSensorMap = dict[str, dict[str, Any]]


def is_room_hidden_in_map(sensor_map: EnvSensorMap, room_id: str) -> bool:
    entry = sensor_map.get(room_id) or {}
    return entry.get("_hidden") is True


def list_visible_env_sensor_map_room_ids(sensor_map: EnvSensorMap) -> list[str]:
    return [room_id for room_id in sensor_map if not is_room_hidden_in_map(sensor_map, room_id)]


def sort_env_sensor_map_room_ids(
    room_ids: list[str], catalog: list[RoomCatalogEntry] | None = None
) -> list[str]:
    catalog = catalog if catalog is not None else DEFAULT_ROOM_CATALOG
    order = {room.id: index for index, room in enumerate(catalog)}

    def key(room_id: str) -> tuple[int, str]:
        return (order.get(room_id, 999), room_id)

    return sorted(room_ids, key=key)


def resolve_device_group_label(
    device_group_key: str,
    sensor_map: EnvSensorMap | None = None,
    catalog: list[RoomCatalogEntry] | None = None,
) -> str:
    sensor_map = sensor_map or {}
    catalog = catalog if catalog is not None else DEFAULT_ROOM_CATALOG
    if not device_group_key or device_group_key == "other":
        return "其他"
    for room in catalog:
        if room.device_group_key == device_group_key:
            return resolve_room_label(room.id, sensor_map, catalog)
    return device_group_key


def build_device_group_label_map(
    sensor_map: EnvSensorMap | None = None,
    catalog: list[RoomCatalogEntry] | None = None,
) -> dict[str, str]:
    sensor_map = sensor_map or {}
    catalog = catalog if catalog is not None else DEFAULT_ROOM_CATALOG
    out: dict[str, str] = {"other": "其他"}
    for room in catalog:
        if is_room_hidden_in_map(sensor_map, room.id):
            continue
        out[room.device_group_key] = resolve_room_label(room.id, sensor_map, catalog)
    return out


def build_public_room_meta(
    sensor_map: EnvSensorMap | None = None,
    catalog: list[RoomCatalogEntry] | None = None,
) -> dict[str, dict[str, str]]:
    sensor_map = sensor_map or {}
    catalog = catalog if catalog is not None else DEFAULT_ROOM_CATALOG
    room_labels: dict[str, str] = {}
    device_group_labels = build_device_group_label_map(sensor_map, catalog)
    for room_id in sort_env_sensor_map_room_ids(
        list_visible_env_sensor_map_room_ids(sensor_map), catalog
    ):
        room_labels[room_id] = resolve_room_label(room_id, sensor_map, catalog)
    return {"roomLabels": room_labels, "deviceGroupLabels": device_group_labels}


def merge_env_entries(
    base: dict[str, Any] | None, patch: dict[str, Any] | None
) -> dict[str, Any]:
    """合并 envSensorMap 条目（patch 优先、base 兜底；label / 各 sensor 字段 trim 非空优先）。"""
    if not base:
        return dict(patch or {})
    if not patch:
        return dict(base)
    merged = dict(base)
    for key in (
        "label",
        "temperature",
        "humidity",
        "pm25",
        "co2",
        "tvoc",
        "motion",
        "light",
        "climate",
    ):
        value = patch.get(key)
        if isinstance(value, str):
            merged[key] = value.strip() or base.get(key)
        elif key in patch:
            merged[key] = value
    for key in ("haAreaId", "ha_area_id"):
        if patch.get(key):
            merged[key] = patch[key]
    if "_hidden" in patch:
        merged["_hidden"] = patch.get("_hidden")
    return merged


def filter_env_sensor_map_to_known_areas(
    sensor_map: EnvSensorMap | None = None,
    ha_areas: Any = None,
) -> EnvSensorMap:
    """仅保留主键命中 HA area_id 的 envSensorMap 条目（对齐 ``filterEnvSensorMapToKnownAreas``）。"""
    sensor_map = sensor_map or {}
    area_refs = normalize_ha_areas(ha_areas)
    if not area_refs or not isinstance(sensor_map, dict):
        return sensor_map
    area_ids = {area.id for area in area_refs}
    result: EnvSensorMap = {}
    for key, entry in sensor_map.items():
        if not isinstance(entry, dict) or key not in area_ids:
            continue
        result[key] = merge_env_entries(result.get(key), {**entry, "haAreaId": key})
    return result


def align_env_sensor_map_to_ha_areas(
    sensor_map: EnvSensorMap | None = None,
    ha_areas: Any = None,
) -> EnvSensorMap:
    """顾问用量与设置页同一口径：只保留 HA 房间，丢掉默认目录残留 slug。

    HA area 清单就绪时走 ``filter_env_sensor_map_to_known_areas``。
    清单尚未就绪、但配置已同时含 area 主键与 ``living`` / ``dining`` 等目录键时，
    丢掉目录幽灵键，避免 12 个真实房间被加成 19。
    """
    if not isinstance(sensor_map, dict):
        return {}
    area_refs = normalize_ha_areas(ha_areas)
    if area_refs:
        return filter_env_sensor_map_to_known_areas(sensor_map, ha_areas)
    catalog_ids = {room.id for room in DEFAULT_ROOM_CATALOG}
    keys = [str(key) for key in sensor_map]
    if any(key in catalog_ids for key in keys) and any(key not in catalog_ids for key in keys):
        return {
            key: entry
            for key, entry in sensor_map.items()
            if str(key) not in catalog_ids and isinstance(entry, dict)
        }
    return sensor_map


def build_public_room_meta_from_ha_areas(
    ha_areas: Any = None,
    sensor_map: EnvSensorMap | None = None,
    catalog: list[RoomCatalogEntry] | None = None,
) -> dict[str, dict[str, str]]:
    """以 HA area_registry 为源构建 ``{roomLabels, deviceGroupLabels}``（缺失部分由目录补齐）。"""
    sensor_map = sensor_map or {}
    catalog = catalog if catalog is not None else DEFAULT_ROOM_CATALOG
    area_refs = normalize_ha_areas(ha_areas)
    if not area_refs:
        return build_public_room_meta(sensor_map, catalog)

    room_labels: dict[str, str] = {}
    device_group_labels: dict[str, str] = {"other": "其他"}
    for area in area_refs:
        if is_room_hidden_in_map(sensor_map, area.id):
            continue
        label = (sensor_map.get(area.id) or {}).get("label")
        label = label.strip() if isinstance(label, str) and label.strip() else area.name
        room_labels[area.id] = label
        catalog_entry = find_catalog_for_ha_area(area, catalog)
        if catalog_entry is not None:
            device_group_labels[catalog_entry.device_group_key] = label

    for room in catalog:
        if device_group_labels.get(room.device_group_key):
            continue
        if is_room_hidden_in_map(sensor_map, room.id):
            continue
        device_group_labels[room.device_group_key] = resolve_room_label(
            room.id, sensor_map, catalog
        )
    return {"roomLabels": room_labels, "deviceGroupLabels": device_group_labels}


def resolve_voice_rooms_from_ha_areas(
    ha_areas: Any = None,
    sensor_map: EnvSensorMap | None = None,
    catalog: list[RoomCatalogEntry] | None = None,
    fallback_rooms: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """从 HA area_registry 构建语音房间别名（空区域时返回 fallback 副本）。"""
    sensor_map = sensor_map or {}
    catalog = catalog if catalog is not None else DEFAULT_ROOM_CATALOG
    fallback = fallback_rooms if fallback_rooms is not None else default_voice_rooms()
    area_refs = normalize_ha_areas(ha_areas)
    if not area_refs:
        return [{"label": room["label"], "keywords": list(room["keywords"])} for room in fallback]

    rooms: list[dict[str, Any]] = []
    for area in area_refs:
        if is_room_hidden_in_map(sensor_map, area.id):
            continue
        label = (sensor_map.get(area.id) or {}).get("label")
        label = label.strip() if isinstance(label, str) and label.strip() else area.name
        catalog_entry = find_catalog_for_ha_area(area, catalog)
        if catalog_entry is not None:
            keywords = list(
                dict.fromkeys([*catalog_entry.voice_keywords, label, area.name, area.id])
            )
        else:
            keywords = list(
                dict.fromkeys([label, area.name, area.id, area.id.replace("_", " ")])
            )
        rooms.append({"label": label, "keywords": keywords})
    return sorted(rooms, key=lambda room: room["label"])


def default_voice_rooms() -> list[dict[str, Any]]:
    return [
        {"label": room.default_label, "keywords": list(room.voice_keywords)}
        for room in DEFAULT_ROOM_CATALOG
    ]


def resolve_voice_rooms(
    env_sensor_map: EnvSensorMap | None = None,
    ha_areas: list[Any] | None = None,
    catalog: list[RoomCatalogEntry] | None = None,
) -> list[dict[str, Any]]:
    """从 envSensorMap + HA 区域解析语音房间；均缺失时回退默认房间目录。

    优先级（对齐 ``resolveVoiceRooms``）：
    1. 提供 haAreas：委托 :func:`resolve_voice_rooms_from_ha_areas` 合并区域与传感器映射；
    2. 仅 envSensorMap：逐条解析并合并房间目录关键词；
    3. 全部缺失或解析为空：回退默认 ``default_voice_rooms()``。
    """
    catalog = catalog if catalog is not None else DEFAULT_ROOM_CATALOG
    fallback = default_voice_rooms()
    if ha_areas:
        return resolve_voice_rooms_from_ha_areas(ha_areas, env_sensor_map, catalog, fallback)
    if not isinstance(env_sensor_map, dict):
        return fallback
    by_slug: dict[str, dict[str, Any]] = {}
    for slug, meta in env_sensor_map.items():
        if not isinstance(meta, dict) or meta.get("_hidden"):
            continue
        label = str(meta.get("label") or "").strip()
        if not label:
            continue
        catalog_entry = next((r for r in catalog if r.id == slug), None)
        if catalog_entry is not None:
            keywords = list(dict.fromkeys([*catalog_entry.voice_keywords, label, slug]))
        else:
            keywords = [label, slug, slug.replace("_", " ")]
        by_slug[slug] = {"label": label, "keywords": keywords}
    if not by_slug:
        return default_voice_rooms()
    return [by_slug[slug] for slug in sort_env_sensor_map_room_ids(list(by_slug.keys()), catalog) if slug in by_slug]


def build_client_power_wake_public(client_power: Any) -> dict[str, list[dict[str, Any]]]:
    clients: list[dict[str, Any]] = []
    for row in (client_power or {}).get("clients") or []:
        if not isinstance(row, dict):
            continue
        cid = str(row.get("id") or "").strip()
        charger = str(row.get("chargerSwitchEntityId") or "").strip()
        if not cid or not charger:
            continue
        if row.get("presenceWakeEnabled") is False:
            continue
        clients.append({"id": cid, "chargerSwitchEntityId": charger, "presenceWakeEnabled": True})
    return {"clients": clients}


def build_energy_public_meta(learning_period_days: Any) -> dict[str, int]:
    try:
        n = float(learning_period_days)
    except (TypeError, ValueError):
        n = 0
    days = min(int(n), 30) if n > 0 and not math.isnan(n) else 7
    return {"learningPeriodDays": days, "chartHours": min(days * 24, 168)}


def resolve_orchestrator_history_limit(ops: dict[str, Any]) -> int:
    def positive(value: Any, default: int) -> float:
        try:
            n = float(value)
        except (TypeError, ValueError):
            return default
        return n if n > 0 and not math.isnan(n) else default

    scene_max = positive(ops.get("sceneExecHistoryMax"), 100)
    script_max = positive(ops.get("scriptExecHistoryMax"), 80)
    return int(min(max(scene_max, script_max), 200))


__all__ = [
    "align_env_sensor_map_to_ha_areas",
    "build_client_power_wake_public",
    "build_device_group_label_map",
    "build_energy_public_meta",
    "build_public_room_meta",
    "build_public_room_meta_from_ha_areas",
    "default_voice_rooms",
    "filter_env_sensor_map_to_known_areas",
    "is_room_hidden_in_map",
    "list_visible_env_sensor_map_room_ids",
    "merge_env_entries",
    "resolve_device_group_label",
    "resolve_orchestrator_history_limit",
    "resolve_voice_rooms",
    "resolve_voice_rooms_from_ha_areas",
    "sort_env_sensor_map_room_ids",
]
