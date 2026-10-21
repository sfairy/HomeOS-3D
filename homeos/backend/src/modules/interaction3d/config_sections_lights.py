"""灯光与场景分区校验：baseLighting 边界、场景 id、灯光列表。

灯光卡片是本仓字段最多的一类控件，因此这里复用 :func:`validate_layout_widget` 的共用骨架
（坐标 / 开关 / 点击动作 / 图标 / 相机），只把「灯的尺寸必须存在且为正数」「效果默认值与
效果范围」这类灯特有判定留在本模块。接受 / 拒绝集合以黄金用例为准。
"""

from __future__ import annotations

import re
from typing import Any

from .config_ctx import (
    CLICK_ACTIONS,
    ENTITY_ID_PATTERN,
    MDI_ICON_PATTERN,
    POSITION_BOUNDS,
    WIDGET_FLAG_FIELDS,
    ValidationContext,
    WidgetRules,
    validate_layout_widget,
)

#: ``baseLighting`` 的字段与边界（键表即白名单）。
BASE_LIGHTING_BOUNDS: dict[str, tuple[float, float]] = {
    'exposure': (0.5, 2),
    'hemisphereIntensity': (0, 3),
    'ambientIntensity': (0, 2),
    'mainIntensity': (0, 5),
    'mainAzimuth': (-180, 180),
    'mainElevation': (5, 89),
    'mainShadowIntensity': (0, 1),
    'fillIntensity': (0, 3),
    'fillAzimuth': (-180, 180),
    'fillElevation': (0, 89),
    'topIntensity': (0, 3),
    'topAzimuth': (-180, 180),
    'topElevation': (0, 89),
    'floorBrightness': (50, 150),
}
#: 顶层文本属性：出现即必须是长度受限文本。
TEXT_PROPERTY_KEYS = ('label', 'instanceName', 'floorSelection')
#: 场景 id：32 位小写十六进制（与前端 sceneId 生成口径一致）。
SCENE_ID_PATTERN = re.compile(r'[0-9a-f]{32}')
#: 灯光卡片字段白名单。
LIGHT_FIELDS = frozenset(
    {
        'x',
        'y',
        'id',
        'icon',
        'size',
        'label',
        'height',
        'floorId',
        'groupId',
        'hitSize',
        'visible',
        'entityId',
        'iconSize',
        'clickAction',
        'effectRange',
        'focusCamera',
        'buttonHidden',
        'fadeDuration',
        'effectDefaults',
        'hiddenClickable',
        'temperatureFallback',
    }
)
#: 灯光卡片必须以文本出现的字段。
LIGHT_TEXT_FIELDS = ('id', 'floorId', 'groupId', 'entityId', 'label')
#: 光效色温兜底：``default`` 默认暖白 3500K，``floorplan`` 跟随户型灯具色温。
LIGHT_TEMPERATURE_FALLBACKS = frozenset({'default', 'floorplan'})
#: 灯光卡片数值字段：出现即必须在区间内。
LIGHT_NUMBER_BOUNDS: tuple[tuple[str, float, float], ...] = (('fadeDuration', 0, 10),)
#: 灯光卡片「出现即必须为正数」的字段（尺寸另判：必须存在）。
LIGHT_POSITIVE_FIELDS = ('iconSize', 'hitSize')
#: 灯光卡片共用骨架。尺寸不交给骨架：灯的 ``size`` 是**必须存在**且为正，而骨架只做「出现即正」。
LIGHT_RULES = WidgetRules(
    allowed_fields=LIGHT_FIELDS,
    click_actions=CLICK_ACTIONS,
    default_click_action='focus',
    icon_pattern=MDI_ICON_PATTERN,
    flag_fields=WIDGET_FLAG_FIELDS,
    position_bounds=POSITION_BOUNDS,
    size_fields=(),
    position_required=True,
)
#: 默认灯光效果（亮度 / 色温 K）。上限 150 与前端 ``LIGHT_EFFECT_DEFAULTS`` 一致；
#: 收紧到 100 会让含这些灯光的控件在保存时整份 422。
LIGHT_EFFECT_BOUNDS: dict[str, tuple[float, float]] = {
    'brightness': (0, 150),
    'kelvin': (1000, 20000),
}
#: 效果范围：四个键必须齐全（多一个少一个都不合规）。
LIGHT_EFFECT_RANGE_FIELDS = frozenset({'brightnessMax', 'brightnessMin', 'temperatureMax', 'temperatureMin'})
#: 效果范围边界：``(下限键, 上限键, 低, 高)``，并要求下限 ≤ 上限。
LIGHT_EFFECT_RANGE_BOUNDS: tuple[tuple[str, str, float, float], ...] = (
    ('brightnessMin', 'brightnessMax', 0, 150),
    ('temperatureMin', 'temperatureMax', 1000, 20000),
)


class LightsSectionValidator:
    """灯光分区校验：跨件状态（重复 ``id``）挂在实例上，逐灯判定拆成小方法。"""

    def __init__(self, ctx: ValidationContext) -> None:
        self._ctx = ctx
        self._seen_ids: set[Any] = set()

    def validate(self, properties: dict) -> None:
        ctx = self._ctx
        if not ctx.bounded_map(properties.get('baseLighting', {}), BASE_LIGHTING_BOUNDS):
            ctx.fail()
        for key in TEXT_PROPERTY_KEYS:
            if key in properties and not ctx.text(properties[key]):
                ctx.fail()
        scene_id = properties.get('sceneId', '')
        if not isinstance(scene_id, str) or not scene_id or not ctx.pattern(scene_id, SCENE_ID_PATTERN):
            ctx.fail()
        lights = properties.get('lights', [])
        if not isinstance(lights, list):
            ctx.fail()
        for light in lights:
            self._validate_light(light)

    def _validate_light(self, light: Any) -> None:
        ctx = self._ctx
        light_id = light.get('id') if isinstance(light, dict) else None
        if not ctx.has_only(light, LIGHT_FIELDS) or not ctx.require_text(light, LIGHT_TEXT_FIELDS):
            ctx.fail()
        if not light_id or light_id in self._seen_ids:
            ctx.fail()
        self._seen_ids.add(light_id)
        if not ctx.pattern(light.get('entityId', ''), ENTITY_ID_PATTERN):
            ctx.fail()
        validate_layout_widget(ctx, light, LIGHT_RULES)
        if not ctx.positive_number(light.get('size')):
            ctx.fail()
        if not ctx.numbers_within(light, LIGHT_NUMBER_BOUNDS) or not ctx.positive_fields(
            light, LIGHT_POSITIVE_FIELDS
        ):
            ctx.fail()
        if 'effectDefaults' in light and not ctx.bounded_map(light['effectDefaults'], LIGHT_EFFECT_BOUNDS):
            ctx.fail()
        effect_range = light.get('effectRange')
        if effect_range is not None:
            self._validate_effect_range(effect_range)
        if 'temperatureFallback' in light and light['temperatureFallback'] not in LIGHT_TEMPERATURE_FALLBACKS:
            ctx.fail()
        ctx.validate_camera(light.get('focusCamera'))

    def _validate_effect_range(self, effect_range: Any) -> None:
        ctx = self._ctx
        if not isinstance(effect_range, dict) or set(effect_range) != LIGHT_EFFECT_RANGE_FIELDS:
            ctx.fail()
        for minimum_key, maximum_key, low, high in LIGHT_EFFECT_RANGE_BOUNDS:
            minimum = effect_range[minimum_key]
            maximum = effect_range[maximum_key]
            if not ctx.number(minimum, low, high) or not ctx.number(maximum, low, high) or minimum > maximum:
                ctx.fail()


def validate_lights_section(ctx: ValidationContext, properties: dict) -> None:
    """灯光与场景分区校验：baseLighting 边界、场景 id、灯光列表；不合规处直接经 ``ctx.fail()`` 抛 422。"""
    LightsSectionValidator(ctx).validate(properties)
