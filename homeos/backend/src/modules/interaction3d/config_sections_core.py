"""顶层键白名单与全局开关校验。"""

from __future__ import annotations

from .config_ctx import (
    ValidationContext,
)


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
    if 'templateReadonly' in properties and not isinstance(properties['templateReadonly'], bool):
        ctx.fail()
    if not isinstance(properties.get('warmBackgroundTheme', 'warm-sunlight'), str) or properties.get(
        'warmBackgroundTheme', 'warm-sunlight'
    ) not in {'warm-dusk', 'warm-sunlight'}:
        ctx.fail()
