"""Device-owned popup configuration, with no inferred primary entity."""
# [补充说明] 通用设备的弹窗配置契约：冰箱 / 洗碗机 / 洗衣机 / 烘干机 / 绿植。
#
# 这五类设备的共同点是「实体不由控件自己推导」：控件只记录它绑定到哪台设备
# （deviceId / deviceName），弹窗要显示什么由那台设备名下有哪些实体决定。
# 因此校验里最硬的一条是 **不接受 entityId** —— 一旦控件自己存了主实体，
# 就又回到了「按实体推导设备」的老路，取不到设备的其它实体。
#
# 状态灯规则（statusRules）与附加功能（extraControls）是弹窗的两块可选内容，
# 两块都给空也能保存（此时 deviceId 仍然必填，因为弹窗需要它去取实体）。
import math
import re

from fastapi import HTTPException

from .purifier import EXTRA_TYPES

# 设备类型 -> 它在 properties 里的集合名、在户型图里的模型类型、以及给用户看的名字。
# model_types 只有多型号的设备（小汽车）才写，缺省时只认 model_type 本身。
DEVICE_PROFILES = {
    'smallcar': {'collection': 'cars', 'model_type': 'smallcar', 'model_types': ('smallcar', 'suv', 'scooter'), 'label': '汽车'},
    'fridge': {'collection': 'fridges', 'model_type': 'fridge', 'label': '冰箱'},
    'dishwasher': {'collection': 'dishwashers', 'model_type': 'dishwasher', 'label': '洗碗机'},
    'washer': {'collection': 'washers', 'model_type': 'washer', 'label': '洗衣机'},
    'dryer': {'collection': 'dryers', 'model_type': 'dryer', 'label': '烘干机'},
    'plant': {'collection': 'plants', 'model_type': 'plant', 'label': '绿植'},
}

# properties['devices'] 里这些集合的校验方式完全一致，只是模型类型不同；
# 顶层白名单与校验循环都从这里派生，避免新增设备时漏改某一处。
GENERIC_DEVICE_COLLECTIONS = tuple(
    profile['collection'] for profile in DEVICE_PROFILES.values()
)


def validate_device_status_rules(rules, fail):
    """Shared indicator contract for appliances, including water heaters."""
    if not isinstance(rules, dict) or set(rules) - {'power', 'health'}:
        fail()
    # statusRules 只有两种：power（单个规则）与 health（规则列表）；
    # health 是空调/空气净化器那种多指标设备用的。
    values = []
    for key, value in rules.items():
        if key == 'health' and isinstance(value, list):
            values.extend(value)
            continue
        values.append(value)
    for rule in values:
        if (
            not isinstance(rule, dict)
            or set(rule) != {'active', 'entityId', 'inactive'}
            or not isinstance(rule['entityId'], str)
            or not re.fullmatch('[a-z_]+\\.[a-z0-9_]+', rule['entityId'])
        ):
            fail()
        # 两端状态值都要有且不同：相同的两个值永远匹配不上，属于配置错误。
        if any(not isinstance(rule[k], str) or not rule[k].strip() or len(rule[k]) > 120 for k in ('active', 'inactive')) or rule['active'] == rule['inactive']:
            fail()


def validate_device_bindings(items, validate_camera, model_type='fridge'):
    # [补充说明] 校验某一类通用设备的绑定表。
    #
    # 参数:
    # validate_camera: 来自 config 的相机参数校验器（聚焦视角是共用结构）。
    # model_type: DEVICE_PROFILES 的键，用于取报错文案。
    # 异常:
    # HTTPException: 422，任一字段非法。
    device_label = DEVICE_PROFILES[model_type]['label']

    def fail():
        raise HTTPException(422, detail=f'{device_label}设备配置无效，请检查实体、布局和状态灯规则。')

    def text(value, limit=128):
        return isinstance(value, str) and len(value) <= limit

    def entity(value):
        return isinstance(value, str) and re.fullmatch('[a-z_]+\\.[a-z0-9_]+', value)

    if not isinstance(items, list):
        fail()
    ids, models = set(), set()
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
        'deviceId',
        'entityId',
        'iconSize',
        'deviceName',
        'clickAction',
        'focusCamera',
        'statusRules',
        'buttonHidden',
        'extraControls',
        'hiddenClickable',
    }
    # 小汽车比其它设备多一组卡片外观字段与充电状态。
    if model_type == 'smallcar':
        fields |= {
            'cardScale',
            'cardWidth',
            'cardOpacity',
            'cardFontSize',
            'chargingStates',
            'batteryEntityId',
            'chargingEntityId',
        }
    for item in items:
        if not isinstance(item, dict) or set(item) - fields:
            fail()
        # 小汽车的照片卡片：电池/充电实体必须是对应域里的实体，且归属同一台设备；
        # 卡片缩放等数值必须有界，否则卡片会大到盖住整张户型图。
        if model_type == 'smallcar':
            for key, domains in (('batteryEntityId', ('sensor',)), ('chargingEntityId', ('binary_sensor', 'sensor'))):
                value = item.get(key, '')
                if value and (not entity(value) or value.split('.')[0] not in domains or not item.get('deviceId')):
                    fail()
                if not isinstance(value, str):
                    fail()
            for key, low, high in (
                ('cardScale', 0.5, 3),
                ('cardOpacity', 0, 1),
                ('cardWidth', 100, 600),
                ('cardFontSize', 9, 24),
            ):
                if key not in item:
                    continue
                if type(item[key]) not in (int, float) or not math.isfinite(item[key]) or not low <= item[key] <= high:
                    fail()
            if 'chargingStates' in item:
                mapping = item['chargingStates']
                # 两个状态文案都要有、要干净（不能是多行或 unknown 之类的占位），且不能相同。
                if (
                    not isinstance(mapping, dict)
                    or set(mapping) != {'active', 'inactive'}
                    or any(
                        not text(mapping.get(k), 120)
                        or not mapping[k].strip()
                        or '\n' in mapping[k]
                        or '\r' in mapping[k]
                        or mapping[k].strip().lower() in ('unknown', 'unavailable', 'none', 'null')
                        for k in ('active', 'inactive')
                    )
                    or mapping['active'].strip() == mapping['inactive'].strip()
                ):
                    fail()
        # 设备名与设备 ID 都要有：前者是面板标题，后者是取实体的唯一线索。
        # 控件自己不许存主实体 —— 见模块文档：主实体由设备归属反查。
        if any(not text(item.get(k, '')) for k in ('id', 'floorId', 'modelId', 'deviceId', 'deviceName', 'label')):
            fail()
        if any(not item.get(k) for k in ('id', 'floorId', 'modelId')) or item.get('entityId'):
            fail()
        model = (item['floorId'], item['modelId'])
        if item['id'] in ids or model in models:
            fail()
        ids.add(item['id'])
        models.add(model)
        for key, low, high in (
            ('x', -1000000, 1000000),
            ('y', -1000000, 1000000),
            ('height', 0, 20),
            ('size', 1e-06, 1000000),
            ('iconSize', 1e-06, 1000000),
            ('hitSize', 1e-06, 1000000),
        ):
            if key not in item:
                continue
            if type(item[key]) not in (int, float) or not math.isfinite(item[key]) or not low <= item[key] <= high:
                fail()
        if any(k in item and type(item[k]) is not bool for k in ('visible', 'hiddenClickable', 'buttonHidden')):
            fail()
        if item.get('clickAction', 'focus-panel') not in ('focus', 'focus-panel', 'panel'):
            fail()
        if 'icon' in item and (not text(item['icon']) or not re.fullmatch('mdi:[a-z0-9-]{1,120}', item['icon'])):
            fail()
        validate_camera(item.get('focusCamera'))
        extras = item.get('extraControls', [])
        rules = item.get('statusRules', { })
        if (
            not isinstance(extras, list)
            or len(extras) > 12
            or not isinstance(rules, dict)
            or set(rules) - {'power', 'health'}
        ):
            fail()
        # 配了弹窗内容就必须有设备可查；没配内容时 deviceId 仍然必填（上面已校验），
        # 这条只是把「有规则必须有归属」写成显式约束，避免以后放宽 deviceId 时漏掉。
        if (extras or rules) and not item.get('deviceId'):
            fail()
        selected = set()
        for extra in extras:
            if (
                not isinstance(extra, dict)
                or set(extra) - {'rows', 'type', 'label', 'columns', 'entityId'}
                or not entity(extra.get('entityId'))
            ):
                fail()
            eid = extra['entityId']
            # 同一个实体只能配一次；type 必须与域的默认能力一致（前端下拉里也是这么限定的），
            # 否则会出现「按钮渲染成开关」这类前后端不一致。
            # 例外：fan.* 如果没有在 EXTRA_TYPES 里登记，按单键开关（state）处理。
            if (
                eid in selected
                or (
                    extra.get('type') != EXTRA_TYPES.get(eid.split('.')[0], 'state')
                    and not (eid.startswith('fan.') and extra.get('type') == 'state')
                )
                or not text(extra.get('label', ''), 120)
            ):
                fail()
            selected.add(eid)
            for key, allowed in (('columns', (1, 2, 3, 4)), ('rows', (1, 2))):
                if key not in extra:
                    continue
                if type(extra[key]) is not int or extra[key] not in allowed:
                    fail()
        validate_device_status_rules(rules, fail)


def require_device_model(binding, scene, model_type='fridge'):
    # [补充说明] 确认绑定的模型仍在当前户型里，否则拒绝（模型被删掉后控件不该继续静默工作）。
    #
    # 异常:
    # HTTPException: 409，模型已移除或类型已改变。
    floor = next(
        (f for f in scene.get('floors', []) if f.get('id') == binding.get('floorId')),
        { },
    )
    models = [
        m
        for m in floor.get('scene', { }).get('items', [])
        if m.get('id') == binding.get('modelId')
    ]
    profile = DEVICE_PROFILES[model_type]
    if len(models) != 1 or models[0].get('type') not in profile.get('model_types', (profile['model_type'],)):
        raise HTTPException(409, detail=f"{profile['label']}模型已移除，请在设备配置中重新选择。")
