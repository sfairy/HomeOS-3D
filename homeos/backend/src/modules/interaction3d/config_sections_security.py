"""security 分区校验：告警卡片、摄像头、人体感应。"""

from __future__ import annotations

import re
from itertools import pairwise

from .config_ctx import (
    ValidationContext,
)
from .lock import validate_lock_bindings
from ...domains.proxy.go2rtc_target import normalize_go2rtc_target


def validate_security_section(ctx: ValidationContext, properties: dict) -> None:
    """security 分区校验：告警卡片、摄像头、人体感应；不合规处直接经 ``ctx.fail()`` 抛 422。"""

    security = properties.get('security', {})
    if not isinstance(security, dict) or set(security) - {
        'presenceSensors',
        'cameras',
        'locks',
        'alarms'}:
        ctx.fail()

    validate_lock_bindings(security.get('locks', []), ctx.validate_camera)
    alarms = security.get('alarms', [])
    if not isinstance(alarms, list) or len(alarms) > 100:
        ctx.fail()
    alarm_ids = set()
    for item in alarms:
        # 对齐 0.7.1：独立浮动卡片字段；兼容历史 modelId / theme / workStateEntityId
        fields = {
            'id',
            'kind',
            'floorId',
            'x',
            'y',
            'height',
            'size',
            'fontSize',
            'opacity',
            'label',
            'entityId',
            'secondaryEntityId',
            'batteryEntityId',
            'visible',
            'modelId',
            'workStateEntityId',
            'theme',
            'overlay',
            'icon',
            'iconSize',
            'hitSize',
            'buttonHidden',
            'hiddenClickable',
            'focusCamera',
            'cardWidth',
        }
        if not isinstance(item, dict) or set(item) - fields:
            ctx.fail()
        if item.get('kind') not in {'moisture', 'smoke', 'gas'}:
            ctx.fail()
        if any(not ctx.text(item.get(key, '')) for key in ('id', 'floorId', 'label')):
            ctx.fail()
        if item['floorId'] == 'all' or item['id'] in alarm_ids:
            ctx.fail()
        alarm_ids.add(item['id'])
        entity = item.get('entityId', '')
        kind = item.get('kind')
        if entity:
            if kind == 'gas':
                if not re.fullmatch('(?:binary_sensor|sensor)\\.[a-z0-9_]+', entity):
                    ctx.fail()
            elif kind == 'smoke':
                # 0.7.2：binary / enum sensor / event.* 烟雾源
                if not re.fullmatch('(?:binary_sensor|sensor|event)\\.[a-z0-9_]+', entity):
                    ctx.fail()
            elif not re.fullmatch('binary_sensor\\.[a-z0-9_]+', entity):
                ctx.fail()
        secondary = item.get('secondaryEntityId', '')
        if secondary:
            if kind != 'moisture' or not re.fullmatch('binary_sensor\\.[a-z0-9_]+', secondary):
                ctx.fail()
        battery = item.get('batteryEntityId', '')
        if battery and not re.fullmatch('sensor\\.[a-z0-9_]+', battery):
            ctx.fail()
        work_state = item.get('workStateEntityId', '')
        if work_state and not re.fullmatch('(?:sensor|binary_sensor)\\.[a-z0-9_]+', work_state):
            ctx.fail()
        theme = item.get('theme', 'default')
        if theme not in {'default', 'warm-wood'}:
            ctx.fail()
        model_id = item.get('modelId', '')
        if model_id and not ctx.text(model_id):
            ctx.fail()
        if any(
            key in item and not ctx.number(item[key], low, high)
            for key, low, high in (
                ('x', -1000000, 1000000),
                ('y', -1000000, 1000000),
                ('height', 0, 20),
                ('size', 100, 600),
                ('opacity', 0, 1),
                ('cardWidth', 80, 480),
            )
        ):
            ctx.fail()
        # 字号不再设上限：放大字号是用户明确意图，夹紧只会把标签裁掉。
        if any(key in item and not ctx.positive_number(item[key]) for key in ('iconSize', 'hitSize', 'fontSize')):
            ctx.fail()
        if any(key in item and not isinstance(item[key], bool) for key in ('visible', 'overlay', 'buttonHidden', 'hiddenClickable')):
            ctx.fail()
        if 'icon' in item and (not isinstance(item['icon'], str) or not re.fullmatch('mdi:[a-z0-9][a-z0-9-]{0,119}', item['icon'])):
            ctx.fail()
        ctx.validate_camera(item.get('focusCamera'))
    cameras = security.get('cameras', [])
    if not isinstance(cameras, list):
        ctx.fail()
    camera_ids = set()
    camera_models = set()
    for item in cameras:
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
            'fontSize',
            'iconSize',
            'focusCamera',
            'buttonHidden',
            'cameraSource',
            'fit',
            'go2rtcUrl',
            'backgroundOpacity'}
        if not isinstance(item, dict) or set(item) - fields:
            ctx.fail()
        if any(not ctx.text(item.get(key)) or not item[key] for key in ('id', 'floorId', 'modelId')) or item['id'] in camera_ids or (item['floorId'], item['modelId']) in camera_models:
            ctx.fail()
        camera_ids.add(item['id'])
        camera_models.add((item['floorId'], item['modelId']))
        if item['floorId'] == 'all':
            ctx.fail()
        if not isinstance(item.get('entityId', ''), str) or (item.get('entityId') and not re.fullmatch('camera\\.[a-z0-9_]+', item['entityId'])):
            ctx.fail()
        if not ctx.text(item.get('label', '')) or not ctx.text(item.get('icon', '')):
            ctx.fail()
        # 摄像头来源：默认 HA 实体；选 go2rtc 时地址必须能通过白名单归一（据此才能反代）。
        camera_source = item.get('cameraSource', 'entity')
        if camera_source not in ('entity', 'go2rtc'):
            ctx.fail()
        # 0.7.6：摄像头弹窗画面比例，默认 contain（完整可见）；fill 为铺满裁切。
        camera_fit = item.get('fit', 'contain')
        if not isinstance(camera_fit, str) or camera_fit not in ('fill', 'contain'):
            ctx.fail()
        camera_url = item.get('go2rtcUrl', '')
        if not ctx.text(camera_url, 2048):
            ctx.fail()
        if camera_source == 'go2rtc' and camera_url.strip():
            try:
                normalize_go2rtc_target(camera_url)
            except ValueError:
                ctx.fail()
        # 字号不再设上限（1-1000 的旧上限会把放大后的标签裁掉），只要求为正数。
        for key, low, high in (('x', -1e+06, 1e+06), ('y', -1e+06, 1e+06), ('height', -1000, 1000), ('size', 1, 1000), ('iconSize', 1, 1000), ('hitSize', 1, 1000), ('backgroundOpacity', 0, 1)):
            if key not in item:
                continue
            if ctx.number(item[key], low, high):
                continue
            ctx.fail()
        if 'fontSize' in item and not ctx.positive_number(item['fontSize']):
            ctx.fail()
        if any(key in item and not isinstance(item[key], bool) for key in ('visible', 'buttonHidden')):
            ctx.fail()
        ctx.validate_camera(item.get('focusCamera'))
    people = security.get('presenceSensors', [])
    if not isinstance(people, list):
        ctx.fail()
    presence_ids = set()
    presence_models = set()
    for person in people:
        if not isinstance(person, dict) or set(person) - {
            'id',
            'size',
            'color',
            'label',
            'route',
            'speed',
            'floorId',
            'modelId',
            'deviceId',
            'entityId',
            'character',
            'waveScale',
            'deviceName',
            'hitPadding',
            'focusCamera',
            'routeClosed',
            'triggerMode',
            'waveEnabled',
            'waveOpacity',
            'clickToFocus',
            'displayPages',
            'triggerValue',
            'displayDuration',
            'triggerThreshold'}:
            ctx.fail()
        if any(not ctx.text(person.get(key, '')) for key in ('deviceId', 'deviceName')):
            ctx.fail()
        ident = person.get('id')
        if not ctx.text(ident) or not ident or ident in presence_ids:
            ctx.fail()
        presence_ids.add(ident)
        if not isinstance(person.get('waveEnabled', True), bool) or not ctx.number(person.get('waveScale', 1), 0.25, 3) or not ctx.number(person.get('waveOpacity', 68), 0, 100):
            ctx.fail()
        if not ctx.text(person.get('label', '')) or not ctx.text(person.get('floorId')) or person['floorId'] == 'all':
            ctx.fail()
        if 'modelId' in person:
            if not ctx.text(person['modelId']) or not person['modelId']:
                ctx.fail()
            model_key = (person.get('floorId'), person['modelId'])
            if model_key in presence_models:
                ctx.fail()
            presence_models.add(model_key)
        if not isinstance(person.get('entityId'), str) or (person['entityId'] and not re.fullmatch('[a-z_]+\\.[a-z0-9_]{1,200}', person['entityId'])):
            ctx.fail()
        if person.get('character', 'traveler') not in ('traveler', 'bean', 'glow') or person.get('color', 'cyan') not in ('cyan', 'orange'):
            ctx.fail()
        trigger_mode = person.get('triggerMode', 'auto')
        if trigger_mode not in ('auto', 'threshold', 'equals', 'change'):
            ctx.fail()
        if 'triggerValue' in person and (not isinstance(person['triggerValue'], str) or len(person['triggerValue']) > 128):
            ctx.fail()
        if trigger_mode == 'equals' and not str(person.get('triggerValue', 'on')).strip():
            ctx.fail()
        if 'triggerThreshold' in person and not ctx.number(person['triggerThreshold'], -1000000, 1000000):
            ctx.fail()
        event_sensor = trigger_mode in ('equals', 'change') or (trigger_mode == 'auto' and person['entityId'].startswith('event.'))
        if not ctx.number(person.get('displayDuration', 30 if event_sensor else 0), 1 if event_sensor else 0, 3600):
            ctx.fail()
        pages = person.get('displayPages', ['overview', 'light', 'security'])
        if pages != 'all' and (not isinstance(pages, list) or not 1 <= len(pages) <= 6 or any(not isinstance(page, str) or page not in ('overview', 'light', 'environment', 'devices', 'vacuum', 'security') for page in pages) or len(set(pages)) != len(pages)):
            ctx.fail()
        if not ctx.number(person.get('speed', 0.45), 0.1, 2) or not ctx.number(person.get('size', 1), 0.25, 3):
            ctx.fail()
        if not isinstance(person.get('clickToFocus', False), bool) or not ctx.number(person.get('hitPadding', 8), 0, 80):
            ctx.fail()
        ctx.validate_camera(person.get('focusCamera'))
        route = person.get('route')
        if not isinstance(person.get('routeClosed', True), bool):
            ctx.fail()
        if not isinstance(route, list) or not (0 if person.get('routeClosed') is False else 3) <= len(route) <= 128 or any(not isinstance(p, dict) or set(p) != {'x', 'y'} or not all(ctx.number(p[k], -1000000, 1000000) for k in ('x', 'y')) for p in route):
            ctx.fail()
        if person.get('routeClosed') is False:
            continue
        if len({(p['x'], p['y']) for p in route}) != len(route):
            ctx.fail()
        a = route[0]
        if not any(abs((b['x'] - a['x']) * (c['y'] - a['y']) - (b['y'] - a['y']) * (c['x'] - a['x'])) > 1e-06 for b, c in pairwise(route)):
            ctx.fail()
