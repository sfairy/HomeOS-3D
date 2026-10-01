import math

from fastapi import HTTPException

# 域 -> 附加实体支持的控制类型。'state' 表示只读：能显示状态，不能下命令。
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
    # 配置里记的实体域必须和本次调用的域一致：对不上说明前端拿错了绑定。
    # 'state' 类实体（sensor / binary_sensor）根本不接受命令，直接拒。
    if not extra or extra.get('entityId', '').split('.')[0] != domain or kind == 'state':
        raise HTTPException(422, detail='此实体不支持配置的控制类型。')
    if not state or state.get('available') is False or state.get('state') in (None, '', 'unknown', 'unavailable'):
        raise HTTPException(409, detail='附加实体当前不可用。')
    attrs = state.get('attributes') or { }
    # 风扇类的风速命令带风干语义，交给净化器校验器复核同一套能力位。
    if kind == 'switch' and domain == 'fan' and service == 'set_percentage':
        validate_purifier_command(service, data, state, name='风干')
        return
    # 灯类：turn_on 只带一个参数时，亮度/色温必须落在设备上报的范围内。
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
    # 开关类：turn_on / turn_off 不带参数。
    if kind == 'switch' and service in ('turn_on', 'turn_off') and not data:
        return
    # 按钮类：press 不带参数。
    if kind == 'button' and service == 'press' and not data:
        return
    # 下拉类：选项必须在设备上报的 options 里，防止写入设备不认识的值。
    if (
        kind == 'select'
        and service == 'select_option'
        and set(data) == {'option'}
        and data['option'] in (attrs.get('options') or [])
    ):
        return
    # 数值类：必须落在 min~max 且与 step 对齐（HA 的 number 集成对步长是强校验的，
    # 这里先拦一道，避免设备端报错后前端只看到一个笼统的失败）。
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
    # 位掩码必须是真正的整数：上报成字符串时按 0 处理，让「不确定」表现为「不支持」，
    # 而不是让 & 在字符串上抛 TypeError。
    features = features if isinstance(features, int) else 0
    # 摆动：bit 1（OSCILLATE）。
    if (
        service == 'oscillate'
        and set(data) == {'oscillating'}
        and isinstance(data['oscillating'], bool)
        and features & 2
    ):
        return
    # 风向前后吹：bit 2（DIRECTION）。
    if (
        service == 'set_direction'
        and set(data) == {'direction'}
        and data['direction'] in ('forward', 'reverse')
        and features & 4
    ):
        return
    if service in ('turn_on', 'turn_off') and not data:
        return
    # 预设模式：bit 3（PRESET_MODE）；没上报 supported_features 时退化为「选项表里有就放行」。
    if (
        service == 'set_preset_mode'
        and ('supported_features' not in attrs or features & 8)
        and set(data) == {'preset_mode'}
        and data['preset_mode'] in (attrs.get('preset_modes') or [])
    ):
        return
    # 风速百分比：bit 0（PERCENTAGE）；没上报能力位时看设备是否给过 percentage 属性。
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
