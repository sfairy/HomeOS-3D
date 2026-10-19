"""devices 分区校验：电视、音箱、扫地机、NAS；汽车/冰箱等家电集合委托 :mod:`device`。

四类控件差别在「实体域 + 附加结构」，公共骨架（坐标/尺寸/开关/点击/图标/相机）走
:func:`config_ctx.validate_layout_widget`，各自的白名单与图标档位写在模块顶部的
:class:`WidgetRules` 里；附加结构（电视图片、扫地机地图与快捷卡片、NAS 状态源）各自一个函数。

函数参数上限 3 个（``ctx`` + 对象），这是本文件的棘轮额度，也是这里的组织原则。
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from typing import Any, NamedTuple

from .config_ctx import (
    CLICK_ACTIONS_FULL,
    CLICK_ACTIONS_LITE,
    ENTITY_ID_PATTERN,
    MDI_ICON_LOOSE_PATTERN,
    MDI_ICON_PATTERN,
    POSITION_BOUNDS,
    SIZE_FIELDS,
    ValidationContext,
    WidgetRules,
    validate_layout_widget,
)
from .device import DEVICE_PROFILES, GENERIC_DEVICE_COLLECTIONS, validate_device_bindings

#: 控件身份字段：必须存在且非空。
IDENTITY_FIELDS = ('id', 'floorId', 'modelId')
#: 控件文本字段。
WIDGET_TEXT_FIELDS = ('id', 'floorId', 'modelId', 'label')


# ── 电视 ───────────────────────────────────────────────────────────────────
TELEVISION_FIELDS = frozenset(
    {
        'x',
        'y',
        'id',
        'icon',
        'size',
        'label',
        'height',
        'floorId',
        'hitSize',
        'modelId',
        'visible',
        'entityId',
        'iconSize',
        'clickAction',
        'focusCamera',
        'buttonHidden',
        'powerEntityId',
        'hiddenClickable',
        'screenImage',
    }
)
#: ``powerEntityId`` 可选，不单独绑定时跟随 ``media_player``。
TELEVISION_ENTITY = re.compile(r'media_player\.[a-z0-9_]+')
#: 屏幕图片资源：``user:`` + 32 位十六进制（空值也拒绝：有 ``screenImage`` 就必须有资源）。
SCREEN_IMAGE_ASSET = re.compile(r'user:[0-9a-f]{32}')
TELEVISION_RULES = WidgetRules(
    allowed_fields=TELEVISION_FIELDS,
    click_actions=CLICK_ACTIONS_FULL,
    default_click_action='focus-panel',
    icon_pattern=MDI_ICON_LOOSE_PATTERN,
    position_bounds=POSITION_BOUNDS,
    size_fields=SIZE_FIELDS,
)


# ── 音箱 ───────────────────────────────────────────────────────────────────
SPEAKER_FIELDS = frozenset(
    {
        'x',
        'y',
        'id',
        'icon',
        'size',
        'label',
        'height',
        'floorId',
        'hitSize',
        'modelId',
        'visible',
        'entityId',
        'iconSize',
        'clickAction',
        'focusCamera',
        'buttonHidden',
        'hiddenClickable',
    }
)
SPEAKER_RULES = WidgetRules(
    allowed_fields=SPEAKER_FIELDS,
    click_actions=CLICK_ACTIONS_LITE,
    default_click_action='focus-panel',
    icon_pattern=MDI_ICON_LOOSE_PATTERN,
    position_bounds=POSITION_BOUNDS,
    size_fields=SIZE_FIELDS,
)


# ── 扫地机 ─────────────────────────────────────────────────────────────────
VACUUM_FIELDS = frozenset(
    {
        'x',
        'y',
        'id',
        'map',
        'icon',
        'size',
        'label',
        'height',
        'floorId',
        'hitSize',
        'modelId',
        'visible',
        'deviceId',
        'entityId',
        'iconSize',
        'shortcuts',
        'deviceName',
        'clickAction',
        'focusCamera',
        'funMessages',
        'buttonHidden',
        'followCamera',
        'motionEnabled',
        'hiddenClickable',
        'relatedEntityIds',
        'backgroundOpacity',
    }
)
VACUUM_ENTITY = re.compile(r'vacuum\.[a-z0-9_]+')
#: 扫地机地图贴片白名单与边界。
VACUUM_MAP_FIELDS = frozenset(
    {
        'x',
        'y',
        'depth',
        'width',
        'opacity',
        'visible',
        'entityId',
        'rotation',
        'sourceMapId',
    }
)
VACUUM_MAP_ENTITY = re.compile(r'(?:camera|image)\.[a-z0-9_]+')
VACUUM_MAP_BOUNDS: tuple[tuple[str, float, float], ...] = (
    ('x', -1_000_000, 1_000_000),
    ('y', -1_000_000, 1_000_000),
    ('width', 0.01, 1_000_000),
    ('depth', 0.01, 1_000_000),
    ('rotation', -360, 360),
    ('opacity', 0, 100),
)
MAX_SOURCE_MAP_ID_LENGTH = 128
#: 扫地机快捷卡片白名单。
VACUUM_SHORTCUT_FIELDS = frozenset(
    {
        'x',
        'y',
        'id',
        'icon',
        'size',
        'label',
        'height',
        'hitSize',
        'visible',
        'entityId',
        'fontSize',
        'iconSize',
        'iconHidden',
        'labelHidden',
        'buttonHidden',
        'hiddenClickable',
    }
)
VACUUM_SHORTCUT_FLAG_FIELDS = ('hiddenClickable', 'buttonHidden', 'iconHidden', 'labelHidden')
#: 快捷卡片上"出现即必须为正数"的尺寸类字段。
VACUUM_SHORTCUT_SIZE_FIELDS = ('size', 'iconSize', 'hitSize', 'fontSize')
VACUUM_RULES = WidgetRules(
    allowed_fields=VACUUM_FIELDS,
    click_actions=CLICK_ACTIONS_LITE,
    default_click_action='focus-panel',
    icon_pattern=MDI_ICON_LOOSE_PATTERN,
    position_bounds=POSITION_BOUNDS,
    size_fields=SIZE_FIELDS,
)


# ── NAS ────────────────────────────────────────────────────────────────────
NAS_FIELDS = frozenset(
    {
        'x',
        'y',
        'id',
        'icon',
        'size',
        'label',
        'height',
        'floorId',
        'hitSize',
        'modelId',
        'visible',
        'entityId',
        'iconSize',
        'clickAction',
        'focusCamera',
        'buttonHidden',
        'statusSource',
        'hiddenClickable',
    }
)
NAS_ENTITY = re.compile(r'(?:binary_sensor|switch|input_boolean)\.[a-z0-9_]+')
#: 状态源：平台枚举、指标域、指标分组与类型。
NAS_STATUS_SOURCE_PLATFORMS = ('fnos', 'synology_dsm')
NAS_STATUS_ENTITY = re.compile(r'(?:sensor|binary_sensor)\.[a-z0-9_]+')
NAS_STATUS_SOURCE_REQUIRED_FIELDS = frozenset(
    {'name', 'metrics', 'deviceId', 'platform', 'primaryEntityId'}
)
NAS_STATUS_SOURCE_OPTIONAL_FIELDS = frozenset({'visibleMetrics', 'groupOrder'})
NAS_METRIC_FIELDS = frozenset({'kind', 'group', 'label', 'entityId'})
NAS_METRIC_GROUPS = ('system', 'storage', 'network', 'health')
NAS_METRIC_KINDS = ('number', 'status', 'problem', 'timestamp')
NAS_RULES = WidgetRules(
    allowed_fields=NAS_FIELDS,
    click_actions=CLICK_ACTIONS_LITE,
    default_click_action='focus',
    icon_pattern=MDI_ICON_PATTERN,
    position_bounds=POSITION_BOUNDS,
    size_fields=SIZE_FIELDS,
)


def validate_devices_section(ctx: ValidationContext, properties: dict) -> None:
    """devices 分区校验：不合规处直接经 ``ctx.fail()`` 抛 422。"""

    devices = properties.get('devices', {})
    if not isinstance(devices, dict):
        ctx.fail('3D 设备配置的 devices 必须是对象。')
    known_collections = {
        'nas',
        'televisions',
        'speakers',
        'vacuums',
        *GENERIC_DEVICE_COLLECTIONS,
    }
    # 旧版 / 未来版本留下的「空分类」不承载任何数据（如早期导出的 ``freezers: []``）。
    # 直接按未知键拒绝会让这类历史草稿永久无法保存，所以只拦有内容的不认识分类。
    unknown_collections = {
        collection
        for collection in set(devices) - known_collections
        if devices[collection]
    }
    if unknown_collections:
        ctx.fail('3D 设备配置包含未知分类：' + '、'.join(sorted(unknown_collections)) + '。')
    for profile in DEVICE_PROFILES.values():
        validate_device_bindings(ctx, devices.get(profile['collection'], []), profile['model_type'])
    _validate_televisions(ctx, devices)
    _validate_speakers(ctx, devices)
    _validate_vacuums(ctx, devices)
    _validate_nas_devices(ctx, devices)
    ctx.validate_camera(properties.get('camera'))


class _CollectionSpec(NamedTuple):
    """一类控件集合的取数与白名单（电视 / 音箱 / 扫地机 / NAS）。

    打包成参数对象而非再加一个形参：本文件的棘轮额度是每个函数 2 个参数
    （``ctx`` + 一个对象），多一个位置参数就会顶破额度。
    """

    devices: dict
    field_name: str
    allowed_fields: frozenset[str]


def _layout_devices(ctx: ValidationContext, spec: _CollectionSpec) -> list[Any]:
    """取 ``spec.devices[spec.field_name]``；不是列表即 422（``ctx.fail`` 直接抛）。"""
    widgets = spec.devices.get(spec.field_name, [])
    if not isinstance(widgets, list):
        ctx.fail()
    return widgets


def _unique_layout_widgets(ctx: ValidationContext, spec: _CollectionSpec) -> Iterator[Any]:
    """逐项做「字段白名单 + ``id``/``(floorId, modelId)`` 去重」两道公共校验。

    这四类控件的前置校验完全同形，差异只在白名单与域内附加结构上；骨架此前被复制了
    四份，收敛到一处后新增控件类型不必再抄一遍。
    """
    seen_ids: set[Any] = set()
    seen_models: set[Any] = set()
    for widget in _layout_devices(ctx, spec):
        if not ctx.has_only(widget, spec.allowed_fields):
            ctx.fail()
        if not ctx.register_layout_widget(seen_ids, seen_models, widget):
            ctx.fail()
        yield widget


def _validate_televisions(ctx: ValidationContext, devices: dict) -> None:
    spec = _CollectionSpec(devices, 'televisions', TELEVISION_FIELDS)
    for television in _unique_layout_widgets(ctx, spec):
        _validate_television(ctx, television)


def _validate_television(ctx: ValidationContext, television: Any) -> None:
    if not ctx.require_text(television, (*WIDGET_TEXT_FIELDS, 'entityId')):
        ctx.fail()
    if not ctx.require_value(television, IDENTITY_FIELDS):
        ctx.fail()
    if not ctx.pattern(television.get('entityId', ''), TELEVISION_ENTITY):
        ctx.fail()
    if not ctx.pattern(television.get('powerEntityId', ''), ENTITY_ID_PATTERN):
        ctx.fail()
    screen_image = television.get('screenImage')
    if screen_image is not None:
        if not isinstance(screen_image, dict) or set(screen_image) - {'assetId'}:
            ctx.fail()
        asset_id = screen_image.get('assetId', '')
        if not isinstance(asset_id, str) or SCREEN_IMAGE_ASSET.fullmatch(asset_id) is None:
            ctx.fail()
    validate_layout_widget(ctx, television, TELEVISION_RULES)


def _validate_speakers(ctx: ValidationContext, devices: dict) -> None:
    spec = _CollectionSpec(devices, 'speakers', SPEAKER_FIELDS)
    for speaker in _unique_layout_widgets(ctx, spec):
        if not ctx.require_text(speaker, (*WIDGET_TEXT_FIELDS, 'entityId')):
            ctx.fail()
        if not ctx.require_value(speaker, IDENTITY_FIELDS):
            ctx.fail()
        if not ctx.pattern(speaker.get('entityId', ''), TELEVISION_ENTITY):
            ctx.fail()
        validate_layout_widget(ctx, speaker, SPEAKER_RULES)


def _validate_vacuums(ctx: ValidationContext, devices: dict) -> None:
    spec = _CollectionSpec(devices, 'vacuums', VACUUM_FIELDS)
    for vacuum in _unique_layout_widgets(ctx, spec):
        _validate_vacuum(ctx, vacuum)


def _validate_vacuum(ctx: ValidationContext, vacuum: Any) -> None:
    if not ctx.require_text(vacuum, (*WIDGET_TEXT_FIELDS, 'entityId', 'deviceId', 'deviceName')):
        ctx.fail()
    if not ctx.require_value(vacuum, IDENTITY_FIELDS):
        ctx.fail()
    if not ctx.pattern(vacuum.get('entityId', ''), VACUUM_ENTITY):
        ctx.fail()
    if 'backgroundOpacity' in vacuum and not ctx.number(vacuum['backgroundOpacity'], 0, 1):
        ctx.fail()
    validate_layout_widget(ctx, vacuum, VACUUM_RULES)
    # 跟随相机独立于 focusCamera。
    ctx.validate_camera(vacuum.get('followCamera'))
    _validate_vacuum_map(ctx, vacuum.get('map', {}))
    _validate_vacuum_shortcuts(ctx, vacuum.get('shortcuts', []))
    related_entity_ids = vacuum.get('relatedEntityIds', [])
    if not isinstance(related_entity_ids, list) or any(
        not ctx.text(related_entity_id)
        or ENTITY_ID_PATTERN.fullmatch(related_entity_id) is None
        for related_entity_id in related_entity_ids
    ):
        ctx.fail()


def _validate_vacuum_map(ctx: ValidationContext, mapping: Any) -> None:
    """地图贴片：尺寸/旋转/透明度有界，实体只认相机或图片。"""
    if not isinstance(mapping, dict) or set(mapping) - VACUUM_MAP_FIELDS:
        ctx.fail()
    if 'sourceMapId' in mapping and (
        not isinstance(mapping['sourceMapId'], str)
        or not 0 < len(mapping['sourceMapId']) <= MAX_SOURCE_MAP_ID_LENGTH
    ):
        ctx.fail()
    map_entity_id = mapping.get('entityId')
    if map_entity_id and (
        not ctx.text(map_entity_id) or VACUUM_MAP_ENTITY.fullmatch(map_entity_id) is None
    ):
        ctx.fail()
    if not ctx.numbers_within(mapping, VACUUM_MAP_BOUNDS):
        ctx.fail()
    if 'visible' in mapping and not isinstance(mapping['visible'], bool):
        ctx.fail()


def _validate_vacuum_shortcuts(ctx: ValidationContext, shortcuts: Any) -> None:
    if not isinstance(shortcuts, list):
        ctx.fail()
    shortcut_ids: set = set()
    for shortcut in shortcuts:
        if not ctx.has_only(shortcut, VACUUM_SHORTCUT_FIELDS):
            ctx.fail()
        shortcut_id = shortcut.get('id')
        if not ctx.text(shortcut_id) or not shortcut_id or shortcut_id in shortcut_ids:
            ctx.fail()
        shortcut_ids.add(shortcut_id)
        if not ctx.require_text(shortcut, ('label', 'entityId')):
            ctx.fail()
        if not ctx.pattern(shortcut.get('entityId', ''), ENTITY_ID_PATTERN):
            ctx.fail()
        if not ctx.required_numbers(shortcut, (('x', -1_000_000, 1_000_000), ('y', -1_000_000, 1_000_000))):
            ctx.fail()
        if not ctx.positive_fields(shortcut, VACUUM_SHORTCUT_SIZE_FIELDS):
            ctx.fail()
        if 'height' in shortcut and not ctx.number(shortcut['height'], 0, 20):
            ctx.fail()
        if not ctx.icon(shortcut, MDI_ICON_LOOSE_PATTERN):
            ctx.fail()
        if not ctx.flag_fields(shortcut, VACUUM_SHORTCUT_FLAG_FIELDS):
            ctx.fail()
        if 'visible' in shortcut and not isinstance(shortcut['visible'], bool):
            ctx.fail()


def _validate_nas_devices(ctx: ValidationContext, devices: dict) -> None:
    spec = _CollectionSpec(devices, 'nas', NAS_FIELDS)
    for nas_device in _unique_layout_widgets(ctx, spec):
        if not ctx.require_text(nas_device, (*WIDGET_TEXT_FIELDS, 'entityId')):
            ctx.fail()
        if not ctx.require_value(nas_device, IDENTITY_FIELDS):
            ctx.fail()
        if not ctx.pattern(nas_device.get('entityId', ''), NAS_ENTITY):
            ctx.fail()
        if 'statusSource' in nas_device:
            _validate_nas_status_source(ctx, nas_device['statusSource'])
        validate_layout_widget(ctx, nas_device, NAS_RULES)


def _validate_nas_status_source(ctx: ValidationContext, status_source: Any) -> None:
    """NAS 状态源：指标实体不能重复，主实体必须是其中一个指标（或留空）。"""
    if (
        not isinstance(status_source, dict)
        or not NAS_STATUS_SOURCE_REQUIRED_FIELDS.issubset(status_source)
        or set(status_source) - NAS_STATUS_SOURCE_REQUIRED_FIELDS - NAS_STATUS_SOURCE_OPTIONAL_FIELDS
    ):
        ctx.fail()
    if (
        not ctx.text(status_source['deviceId'])
        or not status_source['deviceId']
        or not ctx.text(status_source['name'])
        or status_source['platform'] not in NAS_STATUS_SOURCE_PLATFORMS
    ):
        ctx.fail()
    primary_entity_id = status_source['primaryEntityId']
    if not isinstance(primary_entity_id, str) or (
        primary_entity_id != '' and NAS_STATUS_ENTITY.fullmatch(primary_entity_id) is None
    ):
        ctx.fail()
    metrics = status_source['metrics']
    if not isinstance(metrics, list):
        ctx.fail()
    metric_entity_ids: set[str] = set()
    for metric in metrics:
        if not isinstance(metric, dict) or set(metric) != NAS_METRIC_FIELDS:
            ctx.fail()
        metric_entity_id = metric['entityId']
        if (
            not isinstance(metric_entity_id, str)
            or NAS_STATUS_ENTITY.fullmatch(metric_entity_id) is None
            or metric_entity_id in metric_entity_ids
        ):
            ctx.fail()
        metric_entity_ids.add(metric_entity_id)
        if (
            not ctx.text(metric['label'])
            or metric['group'] not in NAS_METRIC_GROUPS
            or metric['kind'] not in NAS_METRIC_KINDS
        ):
            ctx.fail()
    if (metric_entity_ids and primary_entity_id not in metric_entity_ids) or (
        not metric_entity_ids and primary_entity_id != ''
    ):
        ctx.fail()
    if 'visibleMetrics' in status_source:
        visible_metrics = status_source['visibleMetrics']
        if (
            not isinstance(visible_metrics, list)
            or any(
                not isinstance(visible_entity_id, str) or visible_entity_id not in metric_entity_ids
                for visible_entity_id in visible_metrics
            )
            or len(set(visible_metrics)) != len(visible_metrics)
        ):
            ctx.fail()
    if 'groupOrder' in status_source:
        group_order = status_source['groupOrder']
        if (
            not isinstance(group_order, list)
            or len(group_order) > len(NAS_METRIC_GROUPS)
            or any(
                not isinstance(group, str) or group not in NAS_METRIC_GROUPS for group in group_order
            )
            or len(set(group_order)) != len(group_order)
        ):
            ctx.fail()
