"""Model binding and live HA capability checks for the 3D climate controls."""
from __future__ import annotations

import math

from fastapi import HTTPException

CLIMATE_SERVICES = {
    'set_temperature': 'temperature',
    'set_hvac_mode': 'hvac_mode',
    'set_fan_mode': 'fan_mode',
    'set_swing_mode': 'swing_mode',
    'set_swing_horizontal_mode': 'swing_horizontal_mode',
    'set_preset_mode': 'preset_mode',
}


def require_air_conditioner_model(bindings: list, entity_id: str, scene: dict, *, fan_model: str = 'airpurifier', model_type: str | tuple[str, ...] | None = None) -> None:
    """A saved model id, never a light-group id, anchors a climate binding."""
    floors = scene.get('floors', [])
    for binding in bindings:
        if binding.get('entityId', '') != entity_id:
            continue
        floor = next((item for item in floors if item.get('id') == binding.get('floorId')), None)
        if floor is None:
            continue
        models = [item for item in floor.get('scene', { }).get('items', []) if item.get('id') == binding.get('modelId')]
        allowed = (
            ({ model_type } if isinstance(model_type, str) else set(model_type)) if model_type
            else { 'wallac', 'floorac', 'airoutlet' } if binding.get('climateType') == 'bath-heater'
            else { fan_model } if entity_id.startswith('fan.')
            else { 'storagewaterheater', 'gaswaterheater' } if entity_id.startswith('water_heater.')
            else { 'wallac', 'floorac', 'airoutlet' }
        )
        if len(models) == 1 and models[0].get('type') in allowed:
            return
    raise HTTPException(409, detail='设备模型已失联，请在环境配置中重新选择模型。')


def _number(value) -> bool:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        try:
            return math.isfinite(value)
        except OverflowError:
            return False
    return False


def validate_climate_command(service: str, data: dict, state: dict | None) -> None:
    field = CLIMATE_SERVICES.get(service)
    power = service in { 'turn_on', 'turn_off' }
    temperature_fields = { 'temperature' } if set(data) == { 'temperature' } else { 'target_temp_low', 'target_temp_high' }
    if (
        (power and data)
        or (not power and (field is None or set(data) != (temperature_fields if service == 'set_temperature' else { field })))
    ):
        raise HTTPException(422, detail='3D 空调控制不支持此服务或参数。')
    if not state or state.get('available') is False or state.get('state') in { None, '', 'unknown', 'unavailable' }:
        raise HTTPException(409, detail='空调状态暂不可用，请等待设备重新连接。')
    attributes = state.get('attributes')
    if not isinstance(attributes, dict):
        raise HTTPException(409, detail='空调能力尚未载入，请稍后重试。')
    features = attributes.get('supported_features')
    declared = isinstance(features, int) and not isinstance(features, bool) and features >= 0

    def supports(bit: int, legacy: bool = False) -> bool:
        """HA 能力码声明了 ``supported_features`` 时按位判断；没声明（旧版/精简集成）时退回调用方给出的经验判据。"""
        return bool(features & bit) if declared else legacy

    if power:
        if not supports(256 if service == 'turn_on' else 128):
            raise HTTPException(422, detail='空调未提供有效的开机能力。' if service == 'turn_on' else '空调未提供有效的关机能力。')
        return
    if service == 'set_temperature':
        is_range = temperature_fields != { 'temperature' }
        legacy = all(_number(attributes.get(key)) for key in temperature_fields)
        minimum, maximum = attributes.get('min_temp'), attributes.get('max_temp')
        step = attributes.get('target_temp_step')
        if (
            not supports(2 if is_range else 1, legacy)
            or not all(_number(v) for v in (minimum, maximum))
            or minimum >= maximum
            or (step is not None and (not _number(step) or step <= 0))
        ):
            raise HTTPException(409, detail='空调未提供有效的温度调节能力。')
        for value in data.values():
            if not _number(value) or not minimum <= value <= maximum:
                raise HTTPException(422, detail='目标温度超出空调支持的范围。')
            if step is None:
                continue
            increments = (value - minimum) / step
            if not (math.isfinite(increments) and math.isclose(increments, round(increments), abs_tol=1e-06)):
                raise HTTPException(422, detail='目标温度不符合空调支持的调节步长。')
        if is_range and data['target_temp_low'] > data['target_temp_high']:
            raise HTTPException(422, detail='温区下限不能高于上限。')
        return
    options = {
        'hvac_mode': ('hvac_modes', None),
        'fan_mode': ('fan_modes', 8),
        'swing_mode': ('swing_modes', 32),
        'swing_horizontal_mode': ('swing_horizontal_modes', 512),
        'preset_mode': ('preset_modes', 16),
    }
    attribute, feature = options[field]
    value, choices = data[field], attributes.get(attribute)
    if (
        (feature is not None and not supports(feature, isinstance(choices, list)))
        or not isinstance(value, str)
        or not isinstance(choices, list)
        or not value
        or value not in choices
    ):
        raise HTTPException(422, detail='该模式不在空调当前支持的选项中。')
    return
