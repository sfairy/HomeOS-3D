"""显式的门绑定以及经能力校验的锁命令。

三块职责：

- :func:`validate_lock_bindings` —— 配置侧：3D 场景里的门控件字段、身份唯一性与门源语义；
- :func:`require_lock_model` —— 落库前确认门模型在场景里仍然存在；
- :func:`validate_lock_command` —— 设备侧：``lock`` / ``open`` / ``unlock`` 的能力位与密码校验。

判定口径与拆分前逐条对齐（黄金用例见
黄金用例曾覆盖）。两点需要留意：

- 门绑定**没有字段白名单**：未知字段一直是被放行的，只有已知字段参与类型与数值校验；
- 非字符串 / 非数字的绑定值由 :class:`ValidationContext` 收敛成 422，旧实现会抛 ``TypeError``
  冒成 500（这是本轮**有意**修正的一类结果）。
"""

from __future__ import annotations

import math
import re
from typing import Any, NoReturn

from fastapi import HTTPException

from .config_ctx import MDI_ICON_PATTERN, EnumSpec, ValidationContext

#: 门控件数量上限。
MAX_LOCKS = 128
#: 门控件字段全集（含 0.7.x 新增的 dual / single-event 门源字段）。
LOCK_FIELDS = frozenset(
    {
        'x',
        'y',
        'id',
        'icon',
        'size',
        'hinge',
        'label',
        'height',
        'floorId',
        'modelId',
        'deviceId',
        'duration',
        'entityId',
        'fontSize',
        'labelMode',
        'openAngle',
        'deviceName',
        'focusCamera',
        'doorEntityId',
        'openDirection',
        'tamperEntityId',
        'batteryEntityId',
        'battery2EntityId',
        'backgroundOpacity',
        'lowBatteryEntityId',
        'doorSource',
        'doorOpenValue',
        'doorCloseValue',
        'doorOpenEntityId',
        'doorCloseEntityId',
        'doorEventEntityId',
        'doorEventAttribute',
    }
)
#: 非文本字段：数值 / 方向 / 相机对象，由各自的判定负责。
LOCK_NON_TEXT_FIELDS = frozenset(
    {
        'x',
        'y',
        'size',
        'height',
        'duration',
        'fontSize',
        'labelMode',
        'openAngle',
        'focusCamera',
        'openDirection',
        'backgroundOpacity',
    }
)
#: 需要「是文本且 ≤255 字符」的字段（其余字段按类型单独校验）。
LOCK_TEXT_FIELDS = LOCK_FIELDS - LOCK_NON_TEXT_FIELDS
#: 身份字段：必须存在且非空。
LOCK_IDENTITY_FIELDS = ('id', 'floorId', 'modelId')
#: 门模型 id 前缀：库里存的是 ``door:<id>``。
DOOR_MODEL_PREFIX = 'door:'
#: 门源枚举（默认 ``sensor``：单实体开关量）。
DOOR_SOURCE = EnumSpec('doorSource', ('sensor', 'single-event', 'dual-event'), 'sensor')
#: 合页方向 / 标签显示模式枚举。
DOOR_HINGE = EnumSpec('hinge', ('left', 'right'), 'left')
DOOR_LABEL_MODE = EnumSpec('labelMode', ('hidden', 'always', 'open'), 'always')
#: 门开合方向：只接受 ``-1`` / ``1``（``bool`` 与 ``1.0`` 都不算）。
DOOR_OPEN_DIRECTIONS = (-1, 1)
#: 动画边界：``(字段, 默认值, 下限, 上限)``；``None`` / 空串回落默认值。
LOCK_ANIMATION_BOUNDS: tuple[tuple[str, float, float, float], ...] = (
    ('openAngle', 80, 10, 110),
    ('duration', 0.7, 0.2, 3),
)
#: 其它数值字段边界：``None`` / 空串视为未设置。
LOCK_NUMBER_BOUNDS: tuple[tuple[str, float, float], ...] = (('size', 20, 500),)
#: 位置字段（只要求有限数，不设范围）。
LOCK_POSITION_FIELDS = ('x', 'y', 'height')
#: 文本字段长度上限。
MAX_LOCK_TEXT_LENGTH = 255
#: 门事件实体：只接受 ``event.*``。
DOOR_EVENT_PATTERN = re.compile(r'event\.[a-z0-9_]+')
#: 门相关的实体绑定：``domain.object_id``（对象名允许 ``-``）。
DOOR_ENTITY_PATTERN = re.compile(r'[a-z_]+\.[a-z0-9_-]+')
#: 门事件字段（可选绑定）。
DOOR_EVENT_BINDINGS: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (key, DOOR_EVENT_PATTERN) for key in ('doorEventEntityId', 'doorOpenEntityId', 'doorCloseEntityId')
)
#: 门相关的实体字段（可选绑定）。
DOOR_ENTITY_BINDINGS: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (key, DOOR_ENTITY_PATTERN)
    for key in (
        'entityId',
        'doorEntityId',
        'batteryEntityId',
        'battery2EntityId',
        'lowBatteryEntityId',
        'tamperEntityId',
    )
)
#: 设备侧命令枚举。
LOCK_COMMANDS = frozenset({'lock', 'open', 'unlock'})
#: 设备侧唯一允许的附加参数。
LOCK_COMMAND_PARAMS = frozenset({'code'})
#: 门锁「释放锁舌」的能力位。
LOCK_OPEN_FEATURE_BIT = 1
#: 密码长度上限。
MAX_LOCK_CODE_LENGTH = 128
#: 不可用状态：这些取值一律视为动作中 / 无状态。
LOCK_UNAVAILABLE_STATES = frozenset({None, '', 'unknown', 'unavailable'})
LOCK_BUSY_STATES = frozenset({'locking', 'opening', 'unlocking'})


def _fail_lock() -> NoReturn:
    """门绑定不合规：与拆分前同一条错误文案。"""
    raise HTTPException(422, detail='门锁配置无效，请检查门模型、实体及动画设置。')


def _validate_door_binding(ctx: ValidationContext, binding: Any) -> None:
    """单扇门的绑定校验：文本字段、身份、门源语义、动画与坐标。"""
    if not isinstance(binding, dict):
        _fail_lock()
    model_id = binding.get('modelId')
    if isinstance(model_id, str) and model_id:
        # 兼容历史配置：只写 ``<id>`` 时补上 ``door:`` 前缀。
        binding['modelId'] = model_id if model_id.startswith(DOOR_MODEL_PREFIX) else f'{DOOR_MODEL_PREFIX}{model_id}'
    if not ctx.require_text(binding, tuple(LOCK_TEXT_FIELDS), MAX_LOCK_TEXT_LENGTH):
        _fail_lock()
    if (
        not ctx.require_value(binding, LOCK_IDENTITY_FIELDS)
        or binding['floorId'] == 'all'
        or not binding['modelId'].startswith(DOOR_MODEL_PREFIX)
    ):
        _fail_lock()
    if not ctx.enum(binding, DOOR_SOURCE) or not ctx.optional_patterns(binding, DOOR_EVENT_BINDINGS):
        _fail_lock()
    door_source = binding.get('doorSource', 'sensor')
    if (
        door_source == 'dual-event'
        and binding.get('doorOpenEntityId')
        and binding.get('doorOpenEntityId') == binding.get('doorCloseEntityId')
    ):
        _fail_lock()
    if door_source == 'single-event' and binding.get('doorEventEntityId'):
        open_value = binding.get('doorOpenValue', '').strip()
        close_value = binding.get('doorCloseValue', '').strip()
        if not open_value or not close_value or open_value == close_value:
            _fail_lock()
    if not ctx.optional_patterns(binding, DOOR_ENTITY_BINDINGS) or not ctx.icon(binding, MDI_ICON_PATTERN):
        _fail_lock()
    for key, default, low, high in LOCK_ANIMATION_BOUNDS:
        candidate = binding.get(key, default)
        if candidate in (None, ''):
            candidate = default
        if not ctx.number(candidate, low, high):
            _fail_lock()
    open_direction = binding.get('openDirection', 1)
    if type(open_direction) is not int or open_direction not in DOOR_OPEN_DIRECTIONS:
        _fail_lock()
    if not ctx.enum(binding, DOOR_HINGE) or not ctx.enum(binding, DOOR_LABEL_MODE):
        _fail_lock()
    for key, low, high in LOCK_NUMBER_BOUNDS:
        dimension = binding.get(key)
        if dimension in (None, ''):
            continue
        if not ctx.number(dimension, low, high):
            _fail_lock()
    # 字号不再设上限（旧的 8-100 夹紧会把放大后的标签裁掉），只要求为正数。
    font_size = binding.get('fontSize')
    if font_size not in (None, '') and not ctx.positive_number(font_size):
        _fail_lock()
    if 'backgroundOpacity' in binding and not ctx.number(binding['backgroundOpacity'], 0, 1):
        _fail_lock()
    for key in LOCK_POSITION_FIELDS:
        coordinate = binding.get(key)
        if coordinate in (None, ''):
            continue
        if not ctx.number(coordinate, -math.inf, math.inf):
            _fail_lock()
    ctx.validate_camera(binding.get('focusCamera'))


def validate_lock_bindings(ctx: ValidationContext, bindings: Any) -> None:
    """门绑定列表校验：逐扇门判定 + ``id`` / ``(floorId, modelId)`` 唯一性。"""
    if not isinstance(bindings, list) or len(bindings) > MAX_LOCKS:
        _fail_lock()
    seen_ids: set[Any] = set()
    seen_models: set[tuple[Any, Any]] = set()
    for binding in bindings:
        _validate_door_binding(ctx, binding)
        door_id = binding['id']
        model_key = (binding['floorId'], binding['modelId'])
        if door_id in seen_ids or model_key in seen_models:
            _fail_lock()
        seen_ids.add(door_id)
        seen_models.add(model_key)


def require_lock_model(binding: dict, scene: dict) -> None:
    """确认 ``binding['modelId']`` 在场景里仍指向一扇可用的门（否则 409）。"""
    model_present = any(
        DOOR_MODEL_PREFIX + str(scene_door.get('id')) == binding.get('modelId')
        and scene_door.get('doorType') != 'frame-only'
        and any(
            scene_wall.get('id') == scene_door.get('wallId')
            for scene_wall in scene_floor.get('scene', {}).get('walls', [])
        )
        for scene_floor in scene.get('floors', [])
        if scene_floor.get('id') == binding.get('floorId')
        for scene_door in scene_floor.get('scene', {}).get('doors', [])
    )
    if not model_present:
        raise HTTPException(409, detail='门模型已移除或更改，请重新配置。')


def validate_lock_command(service: str, command_params: Any, entity_state: Any) -> None:
    """门锁命令闸门：命令白名单、状态可用性、能力位与密码格式。"""
    if (
        service not in LOCK_COMMANDS
        or not isinstance(command_params, dict)
        or set(command_params) - LOCK_COMMAND_PARAMS
    ):
        raise HTTPException(422, detail='不支持的门锁操作或参数。')
    if not entity_state:
        raise HTTPException(409, detail='门锁状态尚未载入，请稍后重试。')
    if entity_state.get('available') is False or entity_state.get('state') in LOCK_UNAVAILABLE_STATES:
        raise HTTPException(409, detail='门锁状态不可用。')
    if entity_state.get('state') in LOCK_BUSY_STATES:
        raise HTTPException(409, detail='门锁正在动作，请稍后重试。')
    state_attributes = entity_state.get('attributes') or {}
    supported_features = state_attributes.get('supported_features', 0)
    if service == 'open' and (
        type(supported_features) is not int or not supported_features & LOCK_OPEN_FEATURE_BIT
    ):
        raise HTTPException(422, detail='该门锁不支持释放锁舌。')
    entry_code = command_params.get('code')
    if entry_code is not None and (not isinstance(entry_code, str) or not 1 <= len(entry_code) <= MAX_LOCK_CODE_LENGTH):
        raise HTTPException(422, detail='门锁密码格式无效。')
    if state_attributes.get('code_format') and not entry_code:
        raise HTTPException(422, detail='此门锁需要密码。')


__all__ = [
    'require_lock_model',
    'validate_lock_bindings',
    'validate_lock_command',
]
