"""devices 分区校验：电视、音箱、扫地机、NAS。"""

from __future__ import annotations

import re

from .config_ctx import (
    ValidationContext,
)
from .device import DEVICE_PROFILES, GENERIC_DEVICE_COLLECTIONS, validate_device_bindings


def validate_devices_section(ctx: ValidationContext, properties: dict) -> None:
    """devices 分区校验：电视、音箱、扫地机、NAS；不合规处直接经 ``ctx.fail()`` 抛 422。"""


    devices = properties.get('devices', {})
    if not isinstance(devices, dict) or set(devices) - {
        'nas',
        'televisions',
        'speakers',
        'vacuums',
        *GENERIC_DEVICE_COLLECTIONS}:
        ctx.fail()
    for profile in DEVICE_PROFILES.values():
        validate_device_bindings(
            devices.get(profile['collection'], []),
            ctx.validate_camera,
            model_type=profile['model_type'])
    televisions = devices.get('televisions', [])
    if not isinstance(televisions, list):
        ctx.fail()
    tv_ids = set()
    tv_models = set()
    for item in televisions:
        # 兼容旧 HomeOS posterAssetId → 0.7.2 screenImage
        if not isinstance(item, dict):
            ctx.fail()
        poster_legacy = item.get('posterAssetId', '')
        if isinstance(poster_legacy, str) and poster_legacy and 'screenImage' not in item:
            bare = poster_legacy.removeprefix('user:').lower()
            if re.fullmatch('[0-9a-f]{32}', bare):
                item['screenImage'] = {'assetId': 'user:' + bare}
        item.pop('posterAssetId', None)
        fields = {
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
            'screenImage'}
        if set(item) - fields:
            ctx.fail()
        # 0.7.2：powerEntityId 可选；不单独绑定时跟随 media_player
        if any(not ctx.text(item.get(key, '')) for key in ('id', 'floorId', 'modelId', 'entityId', 'label')):
            ctx.fail()
        if any(not item.get(key) for key in ('id', 'floorId', 'modelId')):
            ctx.fail()
        model = (item['floorId'], item['modelId'])
        if item['id'] in tv_ids or model in tv_models:
            ctx.fail()
        tv_ids.add(item['id'])
        tv_models.add(model)
        if item.get('entityId') and not re.fullmatch('media_player\\.[a-z0-9_]+', item['entityId']):
            ctx.fail()
        if item.get('powerEntityId') and not re.fullmatch('[a-z_]+\\.[a-z0-9_]+', item['powerEntityId']):
            ctx.fail()
        screen_image = item.get('screenImage')
        if screen_image is not None:
            if not isinstance(screen_image, dict) or set(screen_image) - {'assetId'}:
                ctx.fail()
            asset_id = screen_image.get('assetId', '')
            if not isinstance(asset_id, str) or not re.fullmatch('user:[0-9a-f]{32}', asset_id):
                ctx.fail()
        if any(key in item and not ctx.number(item[key], low, high) for key, low, high in (('x', -1000000, 1000000), ('y', -1000000, 1000000), ('height', 0, 20))):
            ctx.fail()
        if any(key in item and not ctx.positive_number(item[key]) for key in ('size', 'iconSize', 'hitSize')):
            ctx.fail()
        if any(key in item and not isinstance(item[key], bool) for key in ('visible', 'hiddenClickable', 'buttonHidden', 'motionEnabled', 'funMessages')):
            ctx.fail()
        if item.get('clickAction', 'focus-panel') not in ('focus', 'focus-panel', 'panel', 'turn-on-focus', 'turn-on', 'turn-on-panel'):
            ctx.fail()
        if 'icon' in item and (not isinstance(item['icon'], str) or not re.fullmatch('mdi:[a-z0-9-]{1,120}', item['icon'])):
            ctx.fail()
        ctx.validate_camera(item.get('focusCamera'))
    speakers = devices.get('speakers', [])
    if not isinstance(speakers, list):
        ctx.fail()
    speaker_ids = set()
    speaker_models = set()
    for item in speakers:
        fields = {
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
            'hiddenClickable'}
        if not isinstance(item, dict) or set(item) - fields:
            ctx.fail()
        if any(not ctx.text(item.get(key, '')) for key in ('id', 'floorId', 'modelId', 'entityId', 'label')):
            ctx.fail()
        if any(not item.get(key) for key in ('id', 'floorId', 'modelId')):
            ctx.fail()
        model = (item['floorId'], item['modelId'])
        if item['id'] in speaker_ids or model in speaker_models:
            ctx.fail()
        speaker_ids.add(item['id'])
        speaker_models.add(model)
        if item.get('entityId') and not re.fullmatch('media_player\\.[a-z0-9_]+', item['entityId']):
            ctx.fail()
        if any(key in item and not ctx.number(item[key], low, high) for key, low, high in (('x', -1000000, 1000000), ('y', -1000000, 1000000), ('height', 0, 20))):
            ctx.fail()
        if any(key in item and not ctx.positive_number(item[key]) for key in ('size', 'iconSize', 'hitSize')):
            ctx.fail()
        if any(key in item and not isinstance(item[key], bool) for key in ('visible', 'hiddenClickable', 'buttonHidden', 'motionEnabled', 'funMessages')):
            ctx.fail()
        if item.get('clickAction', 'focus-panel') not in ('focus', 'focus-panel', 'panel'):
            ctx.fail()
        if 'icon' in item and (not isinstance(item['icon'], str) or not re.fullmatch('mdi:[a-z0-9-]{1,120}', item['icon'])):
            ctx.fail()
        ctx.validate_camera(item.get('focusCamera'))
    vacuums = devices.get('vacuums', [])
    if not isinstance(vacuums, list):
        ctx.fail()
    vacuum_ids = set()
    vacuum_models = set()
    for item in vacuums:
        fields = {
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
            'backgroundOpacity'}
        if not isinstance(item, dict) or set(item) - fields:
            ctx.fail()
        if any(not ctx.text(item.get(key, '')) for key in ('id', 'floorId', 'modelId', 'entityId', 'label')):
            ctx.fail()
        if any(not item.get(key) for key in ('id', 'floorId', 'modelId')):
            ctx.fail()
        model = (item['floorId'], item['modelId'])
        if item['id'] in vacuum_ids or model in vacuum_models:
            ctx.fail()
        vacuum_ids.add(item['id'])
        vacuum_models.add(model)
        if item.get('entityId') and not re.fullmatch('vacuum\\.[a-z0-9_]+', item['entityId']):
            ctx.fail()
        if any(key in item and not ctx.number(item[key], low, high) for key, low, high in (('x', -1000000, 1000000), ('y', -1000000, 1000000), ('height', 0, 20))):
            ctx.fail()
        if any(key in item and not ctx.positive_number(item[key]) for key in ('size', 'iconSize', 'hitSize')):
            ctx.fail()
        if any(key in item and not isinstance(item[key], bool) for key in ('visible', 'hiddenClickable', 'buttonHidden', 'motionEnabled', 'funMessages')):
            ctx.fail()
        if item.get('clickAction', 'focus-panel') not in ('focus', 'focus-panel', 'panel'):
            ctx.fail()
        if 'icon' in item and (not isinstance(item['icon'], str) or not re.fullmatch('mdi:[a-z0-9-]{1,120}', item['icon'])):
            ctx.fail()
        ctx.validate_camera(item.get('focusCamera'))
        if 'backgroundOpacity' in item and not ctx.number(item['backgroundOpacity'], 0, 1):
            ctx.fail()
        ctx.validate_camera(item.get('followCamera'))
        mapping = item.get('map', {})
        if not isinstance(mapping, dict) or set(mapping) - {
            'x',
            'y',
            'depth',
            'width',
            'opacity',
            'visible',
            'entityId',
            'rotation',
            'sourceMapId'}:
            ctx.fail()
        if 'sourceMapId' in mapping and (not isinstance(mapping['sourceMapId'], str) or not 0 < len(mapping['sourceMapId']) <= 128):
            ctx.fail()
        if mapping.get('entityId') and (not ctx.text(mapping['entityId']) or not re.fullmatch('(?:camera|image)\\.[a-z0-9_]+', mapping['entityId'])):
            ctx.fail()
        if any(key in mapping and not ctx.number(mapping[key], low, high) for key, low, high in (('x', -1000000, 1000000), ('y', -1000000, 1000000), ('width', 0.01, 1000000), ('depth', 0.01, 1000000), ('rotation', -360, 360), ('opacity', 0, 100))):
            ctx.fail()
        if 'visible' in mapping and not isinstance(mapping['visible'], bool):
            ctx.fail()
        shortcuts = item.get('shortcuts', [])
        if not isinstance(shortcuts, list):
            ctx.fail()
        shortcut_ids = set()
        for shortcut in shortcuts:
            if not isinstance(shortcut, dict) or set(shortcut) - {
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
                'hiddenClickable'}:
                ctx.fail()
            if not ctx.text(shortcut.get('id')) or not shortcut['id'] or shortcut['id'] in shortcut_ids:
                ctx.fail()
            shortcut_ids.add(shortcut['id'])
            if not ctx.text(shortcut.get('label', '')) or not ctx.text(shortcut.get('entityId', '')):
                ctx.fail()
            if shortcut.get('entityId') and not re.fullmatch('[a-z_]+\\.[a-z0-9_]+', shortcut['entityId']):
                ctx.fail()
            if any(not ctx.number(shortcut.get(key), -1000000, 1000000) for key in ('x', 'y')):
                ctx.fail()
            if any(key in shortcut and not ctx.positive_number(shortcut[key]) for key in ('size', 'iconSize', 'hitSize', 'fontSize')):
                ctx.fail()
            if 'height' in shortcut and not ctx.number(shortcut['height'], 0, 20):
                ctx.fail()
            if 'icon' in shortcut and (not isinstance(shortcut['icon'], str) or not re.fullmatch('mdi:[a-z0-9-]{1,120}', shortcut['icon'])):
                ctx.fail()
            if any(key in shortcut and not isinstance(shortcut[key], bool) for key in ('hiddenClickable', 'buttonHidden', 'iconHidden', 'labelHidden')):
                ctx.fail()
            if 'visible' in shortcut and not isinstance(shortcut['visible'], bool):
                ctx.fail()
        if any(not ctx.text(item.get(key, '')) for key in ('deviceId', 'deviceName')):
            ctx.fail()
        related = item.get('relatedEntityIds', [])
        if not isinstance(related, list) or any(not ctx.text(entity) or not re.fullmatch('[a-z_]+\\.[a-z0-9_]+', entity) for entity in related):
            ctx.fail()
    nas = devices.get('nas', [])
    if not isinstance(nas, list):
        ctx.fail()
    ids = set()
    models = set()
    for item in nas:
        fields = {
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
            'hiddenClickable'}
        if not isinstance(item, dict) or set(item) - fields:
            ctx.fail()
        if any(not ctx.text(item.get(key, '')) for key in ('id', 'floorId', 'modelId', 'entityId', 'label')):
            ctx.fail()
        if any(not item.get(key) for key in ('id', 'floorId', 'modelId')):
            ctx.fail()
        model = (item['floorId'], item['modelId'])
        if item['id'] in ids or model in models:
            ctx.fail()
        ids.add(item['id'])
        models.add(model)
        entity = item.get('entityId', '')
        if entity and not re.fullmatch('(?:binary_sensor|switch|input_boolean)\\.[a-z0-9_]+', entity):
            ctx.fail()
        if any(key in item and not ctx.number(item[key], low, high) for key, low, high in (('x', -1000000, 1000000), ('y', -1000000, 1000000), ('height', 0, 20))):
            ctx.fail()
        if any(key in item and not ctx.positive_number(item[key]) for key in ('size', 'iconSize', 'hitSize')):
            ctx.fail()
        if any(key in item and not isinstance(item[key], bool) for key in ('visible', 'hiddenClickable', 'buttonHidden', 'motionEnabled', 'funMessages')):
            ctx.fail()
        if item.get('clickAction', 'focus') not in ('focus', 'focus-panel', 'panel'):
            ctx.fail()
        if 'statusSource' in item:
            source = item['statusSource']
            required = {
                'name',
                'metrics',
                'deviceId',
                'platform',
                'primaryEntityId'}
            if not isinstance(source, dict) or not required.issubset(source) or set(source) - required - {
                'visibleMetrics',
                'groupOrder'}:
                ctx.fail()
            if not ctx.text(source['deviceId']) or not source['deviceId'] or not ctx.text(source['name']) or source['platform'] not in ('fnos', 'synology_dsm'):
                ctx.fail()
            if not isinstance(source['primaryEntityId'], str) or (source['primaryEntityId'] != '' and not re.fullmatch('(?:sensor|binary_sensor)\\.[a-z0-9_]+', source['primaryEntityId'])):
                ctx.fail()
            if not isinstance(source['metrics'], list):
                ctx.fail()
            metric_ids = set()
            for metric in source['metrics']:
                if not isinstance(metric, dict) or set(metric) != {
                    'kind',
                    'group',
                    'label',
                    'entityId'}:
                    ctx.fail()
                entity_id = metric['entityId']
                if not isinstance(entity_id, str) or not re.fullmatch('(?:sensor|binary_sensor)\\.[a-z0-9_]+', entity_id) or entity_id in metric_ids:
                    ctx.fail()
                metric_ids.add(entity_id)
                if not ctx.text(metric['label']) or metric['group'] not in ('system', 'storage', 'network', 'health') or metric['kind'] not in ('number', 'status', 'problem', 'timestamp'):
                    ctx.fail()
            if (metric_ids and source['primaryEntityId'] not in metric_ids) or (not metric_ids and source['primaryEntityId'] != ''):
                ctx.fail()
            if 'visibleMetrics' in source:
                visible = source['visibleMetrics']
                if not isinstance(visible, list) or any(not isinstance(entity, str) or entity not in metric_ids for entity in visible) or len(set(visible)) != len(visible):
                    ctx.fail()
            if 'groupOrder' in source:
                order = source['groupOrder']
                if not isinstance(order, list) or len(order) > 4 or any(not isinstance(group, str) or group not in ('system', 'storage', 'network', 'health') for group in order) or len(set(order)) != len(order):
                    ctx.fail()
        if 'icon' in item and (not isinstance(item['icon'], str) or not re.fullmatch('mdi:[a-z0-9][a-z0-9-]{0,119}', item['icon'])):
            ctx.fail()
        ctx.validate_camera(item.get('focusCamera'))
    ctx.validate_camera(properties.get('camera'))
