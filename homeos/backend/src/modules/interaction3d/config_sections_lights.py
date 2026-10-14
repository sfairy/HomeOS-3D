"""灯光与场景分区校验：baseLighting 边界、场景 id、灯光列表。"""

from __future__ import annotations

import re

from .config_ctx import (
    ValidationContext,
)


def validate_lights_section(ctx: ValidationContext, properties: dict) -> None:
    """灯光与场景分区校验：baseLighting 边界、场景 id、灯光列表；不合规处直接经 ``ctx.fail()`` 抛 422。"""

    lighting = properties.get('baseLighting', {})
    bounds = {
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
        'topElevation': (0, 89)}
    bounds['floorBrightness'] = (50, 150)
    if not isinstance(lighting, dict) or set(lighting) - set(bounds) or any(not ctx.number(value, *bounds[key]) for key, value in lighting.items()):
        ctx.fail()
    for key in ('label', 'instanceName', 'floorSelection'):
        if key in properties and not ctx.text(properties[key]):
            ctx.fail()
    scene_id = properties.get('sceneId', '')
    if not isinstance(scene_id, str) or not scene_id or not re.fullmatch('[0-9a-f]{32}', scene_id):
        ctx.fail()
    lights = properties.get('lights', [])
    if not isinstance(lights, list):
        ctx.fail()
    ids = set()
    for light in lights:
        if not isinstance(light, dict) or set(light) - {
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
            'hiddenClickable'}:
            ctx.fail()
        if any(not ctx.text(light.get(key, '')) for key in ('id', 'floorId', 'groupId', 'entityId', 'label')):
            ctx.fail()
        if not light.get('id') or light['id'] in ids:
            ctx.fail()
        ids.add(light['id'])
        entity = light.get('entityId', '')
        if entity and not re.fullmatch('[a-z_]+\\.[a-z0-9_]+', entity):
            ctx.fail()
        if not all(ctx.number(light.get(key), low, high) for key, low, high in (('x', -1000000, 1000000), ('y', -1000000, 1000000), ('height', 0, 20))):
            ctx.fail()
        if not ctx.positive_number(light.get('size')):
            ctx.fail()
        if 'visible' in light and not isinstance(light['visible'], bool):
            ctx.fail()
        if any(key in light and not isinstance(light[key], bool) for key in ('hiddenClickable', 'buttonHidden')):
            ctx.fail()
        if light.get('clickAction', 'focus') not in ('focus', 'turn-on-focus', 'turn-on', 'turn-on-panel'):
            ctx.fail()
        if any(key in light and not ctx.positive_number(light[key]) for key in ('iconSize', 'hitSize')):
            ctx.fail()
        if 'icon' in light and (not isinstance(light['icon'], str) or not re.fullmatch('mdi:[a-z0-9][a-z0-9-]{0,119}', light['icon'])):
            ctx.fail()
        if 'fadeDuration' in light and not ctx.number(light['fadeDuration'], 0, 10):
            ctx.fail()
        # 默认灯光效果：亮度与色温（K），不填表示不做预设。
        # 上限放宽到 150 是为了兼容存量草稿（前端 LIGHT_EFFECT_DEFAULTS 也是 150）；
        # 收紧到 100 会让含这些灯光的控件在保存时整份 422，读入侧不放大、渲染侧按 100 封顶即可。
        if 'effectDefaults' in light:
            defaults = light['effectDefaults']
            bounds = {
                'brightness': (0, 150),
                'kelvin': (1000, 20000)}
            if not isinstance(defaults, dict) or set(defaults) - set(bounds) or any(not ctx.number(value, *bounds[key]) for key, value in defaults.items()):
                ctx.fail()
        effect_range = light.get('effectRange')
        if effect_range is not None:
            fields = {
                'brightnessMax',
                'brightnessMin',
                'temperatureMax',
                'temperatureMin'}
            if not isinstance(effect_range, dict) or set(effect_range) != fields:
                ctx.fail()
            for minimum, maximum, low, high in (('brightnessMin', 'brightnessMax', 0, 150), ('temperatureMin', 'temperatureMax', 1000, 20000)):
                if not ctx.number(effect_range[minimum], low, high) or not ctx.number(effect_range[maximum], low, high) or effect_range[minimum] > effect_range[maximum]:
                    ctx.fail()
        ctx.validate_camera(light.get('focusCamera'))
