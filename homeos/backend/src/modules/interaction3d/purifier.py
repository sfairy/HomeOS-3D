"""附加实体的控制校验与净化器/风扇的能力校验。

附加实体（净化器的开关、灯、下拉、数值、按钮等）来自任意集成，属性写法不统一；
本模块统一走 ``capabilities`` 的安全解读入口，判不准就拒绝下发。
"""
from __future__ import annotations

import math

from fastapi import HTTPException

from .capabilities import (
    BRIGHTNESS_MODES,
    attribute_number,
    attributes_of,
    feature_flags,
    string_options,
)
from .climate import _number

#: 域 -> 附加实体支持的控制类型。'state' 表示只读：能显示状态，不能下命令。
#:
#: 0.7.8 把可控域从 12 个扩到 33 个：新增 ``text`` / ``date`` / ``time`` /
#: ``datetime`` / ``calendar`` / ``todo`` / ``weather`` / ``update`` 等服务型域、
#: ``camera`` / ``image`` 的画面域，以及 ``scene`` / 各类复合设备。表外的域只能
#: 以 ``state`` 形式挂上（只读展示）。
EXTRA_TYPES = {
    'camera': 'picture',
    'climate': 'panel',
    'cover': 'panel',
    'water_heater': 'panel',
    'media_player': 'panel',
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
#: 余下的可控域全部归入“整块面板”一类（参数由各自的 ``extra_*`` 校验）。
EXTRA_TYPES.update(
    dict.fromkeys(
        (
            'text',
            'date',
            'time',
            'datetime',
            'humidifier',
            'valve',
            'lawn_mower',
            'siren',
            'alarm_control_panel',
            'vacuum',
            'lock',
            'calendar',
            'todo',
            'weather',
            'update',
            'ai_task',
            'assist_satellite',
            'conversation',
            'notify',
            'remote',
            'tts',
            'image_processing',
            'stt',
            'wake_word',
            'infrared',
            'radio_frequency',
        ),
        'panel',
    )
)
EXTRA_TYPES['scene'] = 'button'
EXTRA_TYPES['image'] = 'picture'

#: 服务型附加卡的域（参数由 ``extra_services`` 校验）。
SERVICE_DOMAINS = frozenset(
    {
        'stt',
        'tts',
        'notify',
        'remote',
        'ai_task',
        'infrared',
        'wake_word',
        'conversation',
        'radio_frequency',
        'assist_satellite',
        'image_processing',
    }
)
#: 列表 / 预报 / 更新类附加卡的域（参数由 ``extra_lists`` 校验）。
LIST_DOMAINS = frozenset({'todo', 'update', 'weather', 'calendar'})
#: 没有专属主弹窗的复合设备（参数由 ``extra_devices`` 校验）。
DEVICE_DOMAINS = frozenset(
    {'siren', 'valve', 'vacuum', 'humidifier', 'lawn_mower', 'alarm_control_panel'}
)
#: 服务型域里"时间戳实体"的集合：这类实体常态就是 unknown，但依然可调用。
TIMESTAMP_UNKNOWN_DOMAINS = frozenset(
    {
        'stt',
        'tts',
        'notify',
        'ai_task',
        'infrared',
        'wake_word',
        'conversation',
        'radio_frequency',
    }
)


def validate_extra_command(extra, domain, service, data, state):
    kind = EXTRA_TYPES.get(domain, 'state')
    # 配置里记的实体域必须和本次调用的域一致：对不上说明前端拿错了绑定。
    # 'state' 类实体（sensor / binary_sensor）根本不接受命令；picture 只认摄像头。
    if (
        not extra
        or extra.get('entityId', '').split('.')[0] != domain
        or kind == 'state'
        or (kind == 'picture' and domain != 'camera')
    ):
        raise HTTPException(422, detail='此实体不支持配置的控制类型。')
    # 服务型时间戳实体（tts / notify …）常态是 unknown，仍算可用。
    timestamp_unknown = bool(
        state
        and state.get('state') == 'unknown'
        and domain in TIMESTAMP_UNKNOWN_DOMAINS
        and state.get('available') is not False
        and state.get('availabilityReason') == 'unknown'
    )
    # 按钮空闲时 state 常态就是 unknown，仍算可用；文本域允许空字符串（清空后的常态）。
    if (
        not state
        or (state.get('available') is False and not timestamp_unknown)
        or state.get('state') in (None, 'unavailable')
        or (state.get('state') == '' and domain != 'text')
        or (
            state.get('state') == 'unknown'
            and kind != 'button'
            and not timestamp_unknown
        )
    ):
        raise HTTPException(409, detail='附加实体当前不可用。')
    attrs = attributes_of(state)
    # 服务型域：服务名 / 参数各不相同，交给 extra_services。
    if domain in SERVICE_DOMAINS:
        from .extra_services import validate_service_extra

        validate_service_extra(domain, service, data, state)
        return
    # 列表 / 预报 / 更新：能力位与字段组合按域拆开。
    if domain in LIST_DOMAINS:
        from .extra_lists import validate_list_extra

        validate_list_extra(domain, service, data, state)
        return
    # 复合设备；气候域的 set_humidity 也走同一套湿度范围校验。
    if domain in DEVICE_DOMAINS or (domain == 'climate' and service == 'set_humidity'):
        from .extra_devices import validate_device_extra

        validate_device_extra(domain, service, data, state)
        return
    # 门锁：lock / unlock / open 的能力位与密码。
    if domain == 'lock':
        from .lock import validate_lock_command

        validate_lock_command(service, data, state)
        return
    # 摄像头：只有 bit 0（TURN_ON）且无参数时才允许开 / 关。
    if domain == 'camera':
        if feature_flags(attrs) & 1 and service in ('turn_on', 'turn_off') and not data:
            return
        raise HTTPException(422, detail='摄像头未提供此开关能力。')
    # 灯：完整颜色 / 色温 / 亮度面。
    if domain == 'light':
        from .extra_light import validate_light_extra

        validate_light_extra(domain, service, data, state)
        return
    # 文本 / 日期 / 时间 / 日期时间：由 extra_inputs 判格式。
    if domain in ('date', 'text', 'time', 'datetime'):
        from .extra_inputs import validate_input_command

        validate_input_command(domain, service, data, state)
        return
    # 场景：只允许无参数 turn_on。
    if domain == 'scene':
        if service == 'turn_on' and not data:
            return
        raise HTTPException(422, detail='场景只支持运行操作。')
    # 整块设备面板：气候 / 窗帘 / 热水器 / 音箱。
    if kind == 'panel':
        from .climate import validate_climate_command
        from .cover import validate_cover_command
        from .speaker import validate_speaker_command
        from .water_heater import validate_water_heater_command

        validators = {
            'climate': validate_climate_command,
            'cover': validate_cover_command,
            'water_heater': validate_water_heater_command,
            'media_player': validate_speaker_command,
        }
        validators[domain](service, data, state)
        return
    # 风扇类：整机交给净化器校验器复核同一套能力位（不只是风速那一条）。
    if kind == 'switch' and domain == 'fan':
        validate_purifier_command(service, data, state, name='风扇')
        return
    # 灯类：turn_on 只带一个参数时，亮度/色温必须落在设备上报的范围内。
    if kind == 'switch' and domain == 'light' and service == 'turn_on' and len(data) == 1:
        modes = string_options(attrs.get('supported_color_modes'))
        key, value = next(iter(data.items()))
        numeric = _number(value)
        if (
            key == 'brightness'
            and numeric
            and 1 <= value <= 255
            and BRIGHTNESS_MODES.intersection(modes)
        ):
            return
        low, high = (attribute_number(attrs.get(key)) for key in ('min_color_temp_kelvin', 'max_color_temp_kelvin'))
        if (
            key == 'color_temp_kelvin'
            and numeric
            and 'color_temp' in modes
            and low is not None
            and high is not None
            and 0 < low <= value <= high
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
        and data['option'] in string_options(attrs.get('options'))
    ):
        return
    # 数值类：必须落在 min~max 且与 step 对齐（HA 的 number 集成对步长是强校验的，
    # 这里先拦一道，避免设备端报错后前端只看到一个笼统的失败）。
    if kind == 'number' and service == 'set_value' and set(data) == {'value'}:
        value = data['value']
        low, high, step = (
            attribute_number(v)
            for v in (attrs.get('min'), attrs.get('max'), attrs.get('step', 1))
        )
        if (
            all(_number(n) for n in (value, low, high, step))
            and step > 0
            and low <= value <= high
        ):
            increments = (value - low) / step
            if math.isfinite(increments) and abs(increments - round(increments)) < 1e-5:
                return
    raise HTTPException(422, detail='附加实体不支持此操作或参数。')


def validate_purifier_command(service, data, state, *, name='空气净化器'):
    if not state or state.get('available') is False or state.get('state') not in ('on', 'off'):
        raise HTTPException(409, detail=f'{name}当前不可用。')
    attrs = attributes_of(state)
    features = feature_flags(attrs)
    # 没上报 supported_features 的实体：能力位无从判断，退化为「看属性」的旧口径。
    legacy = 'supported_features' not in attrs
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
    # 开关机：bit 5（TURN_ON = 32）/ bit 4（TURN_OFF = 16）；没上报能力位时直接放行。
    if (
        service in ('turn_on', 'turn_off')
        and not data
        and (legacy or features & (32 if service == 'turn_on' else 16))
    ):
        return
    # 预设模式：bit 3（PRESET_MODE）；没上报 supported_features 时退化为「选项表里有就放行」。
    if (
        service == 'set_preset_mode'
        and (legacy or features & 8)
        and set(data) == {'preset_mode'}
        and data['preset_mode'] in string_options(attrs.get('preset_modes'))
    ):
        return
    # 风速百分比：bit 0（PERCENTAGE）；没上报能力位时看设备是否给过 percentage 属性。
    if service == 'set_percentage' and set(data) == {'percentage'}:
        value = data['percentage']
        if (
            _number(value)
            and 0 <= value <= 100
            and (
                features & 1
                if not legacy
                else attribute_number(attrs.get('percentage')) is not None
            )
        ):
            return
    raise HTTPException(422, detail=f'{name}不支持此操作或参数。')
