"""房间推断（对齐 ``@homeos/shared`` ``inferRoomIdFromEntityId`` / ``resolveEntityArea``）。

仅保留 mmWave 房间解析所需子集：默认房间目录关键词 + ``sensor.`` 前缀兜底。
"""

from __future__ import annotations

from typing import Any

#: 默认房间目录的 ``inferKeywords``（顺序与 shared/room/catalog.ts 一致）。
DEFAULT_ROOM_INFER_KEYWORDS: list[tuple[str, list[str]]] = [
    ("living", ["living", "客厅", "living_room", "lounge", "起居室", "大厅"]),
    ("dining", ["dining", "餐厅", "dining_room", "饭厅"]),
    ("master_bedroom", ["master_bed", "master_bedroom", "主卧", "主卧室", "主人房"]),
    (
        "elder_bedroom",
        ["elder", "elderly", "老人", "老人房", "父母", "父母房", "长辈房", "lao_ren", "lao_ren_fang", "laoren"],
    ),
    ("kids_bedroom", ["kids", "child", "儿童", "儿童房", "nursery", "婴儿房", "小孩房"]),
    ("master_bath", ["master_bath", "master_bathroom", "主卫", "主卫生间", "主卧卫生间"]),
    ("guest_bath", ["guest_bath", "guest_bathroom", "客卫", "公卫", "次卫", "客用卫生间"]),
]


def infer_room_id_from_entity_id(entity_id: str) -> str | None:
    value = (entity_id or "").lower()
    for room_id, keywords in DEFAULT_ROOM_INFER_KEYWORDS:
        for keyword in keywords:
            if keyword.lower() in value:
                return room_id
    if value.startswith("sensor."):
        parts = value.replace("sensor.", "", 1).split("_")
        return "_".join(parts[:2])
    return None


def resolve_entity_area(attrs: dict[str, Any] | None) -> dict[str, str] | None:
    data = attrs if isinstance(attrs, dict) else {}
    area_id = str(data.get("area_id") or "").strip()
    area_name = str(data.get("area_name") or "").strip()
    if not area_id and not area_name:
        return None
    resolved_id = area_id or area_name
    resolved_name = area_name or area_id
    return {"id": resolved_id, "name": resolved_name, "display": resolved_name}
