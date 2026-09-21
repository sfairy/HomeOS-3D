"""3D 空调控件的模型绑定与 HA 实时能力校验。

两道校验缺一不可：
1. require_air_conditioner_model —— 配置侧，确认控件绑定的空调模型此刻仍在场景中；
2. validate_climate_command —— 运行侧，按 HA 实时上报的 supported_features 与温度区间，
   判断这次服务调用到底能不能执行。

两份依据都不信前端：模型来自服务端场景文件，能力来自 HA 实时状态。
"""
from __future__ import annotations

import math

from fastapi import HTTPException, status

from .numbers import as_finite_number

# 允许透传的服务 → 该服务唯一允许出现的参数名；``None`` 表示该服务**不带参数**。
# 表里没有的服务，以及夹带其它参数（如同时给 temperature 与 hvac_mode）的请求一律拒绝。
#
# ``turn_on`` 必须留在表里，这不是预留：空调关机时 HA 上报的 state 就是 ``off``，
# 用户最后选的 cool / heat 不再上报，于是 3D 面板在「没有可恢复模式」时（全新浏览器、
# 清过存储、首次使用这台空调）会发 ``turn_on`` 让设备自己回到默认模式 —— 这正是
# ``supported_features`` 第 7 位（ClimateEntityFeature.TURN_ON）的语义，前端也有对应的
# ``turnOnSupported`` 分支。少了这一条，这条路会在两层白名单上各撞一次（本表 422、
# ``ha.ALLOWED_SERVICES`` 403），用户看到的是「按了开启没反应」，而唯一出路是先让这台
# 空调在别处开过一次，好让模式历史被记下来。
#
# 刻意**不**登记 ``climate.turn_off``：前端关机走 ``set_hvac_mode: off``，设备没有 off
# 模式时退到 ``homeassistant.toggle``（``climate`` 在 ``TOGGLE_ENTITY_DOMAINS`` 里），
# 永远不会构造这个服务。白名单只登记真正可达的取值。
CLIMATE_SERVICES = {
    'set_temperature': 'temperature',
    'set_hvac_mode': 'hvac_mode',
    'set_fan_mode': 'fan_mode',
    'set_swing_mode': 'swing_mode',
    'turn_on': None,
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
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='空调模型已失联，请在环境配置中重新选择模型。')


def _number(value) -> bool:
    """本次服务调用传来的值是否为有限实数。

    ``from_text=False``：读的是前端发来的 JSON 参数，字符串说明调用方用错了类型，
    不替它转换（与窗帘那边读 HA 属性、接受数字字符串的口径刻意不同）。
    """
    return as_finite_number(value, from_text = False) is not None


def validate_climate_command(service: str, data: dict, state: dict | None) -> None:
    """校验一次空调服务调用是否被当前设备能力支持。

    参数:
        service: HA 服务名，必须命中 CLIMATE_SERVICES。
        data: 透传参数，必须恰好只带该服务对应的那一个键（无参数服务则必须为空）。
        state: 实体的实时状态快照，缺失视为设备不可用。
    异常:
        HTTPException: 422 参数或取值超出设备能力；409 状态不可用或能力尚未载入。
    """
    # 白名单式校验：服务要在表里，data 也必须恰好只有它对应的那个键（或一个键都没有）。
    # 先判「在不在表里」再取参数名：``None`` 现在是「无参数服务」的合法取值，
    # 用 ``.get()`` 的返回值同时表达「不在表里」会分不清这两件事。
    if service not in CLIMATE_SERVICES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='3D 空调控制不支持此服务。')
    parameter = CLIMATE_SERVICES[service]
    expected_fields = set() if parameter is None else {parameter}
    if set(data) != expected_fields:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='3D 空调控制不支持此服务或参数。')
    # unknown / unavailable 与空状态同等对待，不去猜设备的真实状态。
    # 这一层对开关机同样适用：设备失联时「开启」也不该假装成功。
    if not state or state.get('available') is False or state.get('state') in {None, '', 'unknown', 'unavailable'}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='空调状态暂不可用，请等待设备重新连接。')
    # 开关机是无参数服务，也不需要读 attributes：回到哪个模式由设备自己决定。
    if parameter is None:
        return None
    attributes = state.get('attributes')
    if not isinstance(attributes, dict):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='空调能力尚未载入，请稍后重试。')
    value = data[parameter]
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
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='空调未提供有效的温度调节能力。')
        # 先挡越界值，再挡不在刻度上的值，两类错误分别给不同提示。
        if not _number(value) or not minimum <= value <= maximum:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='目标温度超出空调支持的范围。')
        # 目标温度必须落在「从 min_temp 起、以 step 为间隔」的刻度上，
        # 否则设备会四舍五入到别的值，表现为「点了没反应」。
        increments = (value - minimum) / step
        # abs_tol=1e-6 容忍浮点误差（26.5 这类值在二进制下无法精确表示）。
        if not (math.isfinite(increments) and math.isclose(increments, round(increments), abs_tol=1e-06)):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='目标温度不符合空调支持的调节步长。')
        return None
    # 模式类服务：取值必须命中 HA 当前上报的候选列表（hvac_modes / fan_modes / swing_modes）。
    choices = attributes.get({'hvac_mode': 'hvac_modes', 'fan_mode': 'fan_modes', 'swing_mode': 'swing_modes'}[parameter])
    if not isinstance(value, str) or not isinstance(choices, list) or not value or value not in choices:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='该模式不在空调当前支持的选项中。')
    return None
