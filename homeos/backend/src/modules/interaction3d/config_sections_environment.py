"""environment 分区校验：空调/衣架/风扇/净化器/热水器/窗帘/温湿度/窗帘分组。"""

from __future__ import annotations

import re

from .config_ctx import (
    ValidationContext,
    validate_appliance_extras,
)


def validate_environment_section(ctx: ValidationContext, properties: dict) -> None:
    """environment 分区校验：空调/衣架/风扇/净化器/热水器/窗帘/温湿度/窗帘分组；不合规处直接经 ``ctx.fail()`` 抛 422。"""

    environment = properties.get('environment', {})
    if not isinstance(environment, dict) or set(environment) - {
        'curtains',
        'dimStrength',
        'airConditioners',
        'airPurifiers',
        'curtainGroups',
        'temperatureHumidity',
        'fans',
        'airers',
        'waterHeaters'}:
        ctx.fail()
    if not ctx.number(environment.get('dimStrength', 70), 0, 100):
        ctx.fail()
    air_conditioners = environment.get('airConditioners', [])
    if not isinstance(air_conditioners, list):
        ctx.fail()
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
            'hiddenClickable',
            'deviceId',
            'deviceName',
            'climateType',
            'extraControls',
            'bathEffects'}
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
        if item.get('climateType', 'air-conditioner') not in ('air-conditioner', 'bath-heater'):
            ctx.fail()
        if any(not ctx.text(item.get(key, '')) for key in ('deviceId', 'deviceName')):
            ctx.fail()
        pattern = '(climate|fan)\\.[a-z0-9_]+' if item.get('climateType') == 'bath-heater' else 'climate\\.[a-z0-9_]+'
        if entity and not re.fullmatch(pattern, entity):
            ctx.fail()
        if any(key in item and not ctx.number(item[key], low, high) for key, low, high in (('x', -1000000, 1000000), ('y', -1000000, 1000000), ('height', 0, 20))):
            ctx.fail()
        if any(key in item and not ctx.positive_number(item[key]) for key in ('size', 'iconSize', 'hitSize')):
            ctx.fail()
        if any(key in item and not isinstance(item[key], bool) for key in ('visible', 'hiddenClickable', 'buttonHidden', 'motionEnabled', 'funMessages')):
            ctx.fail()
        if item.get('clickAction', 'focus') not in ('focus', 'turn-on-focus', 'turn-on', 'turn-on-panel'):
            ctx.fail()
        if 'icon' in item and (not isinstance(item['icon'], str) or not re.fullmatch('mdi:[a-z0-9][a-z0-9-]{0,119}', item['icon'])):
            ctx.fail()
        validate_appliance_extras(item, entity, ctx.fail)
        rules = item.get('bathEffects', [])
        if not isinstance(rules, list) or len(rules) > 12:
            ctx.fail()
        sources = {entity, *(extra['entityId'] for extra in item.get('extraControls', []))} - {''}
        for rule in rules:
            if (
                not isinstance(rule, dict)
                or set(rule) != {'value', 'effect', 'entityId', 'attribute'}
                or rule.get('entityId') not in sources
                or rule['entityId'].split('.')[0] in {'event', 'button', 'input_button'}
                or rule.get('effect') not in {'fan', 'heat', 'light', 'exhaust'}
                or not ctx.text(rule.get('attribute'))
                or not ctx.text(rule.get('value'))
                or not rule['value']
            ):
                ctx.fail()
        ctx.validate_camera(item.get('focusCamera'))
    for collection, domain in (('airers', 'cover'), ('fans', 'fan'), ('airPurifiers', 'fan'), ('waterHeaters', 'water_heater')):
        appliances = environment.get(collection, [])
        if not isinstance(appliances, list):
            ctx.fail()
        ids = set()
        models = set()
        for item in appliances:
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
                'extraControls',
                'hiddenClickable'}
            if collection == 'airers':
                # 0.7.2：positionReversed / liftReversed / animationReversed / travelSeconds
                # 兼容旧 HomeOS positionInverted / commandInverted → 规范化为官方字段
                if 'positionReversed' not in item and item.get('positionInverted') is True:
                    item['positionReversed'] = True
                if 'liftReversed' not in item and item.get('commandInverted') is True:
                    item['liftReversed'] = True
                item.pop('positionInverted', None)
                item.pop('commandInverted', None)
                fields.update({
                    'travelSeconds',
                    'animationReversed',
                    'positionReversed',
                    'liftReversed',
                })
                if 'travelSeconds' in item and not ctx.number(item['travelSeconds'], 5, 180):
                    ctx.fail()
                for flag in ('animationReversed', 'positionReversed', 'liftReversed'):
                    if flag in item and not isinstance(item[flag], bool):
                        ctx.fail()
            if collection == 'fans':
                # 0.7.2：吊扇/塔扇可绑独立风速、方向、运行实体；可绑设备与反转状态
                fields.update({
                    'speedEntityId',
                    'directionEntityId',
                    'runEntityId',
                    'visualMode',
                    'reverseState',
                    'deviceId',
                    'deviceName',
                })
            if collection == 'waterHeaters':
                fields.update({'deviceId', 'deviceName', 'statusRules', 'workingState'})
            if collection == 'airPurifiers':
                fields.update({'deviceId', 'deviceName', 'airflowEntityId'})
            if not isinstance(item, dict) or set(item) - fields:
                ctx.fail()
            # 风扇主实体选填：有 deviceId 时允许空 entityId（纯自定义附加功能驱动动画）
            required_text = ['id', 'floorId', 'modelId', 'label']
            if collection != 'fans' or not ctx.text(item.get('deviceId', '')):
                required_text.append('entityId')
            if any(not ctx.text(item.get(key, '')) for key in required_text):
                ctx.fail()
            if any(not item.get(key) for key in ('id', 'floorId', 'modelId')):
                ctx.fail()
            model = (item['floorId'], item['modelId'])
            if item['id'] in ids or model in models:
                ctx.fail()
            ids.add(item['id'])
            models.add(model)
            entity = item.get('entityId', '')
            if collection == 'fans':
                if entity and not re.fullmatch(
                    '(?:fan|switch|input_boolean|binary_sensor)\\.[a-z0-9_]+', entity
                ):
                    ctx.fail()
                for key, pattern in (
                    ('speedEntityId', '(?:input_number|number|fan)\\.[a-z0-9_]+'),
                    (
                        'directionEntityId',
                        '(?:input_select|select|fan|switch|input_boolean)\\.[a-z0-9_]+',
                    ),
                    ('runEntityId', '(?:fan|switch|input_boolean|binary_sensor)\\.[a-z0-9_]+'),
                ):
                    value = item.get(key, '')
                    if value and not re.fullmatch(pattern, value):
                        ctx.fail()
                if item.get('visualMode', 'tower') not in {'tower', 'ceiling'}:
                    ctx.fail()
                reverse_state = item.get('reverseState', '')
                if reverse_state and (
                    not isinstance(reverse_state, str)
                    or not reverse_state.strip()
                    or len(reverse_state) > 120
                ):
                    ctx.fail()
                if any(not ctx.text(item.get(key, '')) for key in ('deviceId', 'deviceName')):
                    # deviceId/deviceName 成对出现；仅填一个时拒绝
                    if bool(item.get('deviceId')) != bool(item.get('deviceName')):
                        ctx.fail()
            elif entity and not re.fullmatch(f'{domain}\\.[a-z0-9_]+', entity):
                ctx.fail()
            if collection == 'waterHeaters':
                from .device import validate_device_status_rules

                if any(not ctx.text(item.get(key, '')) for key in ('deviceId', 'deviceName')):
                    ctx.fail()
                rules = item.get('statusRules', {})
                if rules and not entity and not item.get('deviceId'):
                    ctx.fail()
                validate_device_status_rules(rules, ctx.fail)
            rule = item.get('workingState')
            if rule is not None and (
                not isinstance(rule, dict)
                or set(rule) != {'kind', 'active', 'entityId', 'inactive'}
                or not re.fullmatch('(?:binary_sensor|sensor)\\.[a-z0-9_]+', str(rule.get('entityId', '')))
                or rule.get('kind') not in {'flow', 'burning', 'heating'}
                or any(not isinstance(rule.get(key), str) or not rule[key].strip() or len(rule[key]) > 120 for key in ('active', 'inactive'))
                or rule['active'] == rule['inactive']
            ):
                ctx.fail()
            validate_appliance_extras(item, entity, ctx.fail)
            if collection == 'airPurifiers':
                if any(not ctx.text(item.get(key, '')) for key in ('deviceId', 'deviceName', 'airflowEntityId')):
                    ctx.fail()
                airflow = item.get('airflowEntityId', '')
                if airflow and (
                    not re.fullmatch('(switch|fan|binary_sensor|input_boolean)\\.[a-z0-9_]+', airflow)
                    or airflow not in {extra['entityId'] for extra in item.get('extraControls', [])}
                ):
                    ctx.fail()
            if any(key in item and not ctx.number(item[key], low, high) for key, low, high in (('x', -1000000, 1000000), ('y', -1000000, 1000000), ('height', 0, 20))):
                ctx.fail()
            if any(key in item and not ctx.positive_number(item[key]) for key in ('size', 'iconSize', 'hitSize')):
                ctx.fail()
            if any(key in item and not isinstance(item[key], bool) for key in ('visible', 'hiddenClickable', 'buttonHidden', 'motionEnabled', 'funMessages')):
                ctx.fail()
            if item.get('clickAction', 'focus') not in (('focus', 'panel') if collection == 'airers' else ('focus', 'turn-on-focus', 'turn-on', 'turn-on-panel')):
                ctx.fail()
            if 'icon' in item and (not isinstance(item['icon'], str) or not re.fullmatch('mdi:[a-z0-9][a-z0-9-]{0,119}', item['icon'])):
                ctx.fail()
            ctx.validate_camera(item.get('focusCamera'))
    curtains = environment.get('curtains', [])
    if not isinstance(curtains, list):
        ctx.fail()
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
            'curtainFabricOverride',
            'coverDirection',
            'hiddenClickable',
            'unboundPosition',
            'iconStateReversed'}
        if not isinstance(item, dict) or set(item) - fields:
            ctx.fail()
        if any(not ctx.text(item.get(key, '')) for key in ('id', 'floorId', 'modelId', 'entityId', 'label')):
            ctx.fail()
        if not item.get('id') or item['id'] in ids:
            ctx.fail()
        ids.add(item['id'])
        model = (item.get('floorId', ''), item.get('modelId', ''))
        if all(model):
            if model in models:
                ctx.fail()
            models.add(model)
        entity = item.get('entityId', '')
        if entity and not re.fullmatch('cover\\.[a-z0-9_]+', entity):
            ctx.fail()
        if any(key in item and not ctx.positive_number(item[key]) for key in ('size', 'iconSize', 'hitSize')):
            ctx.fail()
        if any(key in item and not isinstance(item[key], bool) for key in ('visible', 'hiddenClickable', 'buttonHidden', 'motionEnabled', 'funMessages')):
            ctx.fail()
        if item.get('clickAction', 'focus') not in ('focus', 'panel', 'turn-on-focus', 'turn-on', 'turn-on-panel'):
            ctx.fail()
        if any(key in item and not ctx.number(item[key], low, high) for key, low, high in (('x', -1000000, 1000000), ('y', -1000000, 1000000), ('height', 0, 20))):
            ctx.fail()
        if item.get('coverDirection', 'auto') not in ('auto', 'left', 'right', 'split'):
            ctx.fail()
        if item.get('coverKind', 'standard') not in ('standard', 'dream', 'roller'):
            ctx.fail()
        if item.get('curtainFabric', 'cloth') not in ('cloth', 'sheer'):
            ctx.fail()
        if 'coverKindOverride' in item and not isinstance(item['coverKindOverride'], bool):
            ctx.fail()
        if 'curtainFabricOverride' in item and not isinstance(item['curtainFabricOverride'], bool):
            ctx.fail()
        if 'unboundPosition' in item and not ctx.number(item['unboundPosition'], 0, 100):
            ctx.fail()
        if 'iconStateReversed' in item and not isinstance(item['iconStateReversed'], bool):
            ctx.fail()
        if 'icon' in item and (not isinstance(item['icon'], str) or not re.fullmatch('mdi:[a-z0-9][a-z0-9-]{0,119}', item['icon'])):
            ctx.fail()
        ctx.validate_camera(item.get('focusCamera'))
    climate_sensors = environment.get('temperatureHumidity', [])
    if not isinstance(climate_sensors, list):
        ctx.fail()
    sensor_ids = set()
    for item in climate_sensors:
        fields = {
            'x',
            'y',
            'id',
            'label',
            'floorId',
            'height',
            'columns',
            'size',
            'visible',
            'showMetricNames',
            'opacity',
            'iconSize',
            'hitSize',
            'temperatureEntityId',
            'humidityEntityId',
            'formaldehydeEntityId',
            'pm25EntityId',
            'pm10EntityId',
            'co2EntityId',
            'tvocEntityId',
            'aqiEntityId',
            'illuminanceEntityId',
            'batteryEntityId',
            # 环境信息框尺寸默认值的兼容标记：字段本身已无读写方，但现存草稿里仍带着它，
            # 白名单里删掉会让这些控件保存时整份 422。
            'sizingVersion'}
        if not isinstance(item, dict) or set(item) - fields or not all(ctx.text(item.get(key, '')) for key in ('id', 'floorId', 'label')):
            ctx.fail()
        if not item.get('id') or not item.get('floorId') or item['id'] in sensor_ids:
            ctx.fail()
        sensor_ids.add(item['id'])
        for key in ('temperatureEntityId', 'humidityEntityId', 'formaldehydeEntityId', 'pm25EntityId', 'pm10EntityId', 'co2EntityId', 'tvocEntityId', 'aqiEntityId', 'illuminanceEntityId', 'batteryEntityId'):
            if key not in item:
                continue
            if not isinstance(item[key], str):
                ctx.fail()
            if not item[key]:
                continue
            if not re.fullmatch('sensor\\.[a-z0-9_]+', item[key]):
                ctx.fail()
        if any(key in item and not ctx.positive_number(item[key]) for key in ('size', 'iconSize', 'hitSize')):
            ctx.fail()
        if any(key in item and not ctx.number(item[key], low, high) for key, low, high in (('x', -1000000, 1000000), ('y', -1000000, 1000000), ('height', 0, 20))):
            ctx.fail()
        if any(key in item and not isinstance(item[key], bool) for key in ('visible', 'showMetricNames')):
            ctx.fail()
        if 'columns' in item and (type(item['columns']) is not int or not 0 <= item['columns'] <= 4):
            ctx.fail()
        if 'opacity' in item and not ctx.number(item['opacity'], 0, 1):
            ctx.fail()
        # sizingVersion 只要求正整数，不枚举具体版本：前端再加档默认值不必连带发后端。
        if 'sizingVersion' in item and (type(item['sizingVersion']) is not int or not 1 <= item['sizingVersion'] <= 1000):
            ctx.fail()
    groups = environment.get('curtainGroups', [])
    if not isinstance(groups, list):
        ctx.fail()
    group_ids = set()
    used_members = set()
    curtain_ids = {item.get('id') for item in curtains}
    for group in groups:
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
        if not isinstance(group, dict) or set(group) - fields:
            ctx.fail()
        if not ctx.text(group.get('id')) or not group['id'] or group['id'] in group_ids:
            ctx.fail()
        group_ids.add(group['id'])
        if not ctx.text(group.get('label', '')):
            ctx.fail()
        members = group.get('memberIds')
        if (
            not isinstance(members, list)
            or len(members) != 2
            or any(not isinstance(value, str) or not value for value in members)
            or len(set(members)) != 2
        ):
            ctx.fail()
        if any(member not in curtain_ids or member in used_members for member in members):
            ctx.fail()
        used_members.update(members)
        if not ctx.text(group.get('floorId')) or not group['floorId']:
            ctx.fail()
        member_items = [item for item in curtains if item.get('id') in members]
        if (
            len(member_items) != 2
            or any(item.get('floorId') != group['floorId'] for item in member_items)
            or any(item.get('coverKind') == 'dream' for item in member_items)
        ):
            ctx.fail()
        if group['floorId'] == 'all' or f'curtain-group:{group["id"]}' in curtain_ids:
            ctx.fail()
        if member_items[0].get('entityId') and member_items[0].get('entityId') == member_items[1].get('entityId'):
            ctx.fail()
        if group.get('clickAction', 'focus') not in ('focus', 'panel', 'turn-on-focus', 'turn-on', 'turn-on-panel'):
            ctx.fail()
        if group.get('panelLayout', 'horizontal') not in ('horizontal', 'vertical'):
            ctx.fail()
        if any(key in group and not isinstance(group[key], bool) for key in ('visible', 'hiddenClickable', 'buttonHidden')):
            ctx.fail()
        if any(key in group and not ctx.positive_number(group[key]) for key in ('size', 'iconSize', 'hitSize')):
            ctx.fail()
        if any(key in group and not ctx.number(group[key], low, high) for key, low, high in (('x', -1000000, 1000000), ('y', -1000000, 1000000), ('height', 0, 20))):
            ctx.fail()
        ctx.validate_camera(group.get('focusCamera'))
