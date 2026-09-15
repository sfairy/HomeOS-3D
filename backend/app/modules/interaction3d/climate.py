"""3D 空调控件的模型绑定与 HA 实时能力校验。

两道校验缺一不可：
1. require_air_conditioner_model —— 配置侧，确认控件绑定的空调模型此刻仍在场景中；
2. validate_climate_command —— 运行侧，按 HA 实时上报的 supported_features 与温度区间，
   判断这次服务调用到底能不能执行。

两份依据都不信前端：模型来自服务端场景文件，能力来自 HA 实时状态。
"""
from __future__ import annotations

import math

from fastapi import HTTPException

# 允许透传的服务 → 该服务唯一允许出现的参数名；
# 表里没有的服务，以及夹带其它参数（如同时给 temperature 与 hvac_mode）的请求一律拒绝。
CLIMATE_SERVICES = {
    'set_temperature': 'temperature',
    'set_hvac_mode': 'hvac_mode',
    'set_fan_mode': 'fan_mode',
    'set_swing_mode': 'swing_mode',
}


def require_air_conditioner_model(bindings: list, entity_id: str, scene: dict) -> None:
    """确认实体绑定的空调模型仍唯一存在于场景中。

    有效绑定要同时成立三点：楼层存在、模型 ID 在该楼层唯一、类型属于三种空调外观之一。
    只比模型 ID 不够 —— ID 可能被其它类型的模型复用，那样点下去控制的
    就是一个已被替换掉的模型。

    异常:
        HTTPException: 409，找不到合法绑定（模型被删或类型变了）。
    """
    floors = scene.get('floors', [])
    for binding in bindings:
        if binding.get('entityId') != entity_id:
            continue
        floor = next((item for item in floors if item.get('id') == binding.get('floorId')), None)
        if floor is None:
            continue
        # 同 ID 的模型必须恰好一个：出现重复时无法确定控制哪一台，宁可不放行。
        models = [item for item in floor.get('scene', {}).get('items', []) if item.get('id') == binding.get('modelId')]
        if len(models) == 1 and models[0].get('type') in {'wallac', 'floorac', 'airoutlet'}:
            return None
    raise HTTPException(status_code=409, detail='空调模型已失联，请在环境配置中重新选择模型。')


def _number(value) -> bool:
    """判断是否为有限实数。

    bool 是 int 的子类，必须单独排除，否则 True 会被当成 1 参与范围比较。
    """
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return False
    try:
        # 超大整数转 float 会溢出并让 isfinite 抛 OverflowError，这里兜住不退到路由层。
        return math.isfinite(value)
    except OverflowError:
        return False


def validate_climate_command(service: str, data: dict, state: dict | None) -> None:
    """校验一次空调服务调用是否被当前设备能力支持。

    参数:
        service: HA 服务名，必须命中 CLIMATE_SERVICES。
        data: 透传参数，必须恰好只带该服务对应的那一个键。
        state: 实体的实时状态快照，缺失视为设备不可用。

    异常:
        HTTPException: 422 参数或取值超出设备能力；409 状态不可用或能力尚未载入。
    """
    field = CLIMATE_SERVICES.get(service)
    # 白名单式校验：服务要在表里，data 也必须恰好只有它对应的那个键。
    if field is None or set(data) != {field}:
        raise HTTPException(status_code=422, detail='3D 空调控制不支持此服务或参数。')
    # unknown / unavailable 与空状态同等对待，不去猜设备的真实状态。
    if not state or state.get('available') is False or state.get('state') in {None, '', 'unknown', 'unavailable'}:
        raise HTTPException(status_code=409, detail='空调状态暂不可用，请等待设备重新连接。')
    attributes = state.get('attributes')
    if not isinstance(attributes, dict):
        raise HTTPException(status_code=409, detail='空调能力尚未载入，请稍后重试。')
    value = data[field]
    if service == 'set_temperature':
        # 温度区间与步长都来自 HA 属性；集成不上报 step 时按 HA 常见的 0.5 兜底。
        minimum, maximum = attributes.get('min_temp'), attributes.get('max_temp')
        step = attributes.get('target_temp_step', 0.5)
        features = attributes.get('supported_features', 0)
        # 有调温能力的两条等价证据：已上报 temperature 属性，或 supported_features 第 0 位
        # （HA 的 TARGET_TEMPERATURE = 1）。两者都无，说明这台设备不能设定温度。
        has_temperature = _number(attributes.get('temperature')) or (
            isinstance(features, int) and not isinstance(features, bool) and bool(features & 1)
        )
        if (
            not has_temperature
            or not all(_number(item) for item in (minimum, maximum, step))
            or minimum >= maximum
            or step <= 0
        ):
            raise HTTPException(status_code=409, detail='空调未提供有效的温度调节能力。')
        # 先挡越界值，再挡不在刻度上的值，两类错误分别给不同提示。
        if not _number(value) or not minimum <= value <= maximum:
            raise HTTPException(status_code=422, detail='目标温度超出空调支持的范围。')
        # 目标温度必须落在「从 min_temp 起、以 step 为间隔」的刻度上，
        # 否则设备会四舍五入到别的值，表现为「点了没反应」。
        increments = (value - minimum) / step
        # abs_tol=1e-6 容忍浮点误差（26.5 这类值在二进制下无法精确表示）。
        if not (math.isfinite(increments) and math.isclose(increments, round(increments), abs_tol=1e-06)):
            raise HTTPException(status_code=422, detail='目标温度不符合空调支持的调节步长。')
        return None
    # 模式类服务：取值必须命中 HA 当前上报的候选列表（hvac_modes / fan_modes / swing_modes）。
    choices = attributes.get({'hvac_mode': 'hvac_modes', 'fan_mode': 'fan_modes', 'swing_mode': 'swing_modes'}[field])
    if not isinstance(value, str) or not isinstance(choices, list) or not value or value not in choices:
        raise HTTPException(status_code=422, detail='该模式不在空调当前支持的选项中。')
    return None
