"""房间目录与环境传感器映射（对齐 ``@homeos/shared`` room/catalog.ts + room/ha-area-env-map.ts）。

仅移植后端文案/统计所需子集：默认房间目录、``resolveRoomLabel``、
``resolveRoomLabelFromHaAreas``（含 HA area 反查与 slug 推断）。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class RoomCatalogEntry:
    """单个房间目录条目。"""

    id: str
    default_label: str
    fixed: bool
    emoji: str
    voice_keywords: list[str]
    infer_keywords: list[str]
    area_patterns: list[str]
    device_group_key: str


def _entry(
    room_id: str,
    label: str,
    emoji: str,
    voice: list[str],
    infer: list[str],
    patterns: list[str],
    group: str,
) -> RoomCatalogEntry:
    return RoomCatalogEntry(
        id=room_id,
        default_label=label,
        fixed=True,
        emoji=emoji,
        voice_keywords=voice,
        infer_keywords=infer,
        area_patterns=patterns,
        device_group_key=group,
    )


#: 全屋默认房间目录（顺序与 ``DEFAULT_ROOM_CATALOG`` 一致）。
DEFAULT_ROOM_CATALOG: list[RoomCatalogEntry] = [
    _entry(
        "living",
        "客厅",
        "🛋️",
        ["客厅", "living", "living_room", "lounge", "起居室", "大厅"],
        ["living", "客厅", "living_room", "lounge", "起居室", "大厅"],
        ["living room", "living", "客厅"],
        "living",
    ),
    _entry(
        "dining",
        "餐厅",
        "🍽️",
        ["餐厅", "dining", "dining_room", "饭厅"],
        ["dining", "餐厅", "dining_room", "饭厅"],
        ["dining room", "dining", "餐厅"],
        "dining",
    ),
    _entry(
        "master_bedroom",
        "主卧",
        "🛏️",
        ["主卧", "master_bed", "master_bedroom", "主卧室", "主人房"],
        ["master_bed", "master_bedroom", "主卧", "主卧室", "主人房"],
        ["master bedroom", "主卧", "主卧室", "bedroom"],
        "masterBed",
    ),
    _entry(
        "elder_bedroom",
        "老人房",
        "🛏️",
        ["老人", "老人房", "elder", "elderly", "父母", "父母房", "长辈房"],
        [
            "elder",
            "elderly",
            "老人",
            "老人房",
            "父母",
            "父母房",
            "长辈房",
            "lao_ren",
            "lao_ren_fang",
            "laoren",
        ],
        ["elder room", "老人房", "lao ren fang", "lao_ren_fang"],
        "elder",
    ),
    _entry(
        "kids_bedroom",
        "儿童房",
        "🛏️",
        ["儿童", "儿童房", "kids", "child", "nursery", "婴儿房", "小孩房"],
        ["kids", "child", "儿童", "儿童房", "nursery", "婴儿房", "小孩房"],
        ["kids room", "children", "儿童房"],
        "child",
    ),
    _entry(
        "master_bath",
        "主卫",
        "🛁",
        ["主卫", "master_bath", "master_bathroom", "主卫生间", "主卧卫生间"],
        ["master_bath", "master_bathroom", "主卫", "主卫生间", "主卧卫生间"],
        ["master bathroom", "主卫", "主卫生间"],
        "masterBath",
    ),
    _entry(
        "guest_bath",
        "客卫",
        "🛁",
        ["客卫", "公卫", "次卫", "guest_bath", "guest_bathroom", "客用卫生间"],
        ["guest_bath", "guest_bathroom", "客卫", "公卫", "次卫", "客用卫生间"],
        ["guest bathroom", "guest bath", "客卫"],
        "guestBath",
    ),
]

_ASCII_SLUG_RE = re.compile(r"^[a-z0-9_\-\s]+$", re.IGNORECASE)
_CJK_RE = re.compile(r"[\u4e00-\u9fff]")


@dataclass(frozen=True)
class HaAreaRef:
    """HA area_registry 引用（id + name）。"""

    id: str
    name: str


@dataclass
class EnvSensorMapEntry:
    """房间环境传感器映射条目（仅保留后端用到的字段）。"""

    label: str | None = None
    ha_area_id: str | None = None
    hidden: bool = False
    extra: dict[str, Any] = field(default_factory=dict)


EnvSensorMap = dict[str, dict[str, Any]]


def lookup_ha_area(area_id: str, areas: list[HaAreaRef] | list[dict[str, Any]]) -> HaAreaRef | None:
    target = str(area_id or "").strip()
    if not target:
        return None
    for area in areas:
        ref = area if isinstance(area, HaAreaRef) else HaAreaRef(
            id=str((area or {}).get("id") or ""), name=str((area or {}).get("name") or "")
        )
        if ref.id == target:
            return ref
    return None


def normalize_ha_areas(areas: Any) -> list[HaAreaRef]:
    """把 HA 区域列表规整为 :class:`HaAreaRef`（跳过无 id 项）。"""
    out: list[HaAreaRef] = []
    for area in areas or []:
        if isinstance(area, HaAreaRef):
            out.append(area)
        elif isinstance(area, dict):
            area_id = str(area.get("id") or "").strip()
            if area_id:
                out.append(HaAreaRef(id=area_id, name=str(area.get("name") or "")))
    return out


def _normalize_areas(areas: Any) -> list[HaAreaRef]:
    return normalize_ha_areas(areas)


def find_catalog_for_ha_area(
    area: HaAreaRef,
    catalog: list[RoomCatalogEntry] | None = None,
) -> RoomCatalogEntry | None:
    catalog = catalog if catalog is not None else DEFAULT_ROOM_CATALOG
    haystack = f"{area.id} {area.name}".lower()
    for room in catalog:
        if any(pattern.lower() in haystack for pattern in room.area_patterns):
            return room
    return None


def is_ascii_slug_label(label: str) -> bool:
    text = str(label or "").strip()
    if not text:
        return True
    if _CJK_RE.search(text):
        return False
    return bool(_ASCII_SLUG_RE.match(text))


def _infer_catalog_label_from_area_slug(
    slug: str,
    catalog: list[RoomCatalogEntry] | None = None,
) -> str | None:
    catalog = catalog if catalog is not None else DEFAULT_ROOM_CATALOG
    haystack = str(slug or "").strip().lower().replace("-", "_").replace("_", " ")
    if not haystack:
        return None
    for room in catalog:
        if any(keyword.lower() in haystack for keyword in room.infer_keywords):
            return room.default_label
        if any(pattern.lower() in haystack for pattern in room.area_patterns):
            return room.default_label
    return None


def resolve_room_label(
    room_id: str,
    sensor_map: EnvSensorMap | None = None,
    catalog: list[RoomCatalogEntry] | None = None,
) -> str:
    """解析房间展示名（自定义 label 优先，其次目录默认名，兜底原 id）。"""
    catalog = catalog if catalog is not None else DEFAULT_ROOM_CATALOG
    sensor_map = sensor_map or {}
    custom = (sensor_map.get(room_id) or {}).get("label")
    if isinstance(custom, str) and custom.strip():
        return custom.strip()
    for room in catalog:
        if room.id == room_id:
            return room.default_label
    return room_id


def resolve_room_label_from_ha_areas(
    room_id: str,
    sensor_map: EnvSensorMap | None = None,
    areas: Any = None,
    catalog: list[RoomCatalogEntry] | None = None,
) -> str:
    """结合 HA area_registry 解析房间展示名（多级兜底）。"""
    catalog = catalog if catalog is not None else DEFAULT_ROOM_CATALOG
    sensor_map = sensor_map or {}
    area_refs = _normalize_areas(areas)
    target = str(room_id or "").strip()
    if not target:
        return ""
    custom = (sensor_map.get(target) or {}).get("label")
    if isinstance(custom, str) and custom.strip():
        return custom.strip()
    ha = lookup_ha_area(target, area_refs)
    if ha is not None:
        ha_name = (ha.name or "").strip()
        if ha_name and not is_ascii_slug_label(ha_name):
            return ha_name
        from_catalog = find_catalog_for_ha_area(ha, catalog)
        if from_catalog is not None:
            return from_catalog.default_label
        from_slug = _infer_catalog_label_from_area_slug(ha.id, catalog)
        if from_slug:
            return from_slug
        if ha_name:
            return ha_name
    from_id = _infer_catalog_label_from_area_slug(target, catalog)
    if from_id:
        return from_id
    return resolve_room_label(target, sensor_map, catalog)


def build_room_entity_matchers(
    room_id: str,
    sensor_map: dict[str, dict[str, Any]] | None = None,
    catalog: list[RoomCatalogEntry] | None = None,
) -> list[str]:
    """构建房间实体匹配 token 列表（对齐 ``buildRoomEntityMatchers``）。

    token 来源：目录条目 id / deviceGroupKey / inferKeywords / voiceKeywords / areaPatterns，
    外加 ``sensorMap[roomId].label``；全部小写、去重、过滤空值。
    """
    sensor_map = sensor_map or {}
    catalog = catalog if catalog is not None else DEFAULT_ROOM_CATALOG
    tokens: list[str] = []

    def _add(value: Any) -> None:
        text = str(value or "").strip().lower()
        if text and text not in tokens:
            tokens.append(text)

    preset = next((room for room in catalog if room.id == room_id), None)
    if preset is not None:
        _add(preset.id)
        _add(preset.device_group_key)
        for kw in preset.infer_keywords:
            _add(kw)
        for kw in preset.voice_keywords:
            _add(kw)
        for pattern in preset.area_patterns:
            _add(pattern)
    label = (sensor_map.get(room_id) or {}).get("label")
    if isinstance(label, str):
        _add(label)
    return tokens


def entity_matches_env_room(
    entity_id: str,
    friendly_name: str | None,
    area_id: str | None,
    room_id: str,
    sensor_map: dict[str, dict[str, Any]] | None = None,
    catalog: list[RoomCatalogEntry] | None = None,
) -> bool:
    """实体是否归属给定房间（entity_id + friendlyName + areaId 小写串任一 token 命中）。"""
    hay = f"{entity_id or ''} {friendly_name or ''} {area_id or ''}".lower()
    return any(
        token in hay
        for token in build_room_entity_matchers(room_id, sensor_map, catalog)
    )


__all__ = [
    "DEFAULT_ROOM_CATALOG",
    "EnvSensorMap",
    "HaAreaRef",
    "RoomCatalogEntry",
    "build_room_entity_matchers",
    "entity_matches_env_room",
    "find_catalog_for_ha_area",
    "is_ascii_slug_label",
    "lookup_ha_area",
    "normalize_ha_areas",
    "resolve_room_label",
    "resolve_room_label_from_ha_areas",
]
