"""地面分区与铺面深浅的校验 / 兼容保留（0.8.9 `studio_floor_regions.py`）。

两类规则，**分开处理**：

- **校验**（:func:`validate_floor_regions`）：形状不对直接 422。写进草稿的坏数据
  前端渲染会整层失败，宁可拒绝保存。
- **兼容保留**（:func:`retain_omitted_floor_finishes`）：老写入方（旧版前端、脚本、备份还原）
  不认识新字段时会**省略**它们。省略的含义是「我不知道这件事」，不是「用户清空了」。
  因此：字段缺失 → 保留上一版；显式空数组 / 空对象 → 真的清空。

这条区分是数据安全的核心：少了它，任何一次「用旧客户端打开并保存」都会静默抹掉
用户辛苦画的所有分区。
"""

from __future__ import annotations

import re
from typing import Any

from ...platform.core.http.errors import BusinessException, ErrorCode, api_error

#: 铺面枚举。与前端 `FLOOR_FINISHES` 逐项一致。
FLOOR_FINISHES = frozenset({"theme", "wood", "tile"})

#: 色档上下限。与前端 `FLOOR_TONE_LIMIT` 一致。
FLOOR_TONE_LIMIT = 5

#: 单层分区数 / 单环点数 / 单层洞口环数上限（与前端同口径，防外部注入撑爆载荷）。
MAX_REGIONS = 128
MAX_RING_POINTS = 512
MAX_HOLES = 32

#: 分区 id：与前端 `REGION_ID` 同正则。
_REGION_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$")
_MAX_COORD = 1e6


def _invalid(reason: str) -> BusinessException:
    return BusinessException(ErrorCode.VALIDATION_FAILED, api_error("STUDIO3D_FLOOR_REGION_INVALID", reason), 422)


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _valid_ring(ring: object) -> bool:
    """环必须是 ≥3 个有限点，且不得有连续重复点。"""
    if not isinstance(ring, list) or not (3 <= len(ring) <= MAX_RING_POINTS):
        return False
    previous: tuple[float, float] | None = None
    for point in ring:
        if not isinstance(point, dict):
            return False
        x, y = point.get("x"), point.get("y")
        if not _is_number(x) or not _is_number(y):
            return False
        if abs(x) > _MAX_COORD or abs(y) > _MAX_COORD:
            return False
        current = (float(x), float(y))
        if previous is not None and abs(previous[0] - current[0]) < 1e-6 and abs(previous[1] - current[1]) < 1e-6:
            return False
        previous = current
    return True


def _validate_region(region: object, index: int) -> None:
    if not isinstance(region, dict):
        raise _invalid(f"第 {index + 1} 块地面分区格式无效。")
    ident = region.get("id")
    if not isinstance(ident, str) or not _REGION_ID.fullmatch(ident):
        raise _invalid(f"第 {index + 1} 块地面分区的 id 无效。")
    finish = region.get("finish")
    if finish not in FLOOR_FINISHES:
        raise _invalid(f"第 {index + 1} 块地面分区的铺面类型无效。")
    if not _valid_ring(region.get("outline")):
        raise _invalid(f"第 {index + 1} 块地面分区的轮廓无效（至少需要 3 个不同位置的点）。")
    holes = region.get("holes", [])
    if holes is None:
        holes = []
    if not isinstance(holes, list) or len(holes) > MAX_HOLES:
        raise _invalid(f"第 {index + 1} 块地面分区的洞口数量无效。")
    for ring in holes:
        if not _valid_ring(ring):
            raise _invalid(f"第 {index + 1} 块地面分区有无效的洞口轮廓。")


def _validate_tones(tones: object, floor_label: str) -> None:
    if tones is None:
        return
    if not isinstance(tones, dict):
        raise _invalid(f"{floor_label}的铺面深浅格式无效。")
    for key in ("wood", "tile"):
        value = tones.get(key)
        if value is None:
            continue
        if not _is_number(value) or not (-FLOOR_TONE_LIMIT <= value <= FLOOR_TONE_LIMIT):
            raise _invalid(f"{floor_label}的铺面深浅超出 ±{FLOOR_TONE_LIMIT}。")


def iter_floor_scenes(scene: object) -> list[tuple[dict, dict]]:
    """产出 ``(floor_record, floor_scene)``；单层老文档没有 ``floors`` 时把根当唯一楼层。"""
    if not isinstance(scene, dict):
        return []
    floors = scene.get("floors")
    if not isinstance(floors, list):
        return []
    pairs: list[tuple[dict, dict]] = []
    for floor in floors:
        if not isinstance(floor, dict):
            continue
        nested = floor.get("scene")
        pairs.append((floor, nested if isinstance(nested, dict) else {}))
    return pairs


def validate_floor_regions(scene: object) -> None:
    """校验整份文档里的分区与色档。不合法直接 422（带稳定 ``apiErrorCode``）。"""
    for index, (floor, _nested) in enumerate(iter_floor_scenes(scene)):
        regions = floor.get("floorRegions")
        label = str(floor.get("name") or f"第 {index + 1} 层")
        if regions is not None:
            if not isinstance(regions, list):
                raise _invalid(f"{label}的地面分区格式无效。")
            if len(regions) > MAX_REGIONS:
                raise _invalid(f"{label}的地面分区超过 {MAX_REGIONS} 块。")
            seen: set[str] = set()
            for region_index, region in enumerate(regions):
                _validate_region(region, region_index)
                ident = region["id"]
                if ident in seen:
                    raise _invalid(f"{label}存在重复的地面分区 id。")
                seen.add(ident)
        _validate_tones(floor.get("floorFinishTones"), label)
        # 0.8.9 地暖盘管显示开关：跟着楼层走，必须是布尔（字符串会让前端 `=== true` 失效）。
        if "underfloorHeating" in floor and not isinstance(floor.get("underfloorHeating"), bool):
            raise _invalid(f"{label}的地暖盘管开关需要是布尔值。")


def _copy_with(floor: dict, key: str, value: Any) -> dict:
    merged = dict(floor)
    merged[key] = value
    return merged


def retain_omitted_floor_finishes(previous_scene: object, scene: dict) -> dict:
    """把「新写入省略了、但上一版有」的分区 / 色档补回去。

    语义：
    - 字段**缺失**（key 不在对象里）→ 用上一版同 id 楼层的值；
    - 字段**显式存在**（哪怕是 ``[]`` / ``{}``）→ 尊重新值，不补。
    - 楼层按 ``id`` 对齐；新楼层（上一版没有）不补。

    返回新的 ``scene``（不改入参），方便调用方对比「是否发生保留」。
    """
    if not isinstance(previous_scene, dict) or not isinstance(scene, dict):
        return scene
    previous_floors = {str(floor.get("id") or ""): floor for floor, _nested in iter_floor_scenes(previous_scene)}
    floors = scene.get("floors")
    if not isinstance(floors, list) or not previous_floors:
        return scene
    changed = False
    retained: list[Any] = []
    for floor in floors:
        if not isinstance(floor, dict):
            retained.append(floor)
            continue
        source = previous_floors.get(str(floor.get("id") or ""))
        if source is None:
            retained.append(floor)
            continue
        merged = floor
        if "floorRegions" not in merged and "floorRegions" in source:
            merged = _copy_with(merged, "floorRegions", source.get("floorRegions"))
            changed = True
        if "floorFinishTones" not in merged and "floorFinishTones" in source:
            merged = _copy_with(merged, "floorFinishTones", source.get("floorFinishTones"))
            changed = True
        retained.append(merged)
    if not changed:
        return scene
    result = dict(scene)
    result["floors"] = retained
    return result


__all__ = [
    "FLOOR_FINISHES",
    "FLOOR_TONE_LIMIT",
    "iter_floor_scenes",
    "retain_omitted_floor_finishes",
    "validate_floor_regions",
]
