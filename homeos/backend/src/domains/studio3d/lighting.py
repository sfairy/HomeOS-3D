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


__all__ = [
    "BASE_LIGHTING_BOUNDS",
    "LIGHTING_THEMES",
    "valid_base_lighting",
    "valid_base_lighting_by_theme",
]
