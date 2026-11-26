"""分主题基础光照的持久化契约（户型绘制与 3D 控件共用）。

0.8.7 起「基础光照」不再只有一份：默认风格、暖阳原木、自然木语各自独立保存。
数据落在户型草稿的 ``scene.baseLightingByTheme``（以及 3D 控件 properties 的同名字段），
本模块是它**唯一**的边界表与校验实现 —— 交互侧配置校验与草稿保存都从这里取，
避免两处各写一份区间、改一处忘另一处。

键表即白名单：出现表外的键、类型不是数值、或超出区间，一律判为无效。
"""

from __future__ import annotations

from typing import Any

#: 支持的风格主题。与前端 `SCENE_STYLES` 的 id 逐一对应（`default` / `warm-wood` / `natural-wood`）。
LIGHTING_THEMES = frozenset({"default", "warm-wood", "natural-wood"})

#: ``baseLighting`` 的字段与区间（键表即白名单，顺序无关）。
BASE_LIGHTING_BOUNDS: dict[str, tuple[float, float]] = {
    "exposure": (0.5, 2),
    "hemisphereIntensity": (0, 3),
    "ambientIntensity": (0, 2),
    "mainIntensity": (0, 5),
    "mainAzimuth": (-180, 180),
    "mainElevation": (5, 89),
    "mainShadowIntensity": (0, 1),
    "fillIntensity": (0, 3),
    "fillAzimuth": (-180, 180),
    "fillElevation": (0, 89),
    "topIntensity": (0, 3),
    "topAzimuth": (-180, 180),
    "topElevation": (0, 89),
    "floorBrightness": (50, 150),
}


def _valid_number(value: Any) -> bool:
    # bool 是 int 的子类：`True` 不能当成 1 通过区间判定。
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def valid_base_lighting(value: Any) -> bool:
    """一份 ``baseLighting`` 是否合法：非空字典、键在表内、值在区间内。"""
    if not isinstance(value, dict) or not value:
        return False
    if not value.keys() <= BASE_LIGHTING_BOUNDS.keys():
        return False
    for key, item in value.items():
        if not _valid_number(item):
            return False
        low, high = BASE_LIGHTING_BOUNDS[key]
        if item < low or item > high:
            return False
    return True


def valid_base_lighting_by_theme(value: Any) -> bool:
    """``{theme: baseLighting}`` 是否合法：主题在表内、每份光照各自合法。

    允许空字典（还没调过任何一个主题）；但一旦出现某个主题，它的取值必须合法 ——
    否则保存时的静默替换会让用户在另一台设备上看到完全不同的画面。
    """
    if not isinstance(value, dict):
        return False
    if not value.keys() <= LIGHTING_THEMES:
        return False
    return all(valid_base_lighting(item) for item in value.values())


# ── 柔光范围（0.8.9）─────────────────────────────────────────────────────
#
# 0.8.9 把「轻量柔光」的照射范围从 3D 控件 properties 上提到草稿级，按 sceneId 共享：
#
#   scene.lightRegionOverrides = { <sceneId>: { <regionKey>: descriptor } }
#   scene.lightRangeArchive    = { <sceneId>: [ { floorId, itemId, previous, at } ] }
#
# 这里只定义**区域描述符**的白名单与区间（键表即白名单），与前端
# `studio-light-ranges.ts` 的 `normalizeLightRegionDescriptor` 一一对应。

#: 绘制页自身的柔光范围所用保留 scene id。
STUDIO_RANGE_SCENE_ID = "__studio-floorplan__"

#: 描述符字段与区间（键表即白名单）。
LIGHT_REGION_BOUNDS: dict[str, tuple[float, float]] = {
    "width": (0.5, 20),
    "depth": (0.5, 20),
    "rotation": (-180, 180),
    "softness": (5, 100),
    "heightMin": (0, 20),
    "heightMax": (0, 20),
    "offsetX": (-50, 50),
    "offsetZ": (-50, 50),
}

#: 允许的光区形状。
LIGHT_REGION_SHAPES = frozenset({"circle", "square", "strip"})

#: 单场景区域数 / 场景数 / 撤销条数上限。
MAX_LIGHT_REGIONS = 512
MAX_LIGHT_RANGE_SCENES = 64
MAX_LIGHT_RANGE_ARCHIVE = 200


def valid_light_region_descriptor(value: Any) -> bool:
    """一份柔光范围描述符是否合法（空对象视为非法：没有可应用的范围）。"""
    if not isinstance(value, dict) or not value:
        return False
    for key, item in value.items():
        if key == "shape":
            if item not in LIGHT_REGION_SHAPES:
                return False
            continue
        if key == "moveCenter":
            if not isinstance(item, bool):
                return False
            continue
        if key not in LIGHT_REGION_BOUNDS:
            return False
        if not _valid_number(item):
            return False
        low, high = LIGHT_REGION_BOUNDS[key]
        if item < low or item > high:
            return False
    return True


def valid_light_region_overrides(value: Any, *, allow_default: bool = True) -> bool:
    """``{sceneId: {regionKey: descriptor}}`` 是否合法。

    ``allow_default=False`` 时禁止使用保留 id ``STUDIO_RANGE_SCENE_ID``
    （更新单个场景的端点用它挡住「顺手改掉公共范围」）。
    """
    if not isinstance(value, dict):
        return False
    if len(value) > MAX_LIGHT_RANGE_SCENES:
        return False
    for scene_id, regions in value.items():
        if not isinstance(scene_id, str) or not scene_id or len(scene_id) > 96:
            return False
        if not allow_default and scene_id == STUDIO_RANGE_SCENE_ID:
            return False
        if not isinstance(regions, dict) or len(regions) > MAX_LIGHT_REGIONS:
            return False
        for region_key, descriptor in regions.items():
            if not isinstance(region_key, str) or not region_key or len(region_key) > 96:
                return False
            if not valid_light_region_descriptor(descriptor):
                return False
    return True


def _valid_archive_entry(entry: object) -> bool:
    if not isinstance(entry, dict):
        return False
    if not isinstance(entry.get("floorId"), str) or not entry.get("floorId"):
        return False
    if not isinstance(entry.get("itemId"), str) or not entry.get("itemId"):
        return False
    if not _valid_number(entry.get("at", 0)):
        return False
    previous = entry.get("previous")
    return previous is None or valid_light_region_descriptor(previous)


def valid_light_range_archive(value: Any) -> bool:
    """``{sceneId: [{floorId,itemId,previous,at}]}`` 是否合法。

    ``previous`` 允许为 ``None``（表示「之前没有自定义」）。
    """
    if not isinstance(value, dict):
        return False
    for scene_id, entries in value.items():
        if not isinstance(scene_id, str) or not scene_id:
            return False
        if not isinstance(entries, list) or len(entries) > MAX_LIGHT_RANGE_ARCHIVE:
            return False
        if not all(_valid_archive_entry(entry) for entry in entries):
            return False
    return True


__all__ = [
    "BASE_LIGHTING_BOUNDS",
    "LIGHTING_THEMES",
    "LIGHT_REGION_BOUNDS",
    "LIGHT_REGION_SHAPES",
    "MAX_LIGHT_RANGE_ARCHIVE",
    "STUDIO_RANGE_SCENE_ID",
    "valid_base_lighting",
    "valid_base_lighting_by_theme",
    "valid_light_range_archive",
    "valid_light_region_descriptor",
    "valid_light_region_overrides",
]
