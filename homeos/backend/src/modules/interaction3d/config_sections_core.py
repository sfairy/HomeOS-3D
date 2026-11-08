"""顶层键白名单与全局开关校验。"""

from __future__ import annotations

import re

from .config_ctx import (
    ValidationContext,
)

#: 天气实体：只接受 ``weather.*``，长度上限 200 与其它实体校验保持同一档。
WEATHER_ENTITY_PATTERN = 'weather\\.[a-z0-9_]{1,200}'

#: ``navigationDefaults`` 允许的键。
NAVIGATION_DEFAULT_FIELDS = frozenset({'floor', 'categories', 'floorSwitch', 'resetCategoryFromAll'})
#: 楼层切换模式：``same`` 保持当前分类（同类型切换）、``remember`` 用该层设置的分类
#: （跟随自定义）、``default`` 为旧值，运行时按 ``same`` 处理。
FLOOR_SWITCH_MODES = ('default', 'same', 'remember')
#: 可选的楼层分类（与 ``navigation-defaults.js`` 的 ``FLOOR_CATEGORY_CHOICES`` 同步）。
#: ``overview`` 即导航里的「3D（总览）」：没有设备配置，但舞台始终有该页签，可设为默认分类。
FLOOR_CATEGORY_CHOICES = ('overview', 'light', 'environment', 'devices', 'vacuum', 'security')
#: 原型污染键：来自 JSON 的 ``__proto__`` 会让 ``Object.assign`` 污染整条原型链。
PROTOTYPE_POLLUTION_KEYS = frozenset({'__proto__', 'constructor', 'prototype'})


def validate_core_sections(ctx: ValidationContext, properties: dict) -> None:
    """顶层键白名单与全局开关校验；不合规处直接经 ``ctx.fail()`` 抛 422。"""

    if not isinstance(properties, dict) or set(properties) - {
        'label',
        'camera',
        'lights',
        'devices',
        'sceneId',
        'floorGap',
        'security',
        'weather',
        'autoRotate',
        'layoutMode',
        'navigation',
        'sceneStyle',
        'environment',
        'interaction',
        'popupLayout',
        'renderScale',
        'wallOpacity',
        'baseLighting',
        'floorCameras',
        'floorNumbers',
        'instanceName',
        'lightingMode',
        'lightingModeVersion',
        'popupOpacity',
        'behaviorScope',
        'idleExitFocus',
        'idleHideIcons',
        'pageBehaviors',
        'floorSelection',
        'pageSaturation',
        'backgroundTheme',
        'pageDimStrength',
        'backgroundMotion',
        'focusDimStrength',
        'groundReflection',
        'templateReadonly',
        'backgroundVisible',
        'motionRenderScale',
        'warmBackgroundTheme',
        'lightRegionOverrides',
        'uniformOverviewStack',
        'focusVignetteStrength',
        'hideIconsWhileRotating',
        'navigationDefaults'}:
        ctx.fail()
    # 天气实体绑定：空表示不绑定（现场天气仍可用），只接受 weather.* 实体。
    weather = properties.get('weather', {})
    if not isinstance(weather, dict) or set(weather) - {'entityId'}:
        ctx.fail()
    weather_entity = weather.get('entityId', '')
    if not isinstance(weather_entity, str) or (
        weather_entity and not re.fullmatch(WEATHER_ENTITY_PATTERN, weather_entity)
    ):
        ctx.fail()
    if 'templateReadonly' in properties and not isinstance(properties['templateReadonly'], bool):
        ctx.fail()
    if not isinstance(properties.get('warmBackgroundTheme', 'warm-sunlight'), str) or properties.get(
        'warmBackgroundTheme', 'warm-sunlight'
    ) not in {'warm-dusk', 'warm-sunlight'}:
        ctx.fail()

def validate_navigation_defaults(ctx: ValidationContext, properties: dict) -> None:
    """``navigationDefaults``：记住用户上次停留的楼层 / 分类。

    三个容易踩的坑，这里逐一挡掉：

    - ``categories`` 的键来自楼层 id，**可以**是任意字符串，但绝不能是
      ``__proto__`` / ``constructor`` / ``prototype`` —— 前端会用 ``Object.assign``
      合并这份映射，原型键会污染所有对象；
    - ``categories`` 的值只能是 ``FLOOR_CATEGORY_CHOICES`` 里的一类，否则前端切到该分类时会渲染空白页；
    - 条数上限 256：一个项目不会真有 256 层，超了就是脏数据。
    """
    if 'navigationDefaults' not in properties:
        return
    defaults = properties['navigationDefaults']
    if not isinstance(defaults, dict) or set(defaults) - NAVIGATION_DEFAULT_FIELDS:
        ctx.fail()
    floor = defaults.get('floor', 'all')
    if not isinstance(floor, str) or not floor or floor in PROTOTYPE_POLLUTION_KEYS:
        ctx.fail()
    if defaults.get('floorSwitch', 'default') not in FLOOR_SWITCH_MODES:
        ctx.fail()
    if 'resetCategoryFromAll' in defaults and type(defaults['resetCategoryFromAll']) is not bool:
        ctx.fail()
    categories = defaults.get('categories', {})
    if not isinstance(categories, dict) or len(categories) > 256:
        ctx.fail()
    for floor_id, category in categories.items():
        if not isinstance(floor_id, str) or not floor_id or floor_id in ('all', *PROTOTYPE_POLLUTION_KEYS):
            ctx.fail()
        if category not in FLOOR_CATEGORY_CHOICES:
            ctx.fail()
