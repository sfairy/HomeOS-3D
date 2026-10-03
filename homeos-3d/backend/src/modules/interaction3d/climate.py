"""Model binding and live HA capability checks for the 3D climate controls."""
# [补充说明] 3D 空调控件的模型绑定与 HA 实时能力校验。
#
# 两道校验缺一不可：
# 1. require_air_conditioner_model —— 配置侧，确认控件绑定的空调模型此刻仍在场景中；
# 2. validate_climate_command —— 运行侧，按 HA 实时上报的 supported_features 与温度区间，
# 判断这次服务调用到底能不能执行。
#
# 两份依据都不信前端：模型来自服务端场景文件，能力来自 HA 实时状态。
from __future__ import annotations

import math

from fastapi import HTTPException

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
    """A saved model id, never a light-group id, anchors a climate binding."""
    # [补充说明] 确认实体绑定的空调模型仍唯一存在于场景中。
    #
    # 有效绑定要同时成立三点：楼层存在、模型 ID 在该楼层唯一、类型在允许的外观集合里。
    # 只比模型 ID 不够 —— ID 可能被其它类型的模型复用，那样点下去控制的
    # 就是一个已被替换掉的模型。允许的外观集合随绑定的 climateType 与实体前缀而变：
    # 浴霸是墙面/地面/出风口三种空调外观，fan. 开头的是净化器（外观名由调用方通过
    # fan_model 传入），water_heater. 开头的是储水式/燃气式热水器，其余仍是空调三外观。
    #
    # 异常:
    # HTTPException: 409，找不到合法绑定（模型被删或类型变了）。
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
    # [补充说明] 本次服务调用传来的值是否为有限实数。
    #
    # 只接受 int / float（bool 是 int 子类须排除），字符串说明调用方用错了类型，
    # 不替它转换（与窗帘那边读 HA 属性、接受数字字符串的口径刻意不同）。
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        try:
            return math.isfinite(value)
        except OverflowError:
            return False
    return False


def validate_climate_command(service: str, data: dict, state: dict | None) -> None:
    # [补充说明] 校验一次空调服务调用是否被当前设备能力支持。
    #
    # 参数:
    # service: HA 服务名，必须命中 CLIMATE_SERVICES 或 turn_on / turn_off。
    # data: 透传参数，必须恰好只带该服务对应的键（开关机服务则必须为空）。
    # state: 实体的实时状态快照，缺失视为设备不可用。
    # 异常:
    # HTTPException: 422 参数或取值超出设备能力；409 状态不可用或能力尚未载入。
    # 白名单式校验：带参数的服务要在表里且 data 恰好只有对应的键；
    # set_temperature 既可能是单值 temperature，也可能是 target_temp_low/high 温区对；
    # turn_on / turn_off 是无参数服务，只允许空 data。
    field = CLIMATE_SERVICES.get(service)
    power = service in { 'turn_on', 'turn_off' }
    temperature_fields = { 'temperature' } if set(data) == { 'temperature' } else { 'target_temp_low', 'target_temp_high' }
    if (
        (power and data)
        or (not power and (field is None or set(data) != (temperature_fields if service == 'set_temperature' else { field })))
    ):
        raise HTTPException(422, detail='3D 空调控制不支持此服务或参数。')
    # unknown / unavailable 与空状态同等对待，不去猜设备的真实状态。
    # 这一层对开关机同样适用：设备失联时「开启」也不该假装成功。
    if not state or state.get('available') is False or state.get('state') in { None, '', 'unknown', 'unavailable' }:
        raise HTTPException(409, detail='空调状态暂不可用，请等待设备重新连接。')
    attributes = state.get('attributes')
    if not isinstance(attributes, dict):
        raise HTTPException(409, detail='空调能力尚未载入，请稍后重试。')
    features = attributes.get('supported_features')
    declared = isinstance(features, int) and not isinstance(features, bool) and features >= 0

    def supports(bit: int, legacy: bool = False) -> bool:
        return bool(features & bit) if declared else legacy

    if power:
        if not supports(256 if service == 'turn_on' else 128):
            raise HTTPException(422, detail='空调未提供有效的开机能力。' if service == 'turn_on' else '空调未提供有效的关机能力。')
        return
    if service == 'set_temperature':
        # 温度区间与步长都来自 HA 属性；step 缺失时不做刻度校验（温区形式的空调通常没有 step）。
        is_range = temperature_fields != { 'temperature' }
        legacy = all(_number(attributes.get(key)) for key in temperature_fields)
        minimum, maximum = attributes.get('min_temp'), attributes.get('max_temp')
        step = attributes.get('target_temp_step')
        # 调温能力的证据有两条：HA 上报了 numeric 位（TARGET_TEMPERATURE = 1，温区形式是
        # TARGET_TEMPERATURE_RANGE = 2），或旧版集成直接上报了 temperature / target_temp_* 属性。
        if (
            not supports(2 if is_range else 1, legacy)
            or not all(_number(v) for v in (minimum, maximum))
            or minimum >= maximum
            or (step is not None and (not _number(step) or step <= 0))
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
