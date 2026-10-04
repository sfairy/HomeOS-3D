'''原生 HA 热水器控件的实时能力校验。'''
import math

from fastapi import HTTPException

from .climate import _number


def validate_water_heater_command(service, data, state):
    if not state or state.get('available') is False or state.get('state') in (None, '', 'unknown', 'unavailable'):
        raise HTTPException(409, detail = '热水器当前不可用，请等待设备重新连接。')
    attrs = state.get('attributes') or { }
    features = attrs.get('supported_features')
    declared = 'supported_features' in attrs

    def supports(bit, legacy=False):
        return (type(features) is int and features >= 0 and bool(features & bit)) if declared else legacy

    if service == 'set_away_mode' and set(data) == {'away_mode'} and supports(4) and type(data['away_mode']) is bool:
        return
    if service in ('turn_on', 'turn_off') and not data and supports(8):
        return
    if service == 'set_operation_mode' and set(data) == {'operation_mode'}:
        modes = attrs.get('operation_list')
        value = data['operation_mode']
        if supports(2, isinstance(modes, list) and bool(modes)) and isinstance(value, str) and value.strip() and isinstance(modes, list) and value in modes:
            return
    if service == 'set_temperature' and set(data) == {'temperature'}:
        value, low, high = data['temperature'], attrs.get('min_temp'), attrs.get('max_temp')
        step = attrs.get('target_temp_step') if attrs.get('target_temp_step') is not None else 0.5
        supported = supports(1, _number(attrs.get('temperature')))
        if (
            supported
            and all(_number(n) for n in (value, low, high, step))
            and low is not None and high is not None and step is not None
            and low < high and step > 0 and low <= value <= high
        ):
            increments = (value - low) / step
            if math.isfinite(increments) and math.isclose(increments, round(increments), abs_tol=1e-06):
                return
    raise HTTPException(422, detail = '热水器不支持此操作、温度范围或调节步长。')
