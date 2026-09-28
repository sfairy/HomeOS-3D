"""3D 交互配置的域校验：摄像头 / 存在传感器 / 灯 / 环境设备各自的校验段。
"""
import itertools
import re
from typing import Callable, NoReturn


from .purifier import EXTRA_TYPES



def _validate_cameras(fail: Callable[[], NoReturn], number, security, text, validate_camera):
    fields = high = item = key = low = None
    cameras = security.get('cameras', [])
    if not isinstance(cameras, list):
        fail()
    # id 全局唯一，(floorId, modelId) 组合也唯一 —— 同一个模型上不该挂两个摄像头。
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
            'buttonHidden'}
        if not isinstance(item, dict) or set(item) - fields:
            fail()
        if any(not text(item.get(key)) or not item[key] for key in ('id', 'floorId', 'modelId')) or item['id'] in camera_ids or (item['floorId'], item['modelId']) in camera_models:
            fail()
        camera_ids.add(item['id'])
        camera_models.add((item['floorId'], item['modelId']))
        if item['floorId'] == 'all':
            fail()
        # 只接受 camera.* 域的实体：别的域放进来会渲染出取不到流的状态。
        if not isinstance(item.get('entityId', ''), str) or item.get('entityId') and not re.fullmatch('camera\\.[a-z0-9_]+', item['entityId']):
            fail()
        if not text(item.get('label', '')) or not text(item.get('icon', '')):
            fail()
        for key, low, high in (('x', -1e+06, 1e+06), ('y', -1e+06, 1e+06), ('height', -1000, 1000), ('size', 1, 1000), ('iconSize', 1, 1000), ('fontSize', 1, 1000), ('hitSize', 1, 1000)):
            if key not in item:
                continue
            if number(item[key], low, high):
                continue
            fail()
        if any(key in item and not isinstance(item[key], bool) for key in ('visible', 'buttonHidden')):
            fail()
        validate_camera(item.get('focusCamera'))
    return fields, high, item, key, low


def _validate_presence(fail: Callable[[], NoReturn], key, number, security, text, validate_camera):
    people = security.get('presenceSensors', [])
    if not isinstance(people, list):
        fail()
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
            fail()
        if any(not text(person.get(key, '')) for key in ('deviceId', 'deviceName')):
            fail()
        ident = person.get('id')
        if not text(ident) or not ident or ident in presence_ids:
            fail()
        presence_ids.add(ident)
        if not isinstance(person.get('waveEnabled', True), bool) or not number(person.get('waveScale', 1), 0.25, 3) or not number(person.get('waveOpacity', 68), 0, 100):
            fail()
        # 人形同样必须挂在具体楼层上：'all' 只是筛选条件，落不到具体楼层上。
        if not text(person.get('label', '')) or not text(person.get('floorId')) or person['floorId'] == 'all':
            fail()
        if 'modelId' in person:
            if not text(person['modelId']) or not person['modelId']:
                fail()
            model_key = (person.get('floorId'), person['modelId'])
            if model_key in presence_models:
                fail()
            presence_models.add(model_key)
        # 允许空串：人形可以先把位置摆好，实体稍后再绑；
        if not isinstance(person.get('entityId'), str) or person['entityId'] and not re.fullmatch('[a-z_]+\\.[a-z0-9_]{1,200}', person['entityId']):
            fail()
        if person.get('character', 'traveler') not in ('traveler', 'bean', 'glow') or person.get('color', 'cyan') not in ('cyan', 'orange'):
            fail()
        trigger_mode = person.get('triggerMode', 'auto')
        if trigger_mode not in ('auto', 'threshold', 'equals', 'change'):
            fail()
        if 'triggerValue' in person and (not isinstance(person['triggerValue'], str) or len(person['triggerValue']) > 128):
            fail()
        if trigger_mode == 'equals' and not str(person.get('triggerValue', 'on')).strip():
            fail()
        if 'triggerThreshold' in person and not number(person['triggerThreshold'], -1000000, 1000000):
            fail()
        # 事件类触发（equals / change，或 auto 且实体属于 event 域）才需要停留时长；
        event_sensor = trigger_mode in ('equals', 'change') or trigger_mode == 'auto' and person['entityId'].startswith('event.')
        if not number(person.get('displayDuration', 30 if event_sensor else 0), 1 if event_sensor else 0, 3600):
            fail()
        # 展示页范围：'all' 表示全部页面；给列表时要求 1~6 个、都在已知页面集合内且不重复。
        pages = person.get('displayPages', ['overview', 'light', 'security'])
        if pages != 'all' and (not isinstance(pages, list) or not 1 <= len(pages) <= 6 or any(not isinstance(page, str) or page not in ('overview', 'light', 'environment', 'devices', 'vacuum', 'security') for page in pages) or len(set(pages)) != len(pages)):
            fail()
        if not number(person.get('speed', 0.45), 0.1, 2) or not number(person.get('size', 1), 0.25, 3):
            fail()
        if not isinstance(person.get('clickToFocus', False), bool) or not number(person.get('hitPadding', 8), 0, 80):
            fail()
        validate_camera(person.get('focusCamera'))
        route = person.get('route')
        if not isinstance(person.get('routeClosed', True), bool):
            fail()
        if not isinstance(route, list) or not (0 if person.get('routeClosed') is False else 3) <= len(route) <= 128 or any(not isinstance(p, dict) or set(p) != {'x', 'y'} or not all(number(p[k], -1000000, 1000000) for k in ('x', 'y')) for p in route):
            fail()
        # 开放路径（走到终点不返回）跳过闭合性检查：重复顶点与面积要求只对环路成立。
        if person.get('routeClosed') is False:
            continue
        # 闭合路径不允许重复顶点：重复会让路径自交、动画抖动。
        if len({(p['x'], p['y']) for p in route}) != len(route):
            fail()
        a = route[0]
        # 相邻三点用 `pairwise(route[1:])`，而不是 `zip(route[1:], route[2:])`：
        if not any(abs((b['x'] - a['x']) * (c['y'] - a['y']) - (b['y'] - a['y']) * (c['x'] - a['x'])) > 1e-06 for b, c in itertools.pairwise(route[1:])):
            fail()


def _validate_lights(fail: Callable[[], NoReturn], key, number, positive_number, properties, text, validate_camera):
    entity = fields = high = low = None
    lights = properties.get('lights', [])
    if not isinstance(lights, list):
        fail()
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
            fail()
        if any(not text(light.get(key, '')) for key in ('id', 'floorId', 'groupId', 'entityId', 'label')):
            fail()
        if not light.get('id') or light['id'] in ids:
            fail()
        ids.add(light['id'])
        entity = light.get('entityId', '')
        if entity and not re.fullmatch('[a-z_]+\\.[a-z0-9_]+', entity):
            fail()
        if not all(number(light.get(key), low, high) for key, low, high in (('x', -1000000, 1000000), ('y', -1000000, 1000000), ('height', 0, 20))):
            fail()
        if not positive_number(light.get('size')):
            fail()
        if 'visible' in light and not isinstance(light['visible'], bool):
            fail()
        if any(key in light and not isinstance(light[key], bool) for key in ('hiddenClickable', 'buttonHidden')):
            fail()
        # 点击行为：focus 只聚焦；turn-on* 系列会同时开灯，turn-on-panel 还会打开面板。
        if light.get('clickAction', 'focus') not in ('focus', 'turn-on-focus', 'turn-on', 'turn-on-panel'):
            fail()
        if any(key in light and not positive_number(light[key]) for key in ('iconSize', 'hitSize')):
            fail()
        if 'icon' in light and (not isinstance(light['icon'], str) or not re.fullmatch('mdi:[a-z0-9][a-z0-9-]{0,119}', light['icon'])):
            fail()
        if 'fadeDuration' in light and not number(light['fadeDuration'], 0, 10):
            fail()
        # 默认灯光效果：亮度百分比与色温（K），不填表示不做预设。
        if 'effectDefaults' in light:
            defaults = light['effectDefaults']
            bounds = {
                'brightness': (0, 150),
                'kelvin': (1000, 20000)}
            if not isinstance(defaults, dict) or set(defaults) - set(bounds) or any(not number(value, *bounds[key]) for key, value in defaults.items()):
                fail()
        # effectRange 是该灯可调范围的显式覆盖：四个字段必须全给，且 min <= max。
        effect_range = light.get('effectRange')
        if effect_range is not None:
            fields = {
                'brightnessMax',
                'brightnessMin',
                'temperatureMax',
                'temperatureMin'}
            if not isinstance(effect_range, dict) or set(effect_range) != fields:
                fail()
            for minimum, maximum, low, high in (('brightnessMin', 'brightnessMax', 0, 150), ('temperatureMin', 'temperatureMax', 1000, 20000)):
                if not number(effect_range[minimum], low, high) or not number(effect_range[maximum], low, high) or effect_range[minimum] > effect_range[maximum]:
                    fail()
        validate_camera(light.get('focusCamera'))
    return entity, fields, high, low


def _validate_environment(fail: Callable[[], NoReturn], high, low, number, positive_number, properties, text, validate_camera):
    entity = fields = item = key = model = None
    environment = properties.get('environment', {})
    if not isinstance(environment, dict) or set(environment) - {
        'curtains',
        'dimStrength',
        'airConditioners',
        'airPurifiers',
        'curtainGroups',
        'temperatureHumidity'}:
        fail()
    # dimStrength 是环境设备通用的压暗强度（百分比），默认 70。
    if not number(environment.get('dimStrength', 70), 0, 100):
        fail()
    # 空调：entityId 只允许 climate.* 域，且 (楼层, 模型) 组合唯一。
    air_conditioners = environment.get('airConditioners', [])
    if not isinstance(air_conditioners, list):
        fail()
    ids = set()
    models = set()
    for item in air_conditioners:
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
            fail()
        if any(not text(item.get(key, '')) for key in ('id', 'floorId', 'modelId', 'entityId', 'label')):
            fail()
        if any(not item.get(key) for key in ('id', 'floorId', 'modelId')):
            fail()
        model = (item['floorId'], item['modelId'])
        if item['id'] in ids or model in models:
            fail()
        ids.add(item['id'])
        models.add(model)
        entity = item.get('entityId', '')
        if entity and not re.fullmatch('climate\\.[a-z0-9_]+', entity):
            fail()
        if any(key in item and not number(item[key], low, high) for key, low, high in (('x', -1000000, 1000000), ('y', -1000000, 1000000), ('height', 0, 20))):
            fail()
        if any(key in item and not positive_number(item[key]) for key in ('size', 'iconSize', 'hitSize')):
            fail()
        if any(key in item and not isinstance(item[key], bool) for key in ('visible', 'hiddenClickable', 'buttonHidden', 'motionEnabled', 'funMessages')):
            fail()
        if item.get('clickAction', 'focus') not in ('focus', 'turn-on-focus', 'turn-on', 'turn-on-panel'):
            fail()
        if 'icon' in item and (not isinstance(item['icon'], str) or not re.fullmatch('mdi:[a-z0-9][a-z0-9-]{0,119}', item['icon'])):
            fail()
        validate_camera(item.get('focusCamera'))
    # 空气净化器：与空调同住 environment、同样绑定场景模型，但 entityId 只允许 fan.* 域，
    air_purifiers = environment.get('airPurifiers', [])
    if not isinstance(air_purifiers, list):
        fail()
    ids = set()
    models = set()
    for item in air_purifiers:
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
            'hiddenClickable',
            'extraControls',
            'statusRules'}
        if not isinstance(item, dict) or set(item) - fields:
            fail()
        if any(not text(item.get(key, '')) for key in ('id', 'floorId', 'modelId', 'entityId', 'label')):
            fail()
        if any(not item.get(key) for key in ('id', 'floorId', 'modelId')):
            fail()
        model = (item['floorId'], item['modelId'])
        if item['id'] in ids or model in models:
            fail()
        ids.add(item['id'])
        models.add(model)
        entity = item.get('entityId', '')
        # 只接受 fan.* 域：净化器在 HA 里是 fan 实体，别的域放进来会渲染出控制不了的状态。
        if entity and not re.fullmatch('fan\\.[a-z0-9_]+', entity):
            fail()
        if any(key in item and not number(item[key], low, high) for key, low, high in (('x', -1000000, 1000000), ('y', -1000000, 1000000), ('height', 0, 20))):
            fail()
        if any(key in item and not positive_number(item[key]) for key in ('size', 'iconSize', 'hitSize')):
            fail()
        if any(key in item and not isinstance(item[key], bool) for key in ('visible', 'hiddenClickable', 'buttonHidden', 'motionEnabled', 'funMessages')):
            fail()
        if item.get('clickAction', 'focus') not in ('focus', 'turn-on-focus', 'turn-on', 'turn-on-panel'):
            fail()
        if 'icon' in item and (not isinstance(item['icon'], str) or not re.fullmatch('mdi:[a-z0-9][a-z0-9-]{0,119}', item['icon'])):
            fail()
        validate_camera(item.get('focusCamera'))
        extras = item.get('extraControls', [])
        if not isinstance(extras, list) or len(extras) > 12:
            fail()
        selected = set()
        for extra in extras:
            if (
                not isinstance(extra, dict)
                or set(extra) - {'rows', 'type', 'label', 'columns', 'entityId'}
                or not isinstance(extra.get('entityId'), str)
                or not re.fullmatch('[a-z_]+\\.[a-z0-9_]+', extra['entityId'])
            ):
                fail()
            selected_entity = extra['entityId']
            if (
                # type 只认这五种能力；允许把 select / number / switch / button 实体配成
                extra.get('type') not in {'state', 'button', 'number', 'select', 'switch'}
                or (
                    extra.get('type') != 'state'
                    and extra.get('type') != EXTRA_TYPES.get(selected_entity.split('.')[0])
                )
                or selected_entity in selected
                # 附加实体不能就是设备本体：弹窗会把同一个实体渲染两遍（一遍主状态、一遍附加卡片）。
                or selected_entity == entity
                or not text(extra.get('label', ''), 120)
            ):
                fail()
            selected.add(selected_entity)
            for key, allowed in (('columns', (1, 2, 3, 4)), ('rows', (1, 2))):
                if key not in extra:
                    continue
                if type(extra[key]) is not int or extra[key] not in allowed:
                    fail()
        # 状态灯规则：power 是单个规则，health 是同形状的单个或数组；两端状态值都要有且不同。
        rules = item.get('statusRules', {})
        if not isinstance(rules, dict) or set(rules) - {'power', 'health'}:
            fail()
        rule_values = []
        for rule_key, rule_value in rules.items():
            if rule_key == 'health' and isinstance(rule_value, list):
                rule_values.extend(rule_value)
                continue
            rule_values.append(rule_value)
        for rule in rule_values:
            if (
                not isinstance(rule, dict)
                or set(rule) != {'active', 'entityId', 'inactive'}
                or not isinstance(rule.get('entityId'), str)
                or not re.fullmatch('[a-z_]+\\.[a-z0-9_]+', rule['entityId'])
            ):
                fail()
            # 两端状态值都要有且不同：相同的两个值永远匹配不上，属于配置错误。
            if (
                any(
                    not text(rule.get(key, ''), 120) or not rule.get(key, '').strip()
                    for key in ('active', 'inactive')
                )
                or rule['active'] == rule['inactive']
            ):
                fail()
    # 窗帘：entityId 只允许 cover.* 域；coverKind 区分普通帘 / 卷帘 / 梦幻帘
    curtains = environment.get('curtains', [])
    if not isinstance(curtains, list):
        fail()
    ids = set()
    models = set()
    for item in curtains:
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
            'coverKind',
            'clickAction',
            'focusCamera',
            'buttonHidden',
            'curtainFabric',
            'coverKindOverride',
            # 帘布覆写：户型模型自带帘布时默认以模型为准，用户显式改过才置 true，
            'curtainFabricOverride',
            'coverDirection',
            'hiddenClickable',
            'unboundPosition',
            'iconStateReversed'}
        if not isinstance(item, dict) or set(item) - fields:
            fail()
        if any(not text(item.get(key, '')) for key in ('id', 'floorId', 'modelId', 'entityId', 'label')):
            fail()
        if not item.get('id') or item['id'] in ids:
            fail()
        ids.add(item['id'])
        model = (item.get('floorId', ''), item.get('modelId', ''))
        if all(model):
            if model in models:
                fail()
            models.add(model)
        entity = item.get('entityId', '')
        if entity and not re.fullmatch('cover\\.[a-z0-9_]+', entity):
            fail()
        if any(key in item and not positive_number(item[key]) for key in ('size', 'iconSize', 'hitSize')):
            fail()
        if any(key in item and not isinstance(item[key], bool) for key in ('visible', 'hiddenClickable', 'buttonHidden', 'motionEnabled', 'funMessages')):
            fail()
        if item.get('clickAction', 'focus') not in ('focus', 'panel'):
            fail()
        if any(key in item and not number(item[key], low, high) for key, low, high in (('x', -1000000, 1000000), ('y', -1000000, 1000000), ('height', 0, 20))):
            fail()
        if item.get('coverDirection', 'auto') not in ('auto', 'left', 'right', 'split'):
            fail()
        if item.get('coverKind', 'standard') not in ('standard', 'dream', 'roller'):
            fail()
        if item.get('curtainFabric', 'cloth') not in ('cloth', 'sheer'):
            fail()
        if 'coverKindOverride' in item and not isinstance(item['coverKindOverride'], bool):
            fail()
        if 'curtainFabricOverride' in item and not isinstance(item['curtainFabricOverride'], bool):
            fail()
        if 'unboundPosition' in item and not number(item['unboundPosition'], 0, 100):
            fail()
        if 'iconStateReversed' in item and not isinstance(item['iconStateReversed'], bool):
            fail()
        if 'icon' in item and (not isinstance(item['icon'], str) or not re.fullmatch('mdi:[a-z0-9][a-z0-9-]{0,119}', item['icon'])):
            fail()
        validate_camera(item.get('focusCamera'))
    # 温湿度计：一块不绑定场景模型的信息卡，用 x / y 定位，两路实体分别指向温度与湿度传感器。
    meters = environment.get('temperatureHumidity', [])
    if not isinstance(meters, list):
        fail()
    ids = set()
    for item in meters:
        fields = {
            'x',
            'y',
            'id',
            'label',
            'floorId',
            'height',
            'size',
            'visible',
            'iconSize',
            'hitSize',
            'temperatureEntityId',
            'humidityEntityId'}
        if not isinstance(item, dict) or set(item) - fields:
            fail()
        if any(not text(item.get(key, '')) for key in ('id', 'floorId', 'label')):
            fail()
        # 'all' 是「全部楼层」的伪楼层：信息卡必须落在具体楼层上才能投影定位。
        if not item.get('id') or not item.get('floorId') or item['floorId'] == 'all' or item['id'] in ids:
            fail()
        ids.add(item['id'])
        # 两路实体都允许先留空（先把卡片摆好，实体稍后再绑）；一旦填了就必须是 sensor.* 域，
        for key in ('temperatureEntityId', 'humidityEntityId'):
            entity = item.get(key, '')
            if not isinstance(entity, str) or entity and not re.fullmatch('sensor\\.[a-z0-9_]+', entity):
                fail()
        if any(key in item and not number(item[key], low, high) for key, low, high in (('x', -1000000, 1000000), ('y', -1000000, 1000000))):
            fail()
        if 'height' in item and not number(item['height'], 0, 20):
            fail()
        if any(key in item and not positive_number(item[key]) for key in ('size', 'iconSize', 'hitSize')):
            fail()
        if 'visible' in item and not isinstance(item['visible'], bool):
            fail()
    # 窗帘组合（一拖多）：同一楼层两副普通窗帘并成一个整体控制，典型场景是双层帘。
    curtain_groups = environment.get('curtainGroups', [])
    if not isinstance(curtain_groups, list):
        fail()
    curtain_by_id = {item.get('id'): item for item in curtains if isinstance(item, dict)}
    group_ids = set()
    grouped_member_ids = set()
    for item in curtain_groups:
        fields = {
            'x',
            'y',
            'id',
            'size',
            'label',
            'height',
            'floorId',
            'hitSize',
            'iconSize',
            'memberIds',
            'visible',
            'clickAction',
            'focusCamera',
            'panelLayout',
            'buttonHidden',
            'hiddenClickable'}
        if not isinstance(item, dict) or set(item) - fields:
            fail()
        if any(not text(item.get(key, '')) for key in ('id', 'floorId', 'label')):
            fail()
        if not item.get('id') or item['id'] in group_ids:
            fail()
        group_ids.add(item['id'])
        # 组合必须落在具体楼层上：成员要求同楼层，'all' 这种伪楼层无法与任何成员对齐。
        if not item.get('floorId') or item['floorId'] == 'all':
            fail()
        member_ids = item.get('memberIds')
        # 恰好两名成员，且不能是同一张配置项 —— 一拖一的「组合」没有存在意义。
        if (
            not isinstance(member_ids, list)
            or len(member_ids) != 2
            or not all(isinstance(member_id, str) and member_id for member_id in member_ids)
            or member_ids[0] == member_ids[1]
        ):
            fail()
        members = [curtain_by_id.get(member_id) for member_id in member_ids]
        # 成员必须存在、同楼层、非梦幻帘、未被别的组合占用，且两副帘不是同一个实体。
        if any(
            member is None
            or member.get('floorId') != item['floorId']
            or member.get('coverKind') == 'dream'
            or member.get('id') in grouped_member_ids
            for member in members
        ):
            fail()
        # any(...) 检查已保证两副帘都非 None（comprehension 无法窄化列表元素，需显式断言）。
        assert members[0] is not None and members[1] is not None
        if members[0].get('entityId') and members[0].get('entityId') == members[1].get('entityId'):
            fail()
        if f'curtain-group:{item["id"]}' in curtain_by_id:
            fail()
        grouped_member_ids.update(member_ids)
        if item.get('clickAction', 'focus') not in ('focus', 'panel'):
            fail()
        # 弹窗布局：左右并排是缺省，上下布局用于成员面板较高的场景（组合面板据此加高）。
        if item.get('panelLayout', 'horizontal') not in ('horizontal', 'vertical'):
            fail()
        if any(key in item and not isinstance(item[key], bool) for key in ('visible', 'hiddenClickable', 'buttonHidden')):
            fail()
        if any(key in item and not positive_number(item[key]) for key in ('size', 'iconSize', 'hitSize')):
            fail()
        if any(key in item and not number(item[key], low, high) for key, low, high in (('x', -1000000, 1000000), ('y', -1000000, 1000000), ('height', 0, 20))):
            fail()
        validate_camera(item.get('focusCamera'))
    return entity, fields, item, key, model
