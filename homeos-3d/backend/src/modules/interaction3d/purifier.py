import math

from fastapi import HTTPException

EXTRA_TYPES = {
    'switch': 'switch',
    'input_boolean': 'switch',
    'light': 'switch',
    'fan': 'switch',
    'select': 'select',
    'input_select': 'select',
    'number': 'number',
    'input_number': 'number',
    'button': 'button',
    'input_button': 'button',
    'sensor': 'state',
    'binary_sensor': 'state',
}


def validate_extra_command(extra, domain, service, data, state):
    kind = EXTRA_TYPES.get(domain, 'state')
    if not extra or extra.get('entityId', '').split('.')[0] != domain or kind == 'state':
        raise HTTPException(422, detail='此实体不支持配置的控制类型。')
    if not state or state.get('available') is False or state.get('state') in (None, '', 'unknown', 'unavailable'):
        raise HTTPException(409, detail='附加实体当前不可用。')
    attrs = state.get('attributes') or { }
    if kind == 'switch' and domain == 'fan' and service == 'set_percentage':
        validate_purifier_command(service, data, state, name='风干')
        return
    if kind == 'switch' and domain == 'light' and service == 'turn_on' and len(data) == 1:
        modes = attrs.get('supported_color_modes') or []
        key, value = next(iter(data.items()))
        numeric = type(value) in (int, float) and math.isfinite(value)
        if (
            key == 'brightness'
            and numeric
            and 1 <= value <= 255
            and any(mode not in ('onoff', 'unknown') for mode in modes)
        ):
            return
        low, high = attrs.get('min_color_temp_kelvin'), attrs.get('max_color_temp_kelvin')
        if (
            key == 'color_temp_kelvin'
            and numeric
            and 'color_temp' in modes
            and type(low) in (int, float)
            and type(high) in (int, float)
            and low <= value <= high
        ):
            return
    if kind == 'switch' and service in ('turn_on', 'turn_off') and not data:
        return
    if kind == 'button' and service == 'press' and not data:
        return
    if (
        kind == 'select'
        and service == 'select_option'
        and set(data) == {'option'}
        and data['option'] in (attrs.get('options') or [])
    ):
        return
    if kind == 'number' and service == 'set_value' and set(data) == {'value'}:
        value, low, high, step = (
            data['value'],
            attrs.get('min'),
            attrs.get('max'),
            attrs.get('step', 1),
        )
        if (
            all(
                isinstance(n, (int, float)) and not isinstance(n, bool) and math.isfinite(n)
                for n in (value, low, high, step)
            )
            and step > 0
            and low <= value <= high
            and abs((value - low) / step - round((value - low) / step)) < 1e-5
        ):
            return
    raise HTTPException(422, detail='附加实体不支持此操作或参数。')


def validate_purifier_command(service, data, state, *, name='空气净化器'):
    if not state or state.get('available') is False or state.get('state') not in ('on', 'off'):
        raise HTTPException(409, detail=f'{name}当前不可用。')
    attrs = state.get('attributes') or { }
    features = attrs.get('supported_features', 0)
    features = features if isinstance(features, int) else 0
    if (
        service == 'oscillate'
        and set(data) == {'oscillating'}
        and isinstance(data['oscillating'], bool)
        and features & 2
    ):
        return
    if (
        service == 'set_direction'
        and set(data) == {'direction'}
        and data['direction'] in ('forward', 'reverse')
        and features & 4
    ):
        return
    if service in ('turn_on', 'turn_off') and not data:
        return
    if (
        service == 'set_preset_mode'
        and ('supported_features' not in attrs or features & 8)
        and set(data) == {'preset_mode'}
        and data['preset_mode'] in (attrs.get('preset_modes') or [])
    ):
        return
    if service == 'set_percentage' and set(data) == {'percentage'}:
        value = data['percentage']
        features = attrs.get('supported_features', 0)
        if (
            isinstance(value, (int, float))
            and not isinstance(value, bool)
            and math.isfinite(value)
            and 0 <= value <= 100
            and (features & 1 if 'supported_features' in attrs else attrs.get('percentage') is not None)
        ):
            return
    raise HTTPException(422, detail=f'{name}不支持此操作或参数。')
