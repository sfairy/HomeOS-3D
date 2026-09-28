"""3D 空调控件的模型绑定与 HA 实时能力校验。
"""
from __future__ import annotations

import math

from fastapi import HTTPException, status

from .numbers import as_finite_number

# 允许透传的服务 → 该服务唯一允许出现的参数名；``None`` 表示该服务**不带参数**。
CLIMATE_SERVICES = {
    'set_temperature': 'temperature',
    'set_hvac_mode': 'hvac_mode',
    'set_fan_mode': 'fan_mode',
    'set_swing_mode': 'swing_mode',
    'turn_on': None,
}


def require_air_conditioner_model(bindings: list, entity_id: str, scene: dict) -> None:
    """确认实体绑定的空调模型仍唯一存在于场景中。
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
    """
    return as_finite_number(value, from_text = False) is not None


def validate_climate_command(service: str, data: dict, state: dict | None) -> None:
    """校验一次空调服务调用是否被当前设备能力支持。
    """
    # 白名单式校验：服务要在表里，data 也必须恰好只有它对应的那个键（或一个键都没有）。
    if service not in CLIMATE_SERVICES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='3D 空调控制不支持此服务。')
    parameter = CLIMATE_SERVICES[service]
    expected_fields = set() if parameter is None else {parameter}
    if set(data) != expected_fields:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='3D 空调控制不支持此服务或参数。')
    # unknown / unavailable 与空状态同等对待，不去猜设备的真实状态。
    # 与 lock/purifier/cover 同一口径：非 dict（含 None）、available=False、残缺 state 一律 409。
    if not isinstance(state, dict) or state.get('available') is False or state.get('state') in (
        None,
        '',
        'unknown',
        'unavailable',
    ):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='空调状态暂不可用，请等待设备重新连接。')
    # 无参数服务（当前只有 turn_on）：上游要求设备自己声明开机能力 ——
    if parameter is None:
        attributes = state.get('attributes')
        if not isinstance(attributes, dict):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='空调能力尚未载入，请稍后重试。')
        features = attributes.get('supported_features', 0)
        # bool 是 int 的子类，要挡掉：True 会被当成 features = 1。
        has_turn_on = (
            isinstance(features, int) and not isinstance(features, bool) and bool(features & 256)
        )
        if not has_turn_on:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='空调未提供有效的开机能力。'
            )
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
        increments = (value - minimum) / step
        # abs_tol=1e-6 容忍浮点误差（26.5 这类值在二进制下无法精确表示）。
        if not (math.isfinite(increments) and math.isclose(increments, round(increments), abs_tol=1e-06)):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='目标温度不符合空调支持的调节步长。')
        return None
    choices = attributes.get({'hvac_mode': 'hvac_modes', 'fan_mode': 'fan_modes', 'swing_mode': 'swing_modes'}[parameter])
    if not isinstance(value, str) or not isinstance(choices, list) or not value or value not in choices:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='该模式不在空调当前支持的选项中。')
    return None
