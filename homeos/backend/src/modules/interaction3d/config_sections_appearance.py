"""外观与布局分区校验：页面行为、导航、反射、背景、交互、自动旋转、空闲行为。"""

from __future__ import annotations

import json

from fastapi import HTTPException

from .config_ctx import (
    ValidationContext,
)


def validate_appearance_sections(ctx: ValidationContext, properties: dict) -> None:
    """外观与布局分区校验：页面行为、导航、反射、背景、交互、自动旋转、空闲行为；不合规处直接经 ``ctx.fail()`` 抛 422。"""

    if 'uniformOverviewStack' in properties and not isinstance(properties['uniformOverviewStack'], bool):
        ctx.fail()
    if 'floorGap' in properties and not ctx.number(properties['floorGap'], 0, 20):
        ctx.fail()
    if properties.get('behaviorScope', 'global') not in ('global', 'page'):
        ctx.fail()
    page_behaviors = properties.get('pageBehaviors', {})
    if not isinstance(page_behaviors, dict) or set(page_behaviors) - {
        'light',
        'vacuum',
        'devices',
        'overview',
        'security',
        'environment'}:
        ctx.fail()
    for behavior in page_behaviors.values():
        if not isinstance(behavior, dict) or set(behavior) - {
            'autoRotate',
            'interaction',
            'idleExitFocus',
            'idleHideIcons',
            'hideIconsWhileRotating'}:
            ctx.fail()
        normalized = {
            key: {'enabled': value} if key in {'autoRotate', 'idleHideIcons'} and type(value) is bool else value
            for key, value in behavior.items()
        }
        # pageBehaviors 归一化后复用整份入口（``full`` 即 ``validate_config`` 自身）
        ctx.full(normalized)
    saturation = properties.get('pageSaturation', {})
    if not isinstance(saturation, dict) or set(saturation) - {
        'light',
        'vacuum',
        'devices',
        'overview',
        'security',
        'environment'} or any(not ctx.number(value, 0, 100) for value in saturation.values()):
        ctx.fail()
    page_dim = properties.get('pageDimStrength', {})
    if not isinstance(page_dim, dict) or set(page_dim) - {
        'light',
        'vacuum',
        'devices',
        'overview',
        'security',
        'environment'}:
        ctx.fail()
    if any(not ctx.number(value, 0, 100) for value in page_dim.values()) or not ctx.number(properties.get('focusDimStrength', 15), 0, 100):
        ctx.fail()
    floor_numbers = properties.get('floorNumbers', {})
    if not isinstance(floor_numbers, dict) or len(floor_numbers) > 128:
        ctx.fail()
    for floor_id, floor_number in floor_numbers.items():
        if not ctx.text(floor_id) or not floor_id or floor_id == 'all' or type(floor_number) is not int or floor_number == 0 or not -99 <= floor_number <= 99:
            ctx.fail()
    floor_cameras = properties.get('floorCameras', {})
    if not isinstance(floor_cameras, dict) or len(floor_cameras) > 128:
        ctx.fail()
    for floor_id, camera in floor_cameras.items():
        if not ctx.text(floor_id) or not floor_id or camera is None:
            ctx.fail()
        ctx.validate_camera(camera)
    popup_layout = properties.get('popupLayout', {})
    if not isinstance(popup_layout, dict) or set(popup_layout) - {
        'general',
        'camera'}:
        ctx.fail()
    for placement in popup_layout.values():
        if not isinstance(placement, dict) or set(placement) - {
            'x',
            'y',
            'scale'}:
            ctx.fail()
        if any(not ctx.number(value, 0.5, 2) if axis == 'scale' else not ctx.number(value, 0, 100) for axis, value in placement.items()):
            ctx.fail()
    navigation = properties.get('navigation', {})
    if not isinstance(navigation, dict) or set(navigation) - {
        'floors',
        'categories',
        'followOffset'}:
        ctx.fail()
    if not ctx.number(navigation.get('followOffset', 16), 0, 300):
        ctx.fail()
    for key, placement in navigation.items():
        if key == 'followOffset':
            continue
        if not isinstance(placement, dict) or set(placement) - {
            'x',
            'y',
            'scale'}:
            ctx.fail()
        if any(not ctx.number(value, 0, 100) for axis, value in placement.items() if axis != 'scale'):
            ctx.fail()
        if 'scale' in placement and not ctx.number(placement['scale'], 0.5, 2):
            ctx.fail()
    if properties.get('lightingMode', 'standard') not in ('standard', 'region'):
        ctx.fail()
    reflection = properties.get('groundReflection', {})
    if not isinstance(reflection, dict) or set(reflection) - {
        'mode',
        'strength',
        'resolution'}:
        ctx.fail()
    if reflection.get('mode', 'off') not in ('off', 'inside', 'outside', 'all'):
        ctx.fail()
    if not ctx.number(reflection.get('resolution', 512), 256, 768) or reflection.get('resolution', 512) not in (256, 512, 768):
        ctx.fail()
    if not ctx.number(reflection.get('strength', 0.18), 0, 0.45):
        ctx.fail()
    overrides = properties.get('lightRegionOverrides', {})
    if not isinstance(overrides, dict) or len(overrides) > 1024:
        ctx.fail()
    region_bounds = {
        'width': (0.5, 20),
        'depth': (0.5, 20),
        'rotation': (-180, 180),
        'softness': (0.05, 1)}
    region_fields = {*region_bounds, 'shape'}
    region_optional = {
        'offsetX',
        'offsetZ',
        'heightMax',
        'heightMin',
        'heightAbove',
        'heightBelow',
        'moveCenterEnabled'}
    for key, region in overrides.items():
        if not ctx.text(key, 2048):
            ctx.fail()
        try:
            pair = json.loads(key)
        except (ValueError, RecursionError):
            ctx.fail()
        if not isinstance(pair, list) or len(pair) != 2 or any(not ctx.text(value) or not value for value in pair):
            ctx.fail()
        if json.dumps(pair, ensure_ascii=False, separators=(',', ':')) != key:
            ctx.fail()
        if not isinstance(region, dict) or not region_fields <= set(region) or set(region) - region_fields - region_optional:
            ctx.fail()
        if any(field in region and not ctx.number(region[field], -100, 100) for field in ('offsetX', 'offsetZ')):
            ctx.fail()
        if any(field in region and not ctx.number(region[field], 0, 20) for field in ('heightAbove', 'heightBelow', 'heightMin', 'heightMax')):
            ctx.fail()
        if 'heightMin' in region and 'heightMax' in region and region['heightMin'] > region['heightMax']:
            ctx.fail()
        if 'moveCenterEnabled' in region and not isinstance(region['moveCenterEnabled'], bool):
            ctx.fail()
        if region['shape'] not in ('circle', 'square', 'ellipse', 'strip'):
            ctx.fail()
        if any(not ctx.number(region[field], *bounds) for field, bounds in region_bounds.items()):
            ctx.fail()
    if properties.get('layoutMode', 'free') not in {
        'fill',
        'free'} or not isinstance(properties.get('backgroundVisible', True), bool):
        ctx.fail()
    if not isinstance(properties.get('backgroundTheme', 'grid'), str) or properties.get('backgroundTheme', 'grid') not in {
        'dots',
        'grid',
        'contours',
        'warm-dusk',
        'warm-sunlight'}:
        ctx.fail()
    if not isinstance(properties.get('sceneStyle', 'default'), str) or properties.get('sceneStyle', 'default') not in {
        'default',
        'warm-wood'}:
        ctx.fail()
    if properties.get('wallOpacity') is not None and not ctx.number(properties['wallOpacity'], 0, 1):
        ctx.fail()
    if not isinstance(properties.get('backgroundMotion', True), bool):
        ctx.fail()
    if properties.get('motionRenderScale') is not None and not ctx.number(properties['motionRenderScale'], 0.25, 1):
        raise HTTPException(status_code=422, detail='3D 转动分辨率无效')
    if not ctx.number(properties.get('renderScale', 1), 0.25, 2):
        ctx.fail()
    if not ctx.number(properties.get('focusVignetteStrength', 14), 0, 60):
        ctx.fail()
    if not ctx.number(properties.get('popupOpacity', 74), 0, 100):
        ctx.fail()
    if 'hideIconsWhileRotating' in properties and not isinstance(properties['hideIconsWhileRotating'], bool):
        ctx.fail()
    interaction = properties.get('interaction', {})
    if not isinstance(interaction, dict) or set(interaction) - {
        'panEnabled',
        'zoomEnabled',
        'rotationMode'}:
        ctx.fail()
    if interaction.get('rotationMode', 'free') not in {
        'free',
        'vertical',
        'horizontal'}:
        ctx.fail()
    if any(not isinstance(interaction.get(key, True), bool) for key in ('panEnabled', 'zoomEnabled')):
        ctx.fail()
    auto_rotate = properties.get('autoRotate', {})
    if not isinstance(auto_rotate, dict) or set(auto_rotate) - {
        'speed',
        'enabled',
        'direction',
        'idleSeconds',
        'returnToDefault'}:
        ctx.fail()
    if not isinstance(auto_rotate.get('enabled', False), bool):
        ctx.fail()
    if not isinstance(auto_rotate.get('returnToDefault', False), bool):
        ctx.fail()
    if auto_rotate.get('direction', 'clockwise') not in ('clockwise', 'counterclockwise'):
        ctx.fail()
    idle_seconds = auto_rotate.get('idleSeconds', 30)
    if not isinstance(idle_seconds, int) or not ctx.number(idle_seconds, 1, 3600):
        ctx.fail()
    if not ctx.number(auto_rotate.get('speed', 6), 0.5, 30):
        ctx.fail()
    idle_hide_icons = properties.get('idleHideIcons', {})
    if not isinstance(idle_hide_icons, dict) or set(idle_hide_icons) - {
        'enabled',
        'idleSeconds'}:
        ctx.fail()
    if not isinstance(idle_hide_icons.get('enabled', False), bool):
        ctx.fail()
    hide_idle_seconds = idle_hide_icons.get('idleSeconds', 30)
    if not isinstance(hide_idle_seconds, int) or not ctx.number(hide_idle_seconds, 1, 3600):
        ctx.fail()
    idle_exit_focus = properties.get('idleExitFocus', {})
    if not isinstance(idle_exit_focus, dict) or set(idle_exit_focus) - {
        'enabled',
        'idleSeconds'}:
        ctx.fail()
    if not isinstance(idle_exit_focus.get('enabled', False), bool):
        ctx.fail()
    exit_idle_seconds = idle_exit_focus.get('idleSeconds', 30)
    if not isinstance(exit_idle_seconds, int) or not ctx.number(exit_idle_seconds, 1, 3600):
        ctx.fail()
