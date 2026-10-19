"""由设备自身拥有的弹窗配置，不推断主实体。

本模块有两类使用者：

- :func:`validate_device_bindings`：家电（汽车 / 冰箱 / 打印机 / 净水器 / 电脑 …）
  的集合校验，白名单按 ``model_type`` 查 :data:`DEVICE_FIELDS_BY_MODEL`；
- 其它模块复用的 :func:`validate_device_status_rules`（状态灯契约，热水器也用）。

判定口径与 0.7.8 一致，只有一处**有意**差异：非字符串的 ``entityId`` 由
``ctx.pattern`` 归为 422，不能直接用 ``re.fullmatch``（非字符串会抛 ``TypeError`` 冒成 500）。
"""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping
from typing import Any, NoReturn

from fastapi import HTTPException

from .config_ctx import (
    ENTITY_ID_PATTERN,
    MDI_ICON_LOOSE_PATTERN,
    EnumSpec,
    ValidationContext,
)
from .extra_types import EXTRA_TYPES

#: 绿植类允许的模型（只有这些模型会被 ``plant`` 集合收纳）。
INDOOR_PLANT_MODEL_TYPES = (
    'decor-small-plant',
    'plant',
    'plant-monstera',
    'plant-snake',
    'plant-palm',
    'plant-rubber',
    'plant-pothos',
    'flower-orchid',
    'flower-peace-lily',
    'flower-anthurium',
    'flower-hydrangea',
)

#: 设备型号档案：集合名、场景模型类型、展示名。
#:
#: ``collection`` 必须与 ``devices`` 分区里的集合名一致（前端按它读数据）；
#: ``model_types`` 只出现在「一个集合收纳多种场景模型」的类别上。
DEVICE_PROFILES: dict[str, dict[str, Any]] = {
    'smallcar': {
        'collection': 'cars',
        'model_type': 'smallcar',
        'model_types': ('smallcar', 'suv', 'scooter'),
        'label': '汽车',
    },
    'fridge': {'collection': 'fridges', 'model_type': 'fridge', 'label': '冰箱'},
    'printer': {'collection': 'printers', 'model_type': 'printer', 'label': '打印机'},
    'water-purifier': {
        'collection': 'waterPurifiers',
        'model_type': 'water-purifier',
        'label': '净水器',
    },
    'ricecooker': {'collection': 'riceCookers', 'model_type': 'ricecooker', 'label': '电饭煲'},
    'steamoven': {'collection': 'steamOvens', 'model_type': 'steamoven', 'label': '蒸烤箱'},
    'air-fryer': {'collection': 'airFryers', 'model_type': 'air-fryer', 'label': '空气炸锅'},
    'pet-feeder': {
        'collection': 'petFeeders',
        'model_type': 'pet-feeder',
        'label': '自动喂食器',
    },
    'pet-fountain': {
        'collection': 'petFountains',
        'model_type': 'pet-fountain',
        'label': '宠物饮水机',
    },
    '3d-printer': {'collection': 'printers3d', 'model_type': '3d-printer', 'label': '3D打印机'},
    'router': {'collection': 'routers', 'model_type': 'router', 'label': '路由器'},
    'home-network-cabinet': {
        'collection': 'networkCabinets',
        'model_type': 'home-network-cabinet',
        'label': '机柜',
    },
    'humidifier': {'collection': 'humidifiers', 'model_type': 'humidifier', 'label': '加湿器'},
    'aroma-diffuser': {
        'collection': 'aromaDiffusers',
        'model_type': 'aroma-diffuser',
        'label': '香氛机',
    },
    'dishwasher': {'collection': 'dishwashers', 'model_type': 'dishwasher', 'label': '洗碗机'},
    'washer': {'collection': 'washers', 'model_type': 'washer', 'label': '洗衣机'},
    'rangehood': {'collection': 'rangehoods', 'model_type': 'rangehood', 'label': '油烟机'},
    'dryer': {'collection': 'dryers', 'model_type': 'dryer', 'label': '烘干机'},
    'pressure-cooker': {
        'collection': 'pressureCookers',
        'model_type': 'pressure-cooker',
        'label': '电压力锅',
    },
    'pet-dryer': {'collection': 'petDryers', 'model_type': 'pet-dryer', 'label': '宠物烘干机'},
    'disinfection-cabinet': {
        'collection': 'disinfectionCabinets',
        'model_type': 'disinfection-cabinet',
        'label': '消毒柜',
    },
    'tea_bar_machine': {
        'collection': 'teaBarMachines',
        'model_type': 'tea_bar_machine',
        'label': '茶吧机',
    },
    'smart-socket-86': {
        'collection': 'smartSockets86',
        'model_type': 'smart-socket-86',
        'label': '86型智能插座',
    },
    'pipelinewaterpurifier': {
        'collection': 'pipelineWaterPurifiers',
        'model_type': 'pipelinewaterpurifier',
        'label': '管线机',
    },
    'juicer': {'collection': 'juicers', 'model_type': 'juicer', 'label': '榨汁机'},
    'bread-maker': {'collection': 'breadMakers', 'model_type': 'bread-maker', 'label': '面包机'},
    'power-blender': {
        'collection': 'powerBlenders',
        'model_type': 'power-blender',
        'label': '破壁机',
    },
    'microwave': {'collection': 'microwaves', 'model_type': 'microwave', 'label': '微波炉'},
    'coffee-machine': {
        'collection': 'coffeeMachines',
        'model_type': 'coffee-machine',
        'label': '咖啡机',
    },
    'toilet': {'collection': 'toilets', 'model_type': 'toilet', 'label': '智能马桶'},
    'plant': {
        'collection': 'plants',
        'model_type': 'plant',
        'model_types': INDOOR_PLANT_MODEL_TYPES,
        'label': '绿植',
    },
    'bed': {
        'collection': 'beds',
        'model_type': 'bed',
        'model_types': ('bed', 'round-double-bed'),
        'label': '床',
    },
    'computer': {
        'collection': 'computers',
        'model_type': 'computer',
        'model_types': ('desktop', 'laptop'),
        'label': '电脑',
    },
}

#: ``devices`` 分区里归本模块管的集合名。
GENERIC_DEVICE_COLLECTIONS = tuple(
    profile['collection'] for profile in DEVICE_PROFILES.values()
)

#: 家电公共白名单（注意：家电**不允许**有 ``entityId``，主实体由设备档案推断）。
GENERIC_DEVICE_FIELDS = frozenset(
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
)
#: 汽车多出来的电量/充电卡片字段。
SMALLCAR_EXTRA_FIELDS = frozenset(
    {
        'cardScale',
        'cardWidth',
        'cardOpacity',
        'cardFontSize',
        'chargingStates',
        'batteryEntityId',
        'chargingEntityId',
    }
)
#: 电脑：电源实体 + 自定义屏幕图（用户上传素材）。
COMPUTER_EXTRA_FIELDS = frozenset({'powerEntityId', 'screenImage'})
#: 吸风动画（油烟机）与喷雾动画（加湿器 / 香氛机）。
ANIMATION_EXTRA_FIELDS = frozenset({'animationEntityId', 'animationEnabled'})
#: 只有这些型号允许挂 ``animationEntityId``。
ANIMATION_MODEL_TYPES = frozenset({'rangehood', 'humidifier', 'aroma-diffuser'})
#: 吸风动画可绑定的实体域（binary_sensor 用来读门窗开合）。
RANGEHOOD_ANIMATION_DOMAINS = frozenset({'fan', 'switch', 'binary_sensor', 'input_boolean'})
#: 喷雾动画可绑定的实体域。
MIST_ANIMATION_DOMAINS = frozenset({'fan', 'switch', 'input_boolean'})
#: 用户上传素材 id：``user:`` + 32 位小写十六进制。
ASSET_ID_PATTERN = re.compile(r'user:[0-9a-f]{32}')

#: ``型号 → 白名单``（查表代替每类设备各写一遍 if）。
DEVICE_FIELDS_BY_MODEL: dict[str, frozenset[str]] = {}
for _model_type in DEVICE_PROFILES:
    _fields = set(GENERIC_DEVICE_FIELDS)
    if _model_type == 'smallcar':
        _fields |= SMALLCAR_EXTRA_FIELDS
    if _model_type == 'computer':
        _fields |= COMPUTER_EXTRA_FIELDS
    if _model_type in ANIMATION_MODEL_TYPES:
        _fields |= ANIMATION_EXTRA_FIELDS
    DEVICE_FIELDS_BY_MODEL[_model_type] = frozenset(_fields)

#: 坐标 / 高度 / 尺寸边界（尺寸下限极小，不用 ``positive_number``）。
DEVICE_NUMBER_BOUNDS: tuple[tuple[str, float, float], ...] = (
    ('x', -1_000_000, 1_000_000),
    ('y', -1_000_000, 1_000_000),
    ('height', 0, 20),
    ('size', 1e-06, 1_000_000),
    ('iconSize', 1e-06, 1_000_000),
    ('hitSize', 1e-06, 1_000_000),
)
DEVICE_FLAG_FIELDS = ('visible', 'hiddenClickable', 'buttonHidden')
DEVICE_CLICK_ACTIONS = ('focus', 'focus-panel', 'panel')
#: 家电点击动作（默认面板档）。
DEVICE_CLICK_ACTION_ENUM = EnumSpec('clickAction', DEVICE_CLICK_ACTIONS, 'focus-panel')
#: 汽车卡片三项数值边界。
SMALLCAR_CARD_BOUNDS: tuple[tuple[str, float, float], ...] = (
    ('cardScale', 0.5, 3),
    ('cardOpacity', 0, 1),
    ('cardWidth', 100, 600),
)
#: 汽车两个只读实体的域限制。
SMALLCAR_ENTITY_DOMAINS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ('batteryEntityId', ('sensor',)),
    ('chargingEntityId', ('binary_sensor', 'sensor')),
)
#: 状态灯文案与附加控制标签上限。
STATUS_STATE_TEXT_LIMIT = 120
EXTRA_CONTROL_TEXT_LIMIT = 120
#: 电脑屏幕图说明文字上限（前端编辑器同步校验）。
SCREEN_IMAGE_LABEL_LIMIT = 128
#: 充电状态里视为"没状态"的取值（大小写不敏感）。
CHARGING_STATE_BLANK_VALUES = frozenset({'unknown', 'unavailable', 'none', 'null'})
#: 状态灯里不允许作为匹配条件的取值（它们表示"没有状态"）。
STATUS_RULE_REJECTED_VALUES = frozenset({'unknown', 'unavailable'})
#: 状态灯规则字段与附加控制字段。
STATUS_RULE_FIELDS = frozenset({'active', 'entityId', 'inactive'})
EXTRA_CONTROL_FIELDS = frozenset({'rows', 'type', 'label', 'columns', 'entityId'})
#: 附加控制网格档位（列 / 行）。
GRID_SPANS: dict[str, tuple[int, ...]] = {'columns': (1, 2, 3, 4), 'rows': (1, 2)}
#: 附加控制里「整块面板 / 画面」两种展示类型；它们仍然绑定一个实体。
EXTRA_PANEL_TYPES = frozenset({'panel', 'picture'})
#: 允许用 ``scene.`` 实体做附加控制的域前缀（点「运行场景」）。
EXTRA_ENTITY_PREFIXES = ('fan.', 'scene.')


def _status_values(value: Any) -> list[Any] | None:
    """``active`` / ``inactive`` 必须是状态值列表；单值不合法。"""
    return value if isinstance(value, list) else None


def validate_device_status_rules(
    status_rules: Any, fail_validation: Callable[[], NoReturn]
) -> None:
    """各类家电（含热水器）共享的状态灯契约。

    ``health`` 允许写成列表（多个健康探针），其余键是单个规则对象。
    ``active`` / ``inactive`` 必须是字符串列表（两组互不重叠）。
    """
    if not isinstance(status_rules, dict) or set(status_rules) - {'power', 'health'}:
        fail_validation()
    rules_to_check: list[Any] = []
    for key, status_rule in status_rules.items():
        if key == 'health' and isinstance(status_rule, list):
            rules_to_check.extend(status_rule)
            continue
        rules_to_check.append(status_rule)
    for status_rule in rules_to_check:
        if (
            not isinstance(status_rule, dict)
            or set(status_rule) != STATUS_RULE_FIELDS
            or not isinstance(status_rule['entityId'], str)
            or ENTITY_ID_PATTERN.fullmatch(status_rule['entityId']) is None
        ):
            fail_validation()
        active_values = _status_values(status_rule['active'])
        inactive_values = _status_values(status_rule['inactive'])
        if active_values is None or inactive_values is None:
            fail_validation()
            continue
        if any(
            not isinstance(value, str)
            or not value
            or len(value) > STATUS_STATE_TEXT_LIMIT
            or not value.strip()
            or value.strip().lower() in STATUS_RULE_REJECTED_VALUES
            for group in (active_values, inactive_values)
            for value in group
        ):
            fail_validation()
        if set(active_values) & set(inactive_values):
            fail_validation()


def _fail_device(profile: Mapping[str, Any], model_type: str = '') -> NoReturn:
    """设备类校验失败：文案带上设备类型与具体检查面，前端好定位。"""
    reason = (
        '实体、布局和吸风动画来源'
        if model_type == 'rangehood'
        else '实体、布局和状态灯规则'
    )
    raise HTTPException(422, detail=f"设备配置无效，请检查{reason}。")


def validate_device_bindings(
    ctx: ValidationContext, items: Any, model_type: str = 'fridge'
) -> None:
    """一类家电的集合校验：白名单 / 身份 / 去重 / 布局 / 附加控制与状态灯。"""
    profile = DEVICE_PROFILES[model_type]
    fail = lambda: _fail_device(profile, model_type)  # noqa: E731 - 与其它校验器同形
    allowed_fields = DEVICE_FIELDS_BY_MODEL[model_type]
    if not isinstance(items, list):
        fail()
    seen_ids: set = set()
    seen_models: set = set()
    for item in items:
        if not isinstance(item, dict) or set(item) - allowed_fields:
            fail()
        if model_type == 'smallcar':
            _validate_smallcar_bindings(ctx, item, fail)
        if model_type == 'computer':
            _validate_computer_bindings(ctx, item, fail)
        if model_type in ANIMATION_MODEL_TYPES:
            _validate_animation_bindings(item, model_type, fail)
        _validate_device_item(ctx, item, fail)
        if not _register_device_item(seen_ids, seen_models, item):
            fail()


def _register_device_item(seen_ids: set, seen_models: set, item: dict) -> bool:
    """登记 ``id`` 与 ``(floorId, modelId)``；重复或身份字段缺失即返回 ``False``。"""
    device_id = item['id']
    model_key = (item['floorId'], item['modelId'])
    if device_id in seen_ids or model_key in seen_models:
        return False
    seen_ids.add(device_id)
    seen_models.add(model_key)
    return True


def _entity_in_domains(entity_id: Any, domains: tuple[str, ...] | frozenset[str]) -> bool:
    """``entity_id`` 必须是 ``domain.object_id``，且域在白名单里。"""
    return (
        isinstance(entity_id, str)
        and ENTITY_ID_PATTERN.fullmatch(entity_id) is not None
        and entity_id.split('.')[0] in domains
    )


def _validate_smallcar_bindings(
    ctx: ValidationContext, item: dict, fail
) -> None:
    """汽车专有：电量/充电实体必须与设备绑定，卡片数值与充电状态映射有界。"""
    for key, domains in SMALLCAR_ENTITY_DOMAINS:
        entity_id = item.get(key, '')
        if entity_id and (not _entity_in_domains(entity_id, domains) or not item.get('deviceId')):
            fail()
        if not isinstance(entity_id, str):
            fail()
    if not ctx.numbers_within(item, SMALLCAR_CARD_BOUNDS):
        fail()
    # 字号不设上限（9-32 夹紧会把放大后的读数裁掉），只要求为正数。
    if 'cardFontSize' in item and not ctx.positive_number(item['cardFontSize']):
        fail()
    if 'chargingStates' in item:
        charging_states = item['chargingStates']
        if (
            not isinstance(charging_states, dict)
            or set(charging_states) != {'active', 'inactive'}
            or any(
                not ctx.text(charging_states.get(key), EXTRA_CONTROL_TEXT_LIMIT)
                or not charging_states[key].strip()
                or '\n' in charging_states[key]
                or '\r' in charging_states[key]
                or charging_states[key].strip().lower() in CHARGING_STATE_BLANK_VALUES
                for key in ('active', 'inactive')
            )
            or charging_states['active'].strip() == charging_states['inactive'].strip()
        ):
            fail()


def _validate_computer_bindings(ctx: ValidationContext, item: dict, fail) -> None:
    #: 电脑专有：电源实体与屏幕图。
    #:
    #: 电源实体是"通用电源键"的唯一来源，域不做限制（用户可能接插座/开关/自定义实体），
    #: 但必须是合法的 ``domain.object_id``；屏幕图只接受用户上传素材 id。
    if 'powerEntityId' in item and (
        not isinstance(item['powerEntityId'], str)
        or (item['powerEntityId'] and ENTITY_ID_PATTERN.fullmatch(item['powerEntityId']) is None)
    ):
        fail()
    screen_image = item.get('screenImage', '')
    if screen_image and (
        not isinstance(screen_image, str)
        or ASSET_ID_PATTERN.fullmatch(screen_image) is None
    ):
        fail()


def _validate_animation_bindings(item: dict, model_type: str, fail) -> None:
    """吸风 / 喷雾动画：动画实体必须与设备绑定，域按型号收窄。"""
    entity_id = item.get('animationEntityId', '')
    domains = (
        RANGEHOOD_ANIMATION_DOMAINS if model_type == 'rangehood' else MIST_ANIMATION_DOMAINS
    )
    if entity_id and (not _entity_in_domains(entity_id, domains) or not item.get('deviceId')):
        fail()
    if not isinstance(entity_id, str):
        fail()
    if 'animationEnabled' in item and not isinstance(item['animationEnabled'], bool):
        fail()



def _validate_device_item(ctx: ValidationContext, item: Any, fail) -> None:
    """家电公共判定：文本/身份/布局/图标/相机/附加控制。"""
    if any(
        not ctx.text(item.get(key, ''), 128)
        for key in ('id', 'floorId', 'modelId', 'deviceId', 'deviceName', 'label')
    ):
        fail()
    # 家电不允许自带 entityId（主实体由设备档案推断），但 deviceId/deviceName 必填。
    if any(not item.get(key) for key in ('id', 'floorId', 'modelId')) or item.get('entityId'):
        fail()
    if not ctx.numbers_within(item, DEVICE_NUMBER_BOUNDS):
        fail()
    if not ctx.flag_fields(item, DEVICE_FLAG_FIELDS):
        fail()
    if not ctx.enum(item, DEVICE_CLICK_ACTION_ENUM):
        fail()
    if not ctx.icon(item, MDI_ICON_LOOSE_PATTERN):
        fail()
    ctx.validate_camera(item.get('focusCamera'))
    _validate_device_extras(ctx, item, fail)


def _validate_device_extras(ctx: ValidationContext, item: dict, fail) -> None:
    """附加控制 + 状态灯：两者都要求先绑设备（``deviceId``）。

    0.7.8 起附加控制**不再有条数上限**：面板大小由用户自己控制，后端只校验每一项。
    """
    extras = item.get('extraControls', [])
    status_rules = item.get('statusRules', {})
    if (
        not isinstance(extras, list)
        or not isinstance(status_rules, dict)
        or set(status_rules) - {'power', 'health'}
    ):
        fail()
    if (extras or status_rules) and not item.get('deviceId'):
        fail()
    selected_entity_ids: set[str] = set()
    for extra in extras:
        if not isinstance(extra, dict) or set(extra) - EXTRA_CONTROL_FIELDS:
            fail()
        extra_type = extra.get('type')
        # 所有附加控制（含 panel / picture）都必须绑定实体，且 id 形状合法。
        if (
            not isinstance(extra.get('entityId'), str)
            or ENTITY_ID_PATTERN.fullmatch(extra['entityId']) is None
        ):
            fail()
        extra_entity_id = extra['entityId']
        # 域表里没有的实体只能"看状态"；风扇 / 场景额外允许以 state 形式挂上。
        expected_type = EXTRA_TYPES.get(extra_entity_id.split('.')[0], 'state')
        # panel / picture 域允许以只读 state 形式挂上；风扇 / 场景保留旧口径。
        legacy_state = extra_type == 'state' and (
            expected_type in EXTRA_PANEL_TYPES
            or extra_entity_id.startswith(EXTRA_ENTITY_PREFIXES)
        )
        if (
            extra_entity_id in selected_entity_ids
            or (extra_type != expected_type and not legacy_state)
            or not ctx.text(extra.get('label', ''), EXTRA_CONTROL_TEXT_LIMIT)
        ):
            fail()
        selected_entity_ids.add(extra_entity_id)
        for dimension, allowed in GRID_SPANS.items():
            if dimension not in extra:
                continue
            if type(extra[dimension]) is not int or extra[dimension] not in allowed:
                fail()
    validate_device_status_rules(status_rules, fail)


def require_device_model(binding: dict, scene: dict, model_type: str = 'fridge') -> None:
    """确认绑定的场景模型还在，且类型与设备档案一致。"""
    scene_floor = next(
        (floor for floor in scene.get('floors', []) if floor.get('id') == binding.get('floorId')),
        {},
    )
    scene_models = [
        item
        for item in scene_floor.get('scene', {}).get('items', [])
        if item.get('id') == binding.get('modelId')
    ]
    profile = DEVICE_PROFILES[model_type]
    allowed_types = profile.get('model_types') or (profile['model_type'],)
    if not scene_models or scene_models[0].get('type') not in allowed_types:
        raise HTTPException(409, detail='模型已移除，请在设备配置中重新选择。')
