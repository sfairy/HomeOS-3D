"""由设备自身拥有的弹窗配置，不推断主实体。

本模块有两类使用者：

- :func:`validate_device_bindings`：家电（汽车 / 冰箱 / 打印机 / 净水器 / 电脑 …）
  的集合校验，白名单按 ``model_type`` 查 :data:`DEVICE_FIELDS_BY_MODEL`；
- 其它模块复用的 :func:`validate_device_status_rules`（状态灯契约，热水器也用）。

判定口径与 0.7.8 一致，只有一处**有意**差异：非字符串的 ``entityId`` 由
``ctx.pattern`` 归为 422，不能直接用 ``re.fullmatch``（非字符串会抛 ``TypeError`` 冒成 500）。
"""

from __future__ import annotations

import math
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
    'sofa': {
        'collection': 'sofas',
        'model_type': 'sofa',
        'model_types': ('sofa', 'sofa-single', 'sofa-l'),
        'label': '沙发',
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
        'tirePressure',
        # 0.8.1：车辆标签与车模共用点击开关（`clickAction` 只在开关打开时生效）。
        'interactionEnabled',
    }
)
#: 电脑：电源实体 + 自定义屏幕图（用户上传素材）。
COMPUTER_EXTRA_FIELDS = frozenset({'powerEntityId', 'screenImage'})
#: 管线机：外观款式（原款 / 矩形双出水），对应前端 `pipelineDispenserStyle`。
PIPELINE_DISPENSER_EXTRA_FIELDS = frozenset({'pipelineDispenserStyle'})
#: 管线机允许的外观款式取值（与前端 `pipeline-dispenser.ts` 同口径）。
PIPELINE_DISPENSER_STYLES = frozenset({'original', 'rectangular'})
#: 吸风动画（油烟机）与喷雾动画（加湿器 / 香氛机）。
ANIMATION_EXTRA_FIELDS = frozenset({'animationEntityId', 'animationEnabled'})
#: 不显示状态指示灯的型号：床与沙发（0.7.9 沙发档案 ``statusIndicator: false``）。
STATUS_INDICATOR_DISABLED_MODELS = frozenset({'bed', 'sofa'})
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
    if _model_type == 'pipelinewaterpurifier':
        _fields |= PIPELINE_DISPENSER_EXTRA_FIELDS
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
#: 车辆点击动作（0.8.1）：多一个「不响应点击」，且是默认值 —— 与 `carClickAction` 同口径。
VEHICLE_CLICK_ACTIONS = ('none', *DEVICE_CLICK_ACTIONS)
VEHICLE_CLICK_ACTION_ENUM = EnumSpec('clickAction', VEHICLE_CLICK_ACTIONS, 'none')
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
#: 四轮胎压（0.8.0）：开关 + 显示方式 + 两个样式值 + 四个轮位 ``sensor.*``。
TIRE_PRESSURE_FIELDS = frozenset({'enabled', 'mode', 'fontSize', 'opacity', 'wheels'})
#: 胎压显示方式：简洁数值 / 数值和轮位。
TIRE_PRESSURE_MODES = ('compact', 'named')
TIRE_PRESSURE_MODE_ENUM = EnumSpec('mode', TIRE_PRESSURE_MODES, 'compact')
#: 四个轮位的键（左前 / 右前 / 左后 / 右后）。
TIRE_PRESSURE_WHEEL_KEYS = frozenset({'fl', 'fr', 'rl', 'rr', 'front', 'rear'})
TIRE_PRESSURE_SENSOR = re.compile(r'sensor\.[a-z0-9_]+')
#: 字号与背景不透明度边界（0.8.1）：字号只要求 > 0（不设上限，与卡片字号同口径），
#: 不透明度是 0–1 闭区间。
TIRE_PRESSURE_POSITIVE_FIELDS = ('fontSize',)
TIRE_PRESSURE_UNIT_FIELDS = ('opacity',)
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
#: 数值规则多一个 ``kind`` 字段；键集合必须**恰好**是这四项，多写少写都按 422 处理。
NUMERIC_STATUS_RULE_FIELDS = frozenset({'kind', 'active', 'entityId', 'inactive'})
#: 数值规则的比较方式。与前端 ``NUMERIC_OPERATORS`` 同口径。
NUMERIC_OPERATORS = frozenset({'gt', 'gte', 'lt', 'lte', 'eq', 'ne'})
#: 反向比较：``gt 30`` 的反向是 ``lte 30``，两者合起来才无缝覆盖实数轴。
INVERSE_OPERATOR = {
    'gt': 'lte',
    'gte': 'lt',
    'lt': 'gte',
    'lte': 'gt',
    'eq': 'ne',
    'ne': 'eq',
}
#: 一组状态值最多 64 条（前端 textarea 同口径）。
STATUS_STATE_GROUP_LIMIT = 64
EXTRA_CONTROL_FIELDS = frozenset({'rows', 'type', 'label', 'columns', 'entityId'})
#: 附加控制网格档位（列 / 行）。
GRID_SPANS: dict[str, tuple[int, ...]] = {'columns': (1, 2, 3, 4), 'rows': (1, 2)}
#: 附加控制里「整块面板 / 画面」两种展示类型；它们仍然绑定一个实体。
EXTRA_PANEL_TYPES = frozenset({'panel', 'picture'})
#: 允许用 ``scene.`` 实体做附加控制的域前缀（点「运行场景」）。
EXTRA_ENTITY_PREFIXES = ('fan.', 'scene.')


def _status_values(value: Any) -> list[Any] | None:
    """``active`` / ``inactive`` 允许写成单个字符串或字符串列表。

    0.7.9 起编辑器的单值分支写字符串（``active: 'on'``），多值才写数组；
    两种形态都合法，校验时统一成列表。
    """
    if isinstance(value, str):
        return [value]
    return value if isinstance(value, list) else None


def _numeric_condition(condition: Any) -> tuple[str, int | float] | None:
    """解析 ``{operator, value}``；不合法返回 ``None``（调用方统一 422）。

    ``value`` 只接受 ``int`` / ``float`` —— ``bool`` 是 ``int`` 子类，必须显式排除；
    ``NaN`` / ``±Infinity`` 用 ``math.isfinite`` 拦截，溢出（如 ``1e400`` 解析成的 ``inf``）
    同样按非法处理。
    """
    if not isinstance(condition, dict) or set(condition) != {'operator', 'value'}:
        return None
    operator = condition['operator']
    value = condition['value']
    if operator not in NUMERIC_OPERATORS or isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    try:
        if not math.isfinite(value):
            return None
    except OverflowError:
        return None
    return operator, value


def _numeric_rule_valid(active: tuple[str, int | float], inactive: tuple[str, int | float]) -> bool:
    """数值规则的迟滞区间校验。

    - ``inactive`` 恰为 ``active`` 的反向操作且阈值相同 → 单阈值对称规则，合法；
    - 否则必须一高一低（``gt/gte`` 与 ``lt/lte`` 各一），高阈值不小于低阈值；
    - 两个阈值相等时只有「两个严格比较」（``gt + lt``）合法：``gte + lte`` 会在临界值
      同时命中两侧，导致每次读数都在亮/灭之间来回跳。
    """
    if inactive == (INVERSE_OPERATOR[active[0]], active[1]):
        return True
    high = active if active[0] in ('gt', 'gte') else inactive
    low = active if active[0] in ('lt', 'lte') else inactive
    if high[0] not in ('gt', 'gte') or low[0] not in ('lt', 'lte'):
        return False
    if low[1] > high[1]:
        return False
    # 相等时只有「两个严格比较」留出了一个空点（如 gt 30 + lt 30），不构成重叠。
    return not (low[1] == high[1] and (high[0] != 'gt' or low[0] != 'lt'))


def validate_device_status_rules(
    status_rules: Any, fail_validation: Callable[[], NoReturn]
) -> None:
    """各类家电（含热水器）共享的状态灯契约。

    ``health`` 允许写成列表（多个健康探针），其余键是单个规则对象。
    规则有两形态：状态匹配（``active`` / ``inactive`` 是字符串或字符串列表）与
    数值比较（``kind == 'numeric'``，两侧各是一个 ``{operator, value}`` 条件）。
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
        if not isinstance(status_rule, dict):
            fail_validation()
        is_numeric = status_rule.get('kind') == 'numeric'
        required_fields = NUMERIC_STATUS_RULE_FIELDS if is_numeric else STATUS_RULE_FIELDS
        if (
            set(status_rule) != required_fields
            or not isinstance(status_rule.get('entityId'), str)
            or ENTITY_ID_PATTERN.fullmatch(status_rule['entityId']) is None
        ):
            fail_validation()
        if is_numeric:
            active_condition = _numeric_condition(status_rule['active'])
            inactive_condition = _numeric_condition(status_rule['inactive'])
            if (
                active_condition is None
                or inactive_condition is None
                or not _numeric_rule_valid(active_condition, inactive_condition)
            ):
                fail_validation()
            continue
        active_values = _status_values(status_rule['active'])
        inactive_values = _status_values(status_rule['inactive'])
        if active_values is None or inactive_values is None:
            fail_validation()
            continue
        # 去重后再比较：重复值不会扩大匹配面，但会让「互不重叠」判断失真。
        active_values = list(dict.fromkeys(active_values))
        inactive_values = list(dict.fromkeys(inactive_values))
        if any(
            not (1 <= len(values) <= STATUS_STATE_GROUP_LIMIT)
            for values in (active_values, inactive_values)
        ):
            fail_validation()
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
    """设备类校验失败：文案带上设备类型与具体检查面，前端好定位。

    床与沙发没有状态灯也没有吸风动画，检查面只剩「实体和布局」；
    油烟机多一个吸风动画来源；其余家电是实体、布局与状态灯规则。
    """
    if model_type in STATUS_INDICATOR_DISABLED_MODELS:
        reason = '实体和布局'
    elif model_type == 'rangehood':
        reason = '实体、布局和吸风动画来源'
    else:
        reason = '实体、布局和状态灯规则'
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
        if model_type == 'pipelinewaterpurifier':
            _validate_pipeline_dispenser_fields(item, fail)
        if model_type in ANIMATION_MODEL_TYPES:
            _validate_animation_bindings(item, model_type, fail)
        _validate_device_item(ctx, item, fail, model_type)
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
    # 0.8.1：`interactionEnabled` 是点击开关本身，必须是布尔（缺省视为关闭）。
    if 'interactionEnabled' in item and type(item['interactionEnabled']) is not bool:
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
    _validate_tire_pressure(ctx, item, fail)


def _validate_tire_pressure(ctx: ValidationContext, item: dict, fail) -> None:
    """四轮胎压：``enabled`` 必填布尔，其余可选；轮位只认 ``sensor.*``，键表即白名单。"""
    tire_pressure = item.get('tirePressure')
    if tire_pressure is None:
        return
    if not isinstance(tire_pressure, dict) or not set(tire_pressure) <= TIRE_PRESSURE_FIELDS:
        fail()
    if not isinstance(tire_pressure.get('enabled'), bool):
        fail()
    if not ctx.enum(tire_pressure, TIRE_PRESSURE_MODE_ENUM):
        fail()
    # 样式值：字号 > 0（无上限），不透明度 0–1；非数值或非有限值一律拒。
    for style_key in (*TIRE_PRESSURE_POSITIVE_FIELDS, *TIRE_PRESSURE_UNIT_FIELDS):
        if style_key not in tire_pressure:
            continue
        style_value = tire_pressure[style_key]
        if type(style_value) not in (int, float) or not math.isfinite(style_value):
            fail()
        elif style_key in TIRE_PRESSURE_POSITIVE_FIELDS:
            if style_value <= 0:
                fail()
        elif not 0 <= style_value <= 1:
            fail()
    wheels = tire_pressure.get('wheels', {})
    if not isinstance(wheels, dict) or set(wheels) - TIRE_PRESSURE_WHEEL_KEYS:
        fail()
    if any(
        not isinstance(wheel_entity_id, str)
        or TIRE_PRESSURE_SENSOR.fullmatch(wheel_entity_id) is None
        for wheel_entity_id in wheels.values()
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


def _validate_pipeline_dispenser_fields(item: dict, fail) -> None:
    """管线机：外观款式只能是 ``original`` / ``rectangular``，缺省按原款。"""
    style = item.get('pipelineDispenserStyle')
    if style is not None and style not in PIPELINE_DISPENSER_STYLES:
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



def _validate_device_item(
    ctx: ValidationContext, item: Any, fail, model_type: str = ''
) -> None:
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
    # 车辆的点击动作多一档「none」，两版对 `clickAction` 的默认值也不同。
    if not ctx.enum(
        item, VEHICLE_CLICK_ACTION_ENUM if model_type == 'smallcar' else DEVICE_CLICK_ACTION_ENUM
    ):
        fail()
    if not ctx.icon(item, MDI_ICON_LOOSE_PATTERN):
        fail()
    ctx.validate_camera(item.get('focusCamera'))
    _validate_device_extras(ctx, item, fail, model_type)


def _validate_device_extras(
    ctx: ValidationContext, item: dict, fail, model_type: str = ''
) -> None:
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
    # 床与沙发不参与状态灯：模型上不画指示灯，配置里带了规则就直接拒绝，
    # 避免前端删掉 statusIndicator 后仍残留一份「看起来生效、实际不渲染」的规则。
    if model_type in STATUS_INDICATOR_DISABLED_MODELS and status_rules:
        fail()


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
