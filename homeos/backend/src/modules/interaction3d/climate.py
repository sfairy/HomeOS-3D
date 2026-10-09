"""3D 气候控件的模型绑定与 HA 实时能力校验。

两道校验缺一不可：``require_air_conditioner_model`` 是配置侧，确认控件绑定的空调模型此刻
仍在场景中；``validate_climate_command`` 是运行侧，按 HA 实时上报的 ``supported_features``
与温度区间，判断这次服务调用到底能不能执行。两份依据都不信前端。
"""
from __future__ import annotations

import math

from fastapi import HTTPException

from .capabilities import attribute_number, feature_flags, string_options

# 允许透传的服务 → 该服务唯一允许出现的参数名。
# 表里没有的服务，以及夹带其它参数（如同时给 temperature 与 hvac_mode）的请求一律拒绝。
#
# turn_on / turn_off 不在表里：它们是无参数服务，单独在 validate_climate_command 里按
# supported_features 位（ClimateEntityFeature.TURN_ON / TURN_OFF）放行 —— 空调关机时
# HA 上报的 state 就是 off，用户最后选的 cool / heat 不再上报，于是 3D 面板在「没有可
# 恢复模式」时（全新浏览器、清过存储、首次使用这台空调）会发 turn_on 让设备自己回到
# 默认模式。少了这条分支，用户看到的是「按了开启没反应」。
CLIMATE_SERVICES = {
    'set_temperature': 'temperature',
    'set_hvac_mode': 'hvac_mode',
    'set_fan_mode': 'fan_mode',
    'set_swing_mode': 'swing_mode',
    'set_swing_horizontal_mode': 'swing_horizontal_mode',
    'set_preset_mode': 'preset_mode',
}


def require_air_conditioner_model(bindings: list, entity_id: str, scene: dict, *, fan_model: str = 'airpurifier', model_type: str | tuple[str, ...] | None = None) -> None:
    """气候绑定锚定的是已保存的模型 id，绝不是灯组 id。

    有效绑定要同时成立三点：楼层存在、模型 ID 在该楼层唯一、类型在允许的外观集合里。
    只比模型 ID 不够 —— ID 可能被其它类型的模型复用，那样点下去控制的就是一个已被替换掉的模型。
    """
    floors = scene.get('floors', [])
    for binding in bindings:
        if binding.get('entityId', '') != entity_id:
            continue
        floor = next((item for item in floors if item.get('id') == binding.get('floorId')), None)
        if floor is None:
            continue
        # 同 ID 的模型必须恰好一个：出现重复时无法确定控制哪一台，宁可不放行。
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
    """本次服务调用传来的值是否为有限实数。

    只接受 int / float（bool 是 int 子类须排除），字符串说明调用方用错了类型，不替它转换
    （与窗帘那边读 HA 属性、接受数字字符串的口径刻意不同）。
    """
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
    # 能力位经 capabilities.feature_flags 归一：字符串 / 负数 / bool 一律按「没有此能力位」处理。
    features = feature_flags(attributes)
    # 是否真的上报过 supported_features：没上报时 supports() 退化为旧版集成的属性判据。
    declared = 'supported_features' in attributes

    def supports(bit: int, legacy: bool = False) -> bool:
        """HA 能力码声明了 ``supported_features`` 时按位判断；没声明（旧版/精简集成）时退回调用方给出的经验判据。"""
        return bool(features & bit) if declared else legacy

    if power:
        if not supports(256 if service == 'turn_on' else 128):
            raise HTTPException(422, detail='空调未提供有效的开机能力。' if service == 'turn_on' else '空调未提供有效的关机能力。')
        return
    if service == 'set_temperature':
        # 温度区间与步长都来自 HA 属性；step 缺失时不做刻度校验（温区形式的空调通常没有 step）。
        is_range = temperature_fields != { 'temperature' }
        legacy = all(attribute_number(attributes.get(key)) is not None for key in temperature_fields)
        minimum, maximum = (attribute_number(attributes.get(key)) for key in ('min_temp', 'max_temp'))
        raw_step = attributes.get('target_temp_step')
        step = attribute_number(raw_step)
        # 调温能力的证据有两条：HA 上报了 numeric 位（TARGET_TEMPERATURE = 1，温区形式是
        # TARGET_TEMPERATURE_RANGE = 2），或旧版集成直接上报了 temperature / target_temp_* 属性。
        if (
            not supports(2 if is_range else 1, legacy)
            or not all(_number(v) for v in (minimum, maximum))
            or minimum >= maximum
            or (raw_step is not None and (step is None or step <= 0))
        ):
            raise HTTPException(409, detail='空调未提供有效的温度调节能力。')
        # 先挡越界值，再挡不在刻度上的值，两类错误分别给不同提示。
        for value in data.values():
            if not _number(value) or not minimum <= value <= maximum:
                raise HTTPException(422, detail='目标温度超出空调支持的范围。')
            # 上报了 step 才校验刻度：目标温度必须落在「从 min_temp 起、以 step 为间隔」的
            # 刻度上，否则设备会四舍五入到别的值，表现为「点了没反应」。
            if step is None:
                continue
            increments = (value - minimum) / step
            # abs_tol=1e-6 容忍浮点误差（26.5 这类值在二进制下无法精确表示）。
            if not (math.isfinite(increments) and math.isclose(increments, round(increments), abs_tol=1e-06)):
                raise HTTPException(422, detail='目标温度不符合空调支持的调节步长。')
        if is_range and data['target_temp_low'] > data['target_temp_high']:
            raise HTTPException(422, detail='温区下限不能高于上限。')
        return
    # 模式类服务：取值必须命中 HA 当前上报的候选列表，且设备声明了对应的能力位
    # （没声明能力位的旧版集成退化为「候选列表非空」）。feature 为 None 表示该模式
    # 在 HA 里没有独立能力位（hvac_mode），只看候选列表。
    options = {
        'hvac_mode': ('hvac_modes', None),
        'fan_mode': ('fan_modes', 8),
        'swing_mode': ('swing_modes', 32),
        'swing_horizontal_mode': ('swing_horizontal_modes', 512),
        'preset_mode': ('preset_modes', 16),
    }
    attribute, feature = options[field]
    value, choices = data[field], string_options(attributes.get(attribute))
    if (
        (feature is not None and not supports(feature, isinstance(choices, list)))
        or not isinstance(value, str)
        or not isinstance(choices, list)
        or not value
        or value not in choices
    ):
        raise HTTPException(422, detail='该模式不在空调当前支持的选项中。')
    return
