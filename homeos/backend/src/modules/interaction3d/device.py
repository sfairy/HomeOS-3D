"""由设备自身拥有的弹窗配置，不推断主实体。

本模块有两类使用者：

- :func:`validate_device_bindings`：家电（汽车 / 冰箱 / 冰柜 / 洗碗机 / 洗衣机 / 烘干机 / 绿植）
  的集合校验，白名单按 ``model_type`` 查 :data:`DEVICE_FIELDS_BY_MODEL`；
- 其它模块复用的 :func:`validate_device_status_rules`（状态灯契约，热水器也用）。

判定口径与原实现逐条一致，只有一处**有意**差异：非字符串的 ``entityId`` 由
``ctx.pattern`` 归为 422，不能直接用 ``re.fullmatch``（非字符串会抛 ``TypeError`` 冒成 500）。
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, NoReturn

from fastapi import HTTPException

from .config_ctx import (
    ENTITY_ID_PATTERN,
    MAX_EXTRA_CONTROLS,
    MDI_ICON_LOOSE_PATTERN,
    EnumSpec,
    ValidationContext,
)
from .purifier import EXTRA_TYPES

#: 设备型号档案：集合名、场景模型类型、展示名。
DEVICE_PROFILES: dict[str, dict[str, Any]] = {
    'smallcar': {
        'collection': 'cars',
        'model_type': 'smallcar',
        'model_types': ('smallcar', 'suv', 'scooter'),
        'label': '汽车',
    },
    'fridge': {'collection': 'fridges', 'model_type': 'fridge', 'label': '冰箱'},
    'freezer': {'collection': 'freezers', 'model_type': 'freezer', 'label': '冰柜'},
    'dishwasher': {'collection': 'dishwashers', 'model_type': 'dishwasher', 'label': '洗碗机'},
    'washer': {'collection': 'washers', 'model_type': 'washer', 'label': '洗衣机'},
    'dryer': {'collection': 'dryers', 'model_type': 'dryer', 'label': '烘干机'},
    'plant': {'collection': 'plants', 'model_type': 'plant', 'label': '绿植'},
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
#: ``型号 → 白名单``（查表代替每类设备各写一遍 if）。
DEVICE_FIELDS_BY_MODEL: dict[str, frozenset[str]] = {
    model_type: GENERIC_DEVICE_FIELDS
    | (SMALLCAR_EXTRA_FIELDS if model_type == 'smallcar' else frozenset())
    for model_type in DEVICE_PROFILES
}
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
#: 充电状态里视为"没状态"的取值（大小写不敏感）。
CHARGING_STATE_BLANK_VALUES = frozenset({'unknown', 'unavailable', 'none', 'null'})
#: 状态灯规则字段与附加控制字段。
STATUS_RULE_FIELDS = frozenset({'active', 'entityId', 'inactive'})
EXTRA_CONTROL_FIELDS = frozenset({'rows', 'type', 'label', 'columns', 'entityId'})
#: 附加控制网格档位（列 / 行）。
GRID_SPANS: dict[str, tuple[int, ...]] = {'columns': (1, 2, 3, 4), 'rows': (1, 2)}


def validate_device_status_rules(status_rules: Any, fail_validation) -> None:
    """各类家电（含热水器）共享的状态灯契约。

    ``health`` 允许写成列表（多个健康探针），其余键是单个规则对象。
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
        if any(
            not isinstance(status_rule[key], str)
            or not status_rule[key].strip()
            or len(status_rule[key]) > STATUS_STATE_TEXT_LIMIT
            for key in ('active', 'inactive')
        ) or status_rule['active'] == status_rule['inactive']:
            fail_validation()


def _fail_device(profile: Mapping[str, Any]) -> NoReturn:
    """设备类校验失败：文案带上设备类型，前端好定位。"""
    raise HTTPException(422, detail=f"{profile['label']}设备配置无效，请检查实体、布局和状态灯规则。")


def validate_device_bindings(
    ctx: ValidationContext, items: Any, model_type: str = 'fridge'
) -> None:
    """一类家电的集合校验：白名单 / 身份 / 去重 / 布局 / 附加控制与状态灯。"""
    profile = DEVICE_PROFILES[model_type]
    allowed_fields = DEVICE_FIELDS_BY_MODEL[model_type]
    if not isinstance(items, list):
        _fail_device(profile)
    seen_ids: set = set()
    seen_models: set = set()
    for item in items:
        if not isinstance(item, dict) or set(item) - allowed_fields:
            _fail_device(profile)
        if model_type == 'smallcar':
            _validate_smallcar_bindings(ctx, item, profile)
        _validate_device_item(ctx, item, profile)
        if not _register_device_item(seen_ids, seen_models, item):
            _fail_device(profile)


def _register_device_item(seen_ids: set, seen_models: set, item: dict) -> bool:
    """登记 ``id`` 与 ``(floorId, modelId)``；重复或身份字段缺失即返回 ``False``。"""
    device_id = item['id']
    model_key = (item['floorId'], item['modelId'])
    if device_id in seen_ids or model_key in seen_models:
        return False
    seen_ids.add(device_id)
    seen_models.add(model_key)
    return True


def _validate_smallcar_bindings(
    ctx: ValidationContext, item: dict, profile: Mapping[str, Any]
) -> None:
    """汽车专有：电量/充电实体必须与设备绑定，卡片数值与充电状态映射有界。"""
    for key, domains in SMALLCAR_ENTITY_DOMAINS:
        entity_id = item.get(key, '')
        if entity_id and (
            not isinstance(entity_id, str)
            or ENTITY_ID_PATTERN.fullmatch(entity_id) is None
            or entity_id.split('.')[0] not in domains
            or not item.get('deviceId')
        ):
            _fail_device(profile)
        if not isinstance(entity_id, str):
            _fail_device(profile)
    if not ctx.numbers_within(item, SMALLCAR_CARD_BOUNDS):
        _fail_device(profile)
    # 字号不设上限（9-32 夹紧会把放大后的读数裁掉），只要求为正数。
    if 'cardFontSize' in item and not ctx.positive_number(item['cardFontSize']):
        _fail_device(profile)
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
            _fail_device(profile)


def _validate_device_item(
    ctx: ValidationContext, item: Any, profile: Mapping[str, Any]
) -> None:
    """家电公共判定：文本/身份/布局/图标/相机/附加控制。"""
    if any(
        not ctx.text(item.get(key, ''))
        for key in ('id', 'floorId', 'modelId', 'deviceId', 'deviceName', 'label')
    ):
        _fail_device(profile)
    # 家电不允许自带 entityId（主实体由设备档案推断），但 deviceId/deviceName 必填。
    if any(not item.get(key) for key in ('id', 'floorId', 'modelId')) or item.get('entityId'):
        _fail_device(profile)
    if not ctx.numbers_within(item, DEVICE_NUMBER_BOUNDS):
        _fail_device(profile)
    if not ctx.flag_fields(item, DEVICE_FLAG_FIELDS):
        _fail_device(profile)
    if not ctx.enum(item, DEVICE_CLICK_ACTION_ENUM):
        _fail_device(profile)
    if not ctx.icon(item, MDI_ICON_LOOSE_PATTERN):
        _fail_device(profile)
    ctx.validate_camera(item.get('focusCamera'))
    _validate_device_extras(ctx, item, profile)


def _validate_device_extras(
    ctx: ValidationContext, item: dict, profile: Mapping[str, Any]
) -> None:
    """附加控制 + 状态灯：两者都要求先绑设备（``deviceId``）。"""
    extras = item.get('extraControls', [])
    status_rules = item.get('statusRules', {})
    if (
        not isinstance(extras, list)
        or len(extras) > MAX_EXTRA_CONTROLS
        or not isinstance(status_rules, dict)
        or set(status_rules) - {'power', 'health'}
    ):
        _fail_device(profile)
    if (extras or status_rules) and not item.get('deviceId'):
        _fail_device(profile)
    selected_entity_ids: set[str] = set()
    for extra in extras:
        if (
            not isinstance(extra, dict)
            or set(extra) - EXTRA_CONTROL_FIELDS
            or not isinstance(extra.get('entityId'), str)
            or ENTITY_ID_PATTERN.fullmatch(extra['entityId']) is None
        ):
            _fail_device(profile)
        extra_entity_id = extra['entityId']
        # 域表里没有的实体只能"看状态"；风扇额外允许以 state 形式挂上。
        expected_type = EXTRA_TYPES.get(extra_entity_id.split('.')[0], 'state')
        if (
            extra_entity_id in selected_entity_ids
            or (
                extra.get('type') != expected_type
                and not (extra_entity_id.startswith('fan.') and extra.get('type') == 'state')
            )
            or not ctx.text(extra.get('label', ''), EXTRA_CONTROL_TEXT_LIMIT)
        ):
            _fail_device(profile)
        selected_entity_ids.add(extra_entity_id)
        for dimension, allowed in GRID_SPANS.items():
            if dimension not in extra:
                continue
            if type(extra[dimension]) is not int or extra[dimension] not in allowed:
                _fail_device(profile)
    validate_device_status_rules(status_rules, lambda: _fail_device(profile))


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
    model_types: Sequence[str] = profile.get('model_types', (profile['model_type'],))
    if len(scene_models) != 1 or scene_models[0].get('type') not in model_types:
        raise HTTPException(409, detail=f"{profile['label']}模型已移除，请在设备配置中重新选择。")