"""顶层键白名单与全局开关校验。"""

from __future__ import annotations

import re

from .config_ctx import (
    ValidationContext,
)

#: 天气实体：只接受 ``weather.*``，长度上限 200 与其它实体校验保持同一档。
WEATHER_ENTITY_PATTERN = 'weather\\.[a-z0-9_]{1,200}'


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
        'hideIconsWhileRotating'}:
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
