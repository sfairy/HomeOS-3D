"""外观与布局分区校验：页面行为、导航、反射、背景、交互、自动旋转、空闲行为。

分区内按「一组相关的键」拆成若干 ``_validate_*`` 函数（各自 ``(ctx, properties)`` 两个参数，
对齐本文件的参数棘轮），共用判定表放在模块顶部。

``pageBehaviors[page]`` 是**覆盖**而不是完整配置：先按 :data:`BEHAVIOR_FIELDS` 归一化
（``autoRotate: true`` 这种布尔简写补成 ``{'enabled': True}``），再只校验行为字段本身，
不能用整份配置的入口复校验——覆盖项不会带 ``sceneId``。
"""

from __future__ import annotations

import json

from fastapi import HTTPException

from .config_ctx import ValidationContext

#: 可分页的六个页面键。
PAGE_KEYS = frozenset({'light', 'vacuum', 'devices', 'overview', 'security', 'environment'})
#: 分页行为可覆盖的字段（也是全局行为字段）。
BEHAVIOR_FIELDS = frozenset(
    {'autoRotate', 'interaction', 'idleExitFocus', 'idleHideIcons', 'hideIconsWhileRotating'}
)
#: 弹窗/导航放置字段。
PLACEMENT_FIELDS = frozenset({'x', 'y', 'scale'})
#: 顶部导航偏移上限。
MAX_NAVIGATION_OFFSET = 300
#: 楼层字典上限（编号与相机共用）。
MAX_FLOORS = 128
#: 灯光区域覆盖条数上限、键长度上限。
MAX_LIGHT_REGIONS = 1024
MAX_REGION_KEY_LENGTH = 2048
#: 灯光区域必填边界与可选字段。
REGION_BOUNDS: dict[str, tuple[float, float]] = {
    'width': (0.5, 20),
    'depth': (0.5, 20),
    'rotation': (-180, 180),
    'softness': (0.05, 1),
}
REGION_REQUIRED_FIELDS = frozenset({*REGION_BOUNDS, 'shape'})
REGION_OPTIONAL_FIELDS = frozenset(
    {
        'offsetX',
        'offsetZ',
        'heightMax',
        'heightMin',
        'heightAbove',
        'heightBelow',
        'moveCenterEnabled',
    }
)
REGION_SHAPES = ('circle', 'square', 'ellipse', 'strip')
#: 背景与场景风格枚举。
LAYOUT_MODES = ('fill', 'free')
BACKGROUND_THEMES = ('dots', 'grid', 'contours', 'warm-dusk', 'warm-sunlight')
SCENE_STYLES = ('default', 'warm-wood')


def validate_appearance_sections(ctx: ValidationContext, properties: dict) -> None:
    """外观与布局分区校验：不合规处直接经 ``ctx.fail()`` 抛 422。"""

    _validate_top_level_flags(ctx, properties)
    _validate_page_behaviors(ctx, properties)
    _validate_page_metrics(ctx, properties)
    _validate_floors(ctx, properties)
    _validate_popup_layout(ctx, properties)
    _validate_navigation(ctx, properties)
    _validate_reflection(ctx, properties)
    _validate_light_regions(ctx, properties)
    _validate_background(ctx, properties)
    validate_behavior_overrides(ctx, properties)


def validate_behavior_overrides(ctx: ValidationContext, properties: dict) -> None:
    """行为字段判定：全局 ``interaction`` / ``autoRotate`` / 空闲行为与分页覆盖同契约。"""
    if 'hideIconsWhileRotating' in properties and not isinstance(
        properties['hideIconsWhileRotating'], bool
    ):
        ctx.fail()
    interaction = properties.get('interaction', {})
    if not isinstance(interaction, dict) or set(interaction) - {
        'panEnabled',
        'zoomEnabled',
        'rotationMode',
    }:
        ctx.fail()
    if interaction.get('rotationMode', 'free') not in {'free', 'vertical', 'horizontal'}:
        ctx.fail()
    if any(not isinstance(interaction.get(key, True), bool) for key in ('panEnabled', 'zoomEnabled')):
        ctx.fail()
    auto_rotate = properties.get('autoRotate', {})
    if not isinstance(auto_rotate, dict) or set(auto_rotate) - {
        'speed',
        'enabled',
        'direction',
        'idleSeconds',
        'returnToDefault',
    }:
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
    if not isinstance(idle_hide_icons, dict) or set(idle_hide_icons) - {'enabled', 'idleSeconds'}:
        ctx.fail()
    if not isinstance(idle_hide_icons.get('enabled', False), bool):
        ctx.fail()
    hide_idle_seconds = idle_hide_icons.get('idleSeconds', 30)
    if not isinstance(hide_idle_seconds, int) or not ctx.number(hide_idle_seconds, 1, 3600):
        ctx.fail()
    idle_exit_focus = properties.get('idleExitFocus', {})
    if not isinstance(idle_exit_focus, dict) or set(idle_exit_focus) - {'enabled', 'idleSeconds'}:
        ctx.fail()
    if not isinstance(idle_exit_focus.get('enabled', False), bool):
        ctx.fail()
    exit_idle_seconds = idle_exit_focus.get('idleSeconds', 30)
    if not isinstance(exit_idle_seconds, int) or not ctx.number(exit_idle_seconds, 1, 3600):
        ctx.fail()


def _validate_top_level_flags(ctx: ValidationContext, properties: dict) -> None:
    if 'uniformOverviewStack' in properties and not isinstance(properties['uniformOverviewStack'], bool):
        ctx.fail()
    if 'floorGap' in properties and not ctx.number(properties['floorGap'], 0, 20):
        ctx.fail()
    if properties.get('behaviorScope', 'global') not in ('global', 'page'):
        ctx.fail()


def _validate_page_behaviors(ctx: ValidationContext, properties: dict) -> None:
    page_behaviors = properties.get('pageBehaviors', {})
    if not isinstance(page_behaviors, dict) or set(page_behaviors) - PAGE_KEYS:
        ctx.fail()
    for page_behavior in page_behaviors.values():
        if not isinstance(page_behavior, dict) or set(page_behavior) - BEHAVIOR_FIELDS:
            ctx.fail()
        normalized = {
            field: {'enabled': field_value}
            if field in {'autoRotate', 'idleHideIcons'} and type(field_value) is bool
            else field_value
            for field, field_value in page_behavior.items()
        }
        validate_behavior_overrides(ctx, normalized)


def _validate_page_metrics(ctx: ValidationContext, properties: dict) -> None:
    saturation = properties.get('pageSaturation', {})
    if (
        not isinstance(saturation, dict)
        or set(saturation) - PAGE_KEYS
        or any(not ctx.number(saturation_value, 0, 100) for saturation_value in saturation.values())
    ):
        ctx.fail()
    page_dim = properties.get('pageDimStrength', {})
    if not isinstance(page_dim, dict) or set(page_dim) - PAGE_KEYS:
        ctx.fail()
    if any(not ctx.number(dim_value, 0, 100) for dim_value in page_dim.values()) or not ctx.number(
        properties.get('focusDimStrength', 15), 0, 100
    ):
        ctx.fail()


def _validate_floors(ctx: ValidationContext, properties: dict) -> None:
    floor_numbers = properties.get('floorNumbers', {})
    if not isinstance(floor_numbers, dict) or len(floor_numbers) > MAX_FLOORS:
        ctx.fail()
    for floor_id, floor_number in floor_numbers.items():
        if (
            not ctx.text(floor_id)
            or not floor_id
            or floor_id == 'all'
            or type(floor_number) is not int
            or floor_number == 0
            or not -99 <= floor_number <= 99
        ):
            ctx.fail()
    floor_cameras = properties.get('floorCameras', {})
    if not isinstance(floor_cameras, dict) or len(floor_cameras) > MAX_FLOORS:
        ctx.fail()
    for floor_id, camera in floor_cameras.items():
        if not ctx.text(floor_id) or not floor_id or camera is None:
            ctx.fail()
        ctx.validate_camera(camera)


def _validate_popup_layout(ctx: ValidationContext, properties: dict) -> None:
    popup_layout = properties.get('popupLayout', {})
    if not isinstance(popup_layout, dict) or set(popup_layout) - {'general', 'camera'}:
        ctx.fail()
    for placement in popup_layout.values():
        if not isinstance(placement, dict) or set(placement) - PLACEMENT_FIELDS:
            ctx.fail()
        if any(
            not ctx.number(axis_value, 0.5, 2)
            if axis == 'scale'
            else not ctx.number(axis_value, 0, 100)
            for axis, axis_value in placement.items()
        ):
            ctx.fail()


def _validate_navigation(ctx: ValidationContext, properties: dict) -> None:
    navigation = properties.get('navigation', {})
    if not isinstance(navigation, dict) or set(navigation) - {'floors', 'categories', 'followOffset'}:
        ctx.fail()
    if not ctx.number(navigation.get('followOffset', 16), 0, MAX_NAVIGATION_OFFSET):
        ctx.fail()
    for key, placement in navigation.items():
        if key == 'followOffset':
            continue
        if not isinstance(placement, dict) or set(placement) - PLACEMENT_FIELDS:
            ctx.fail()
        if any(
            not ctx.number(axis_value, 0, 100)
            for axis, axis_value in placement.items()
            if axis != 'scale'
        ):
            ctx.fail()
        if 'scale' in placement and not ctx.number(placement['scale'], 0.5, 2):
            ctx.fail()


def _validate_reflection(ctx: ValidationContext, properties: dict) -> None:
    if properties.get('lightingMode', 'standard') not in ('standard', 'region'):
        ctx.fail()
    reflection = properties.get('groundReflection', {})
    if not isinstance(reflection, dict) or set(reflection) - {'mode', 'strength', 'resolution'}:
        ctx.fail()
    if reflection.get('mode', 'off') not in ('off', 'inside', 'outside', 'all'):
        ctx.fail()
    if (
        not ctx.number(reflection.get('resolution', 512), 256, 768)
        or reflection.get('resolution', 512) not in (256, 512, 768)
    ):
        ctx.fail()
    if not ctx.number(reflection.get('strength', 0.18), 0, 0.45):
        ctx.fail()


def _validate_light_regions(ctx: ValidationContext, properties: dict) -> None:
    overrides = properties.get('lightRegionOverrides', {})
    if not isinstance(overrides, dict) or len(overrides) > MAX_LIGHT_REGIONS:
        ctx.fail()
    for region_key, region in overrides.items():
        if not ctx.text(region_key, MAX_REGION_KEY_LENGTH):
            ctx.fail()
        try:
            region_pair = json.loads(region_key)
        except (ValueError, RecursionError):
            ctx.fail()
        if (
            not isinstance(region_pair, list)
            or len(region_pair) != 2
            or any(not ctx.text(pair_item) or not pair_item for pair_item in region_pair)
        ):
            ctx.fail()
        if json.dumps(region_pair, ensure_ascii=False, separators=(',', ':')) != region_key:
            ctx.fail()
        if (
            not isinstance(region, dict)
            or not set(region) >= REGION_REQUIRED_FIELDS
            or set(region) - REGION_REQUIRED_FIELDS - REGION_OPTIONAL_FIELDS
        ):
            ctx.fail()
        if any(
            field in region and not ctx.number(region[field], -100, 100)
            for field in ('offsetX', 'offsetZ')
        ):
            ctx.fail()
        if any(
            field in region and not ctx.number(region[field], 0, 20)
            for field in ('heightAbove', 'heightBelow', 'heightMin', 'heightMax')
        ):
            ctx.fail()
        if 'heightMin' in region and 'heightMax' in region and region['heightMin'] > region['heightMax']:
            ctx.fail()
        if 'moveCenterEnabled' in region and not isinstance(region['moveCenterEnabled'], bool):
            ctx.fail()
        if region['shape'] not in REGION_SHAPES:
            ctx.fail()
        if any(not ctx.number(region[field], *bounds) for field, bounds in REGION_BOUNDS.items()):
            ctx.fail()


def _validate_background(ctx: ValidationContext, properties: dict) -> None:
    layout_mode = properties.get('layoutMode', 'free')
    if layout_mode not in LAYOUT_MODES or not isinstance(properties.get('backgroundVisible', True), bool):
        ctx.fail()
    background_theme = properties.get('backgroundTheme', 'grid')
    if not isinstance(background_theme, str) or background_theme not in BACKGROUND_THEMES:
        ctx.fail()
    scene_style = properties.get('sceneStyle', 'default')
    if not isinstance(scene_style, str) or scene_style not in SCENE_STYLES:
        ctx.fail()
    if properties.get('wallOpacity') is not None and not ctx.number(properties['wallOpacity'], 0, 1):
        ctx.fail()
    if not isinstance(properties.get('backgroundMotion', True), bool):
        ctx.fail()
    # 转动分辨率有专属提示语，故不复用通用 422 文案。
    if properties.get('motionRenderScale') is not None and not ctx.number(
        properties['motionRenderScale'], 0.25, 1
    ):
        raise HTTPException(status_code=422, detail='3D 转动分辨率无效')
    if not ctx.number(properties.get('renderScale', 1), 0.25, 2):
        ctx.fail()
    if not ctx.number(properties.get('focusVignetteStrength', 14), 0, 60):
        ctx.fail()
    if not ctx.number(properties.get('popupOpacity', 74), 0, 100):
        ctx.fail()
