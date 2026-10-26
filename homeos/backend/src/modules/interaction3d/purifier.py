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

# 域 → 控制类型表已下沉到叶子模块 ``extra_types``（``config_ctx`` / ``device`` 也用它，
# 从本模块取会经 ``lock`` 绕回 ``config_ctx`` 形成导入环）。这里保留名字供本模块内部使用。
from .extra_types import EXTRA_TYPES

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


def _rejects_unsupported_target(extra, domain: str, kind: str) -> bool:
    """配置里的绑定域与本次调用的域不符，或该类型根本不接受命令（→ HTTP 422）。

    ``kind == 'state'``（sensor / binary_sensor）只读；``picture`` 只认摄像头。
    """
    return (
        not extra
        or extra.get('entityId', '').split('.')[0] != domain
        or kind == 'state'
        or (kind == 'picture' and domain != 'camera')
    )


def _is_timestamp_unknown(state, domain: str) -> bool:
    """服务型时间戳实体（tts / notify …）常态是 unknown，仍算可用。"""
    return bool(
        state
        and state.get('state') == 'unknown'
        and domain in TIMESTAMP_UNKNOWN_DOMAINS
        and state.get('available') is not False
        and state.get('availabilityReason') == 'unknown'
    )


def _is_unavailable(state, domain: str, kind: str, timestamp_unknown: bool) -> bool:
    """实体当前是否不可下发（→ HTTP 409）。

    按钮空闲时 state 常态就是 unknown，仍算可用；文本域允许空字符串（清空后的常态）。
    """
    if not state:
        return True
    if state.get('available') is False and not timestamp_unknown:
        return True
    if state.get('state') in (None, 'unavailable'):
        return True
    if state.get('state') == '' and domain != 'text':
        return True
    return state.get('state') == 'unknown' and kind != 'button' and not timestamp_unknown


def validate_extra_command(extra, domain, service, data, state):
    """附加实体控制下发的总入口。

    三段式：先判绑定是否合法（422），再判实体是否可用（409），最后按域委派给专属
    校验器、未命中时回落到通用形态校验（开关 / 按钮 / 下拉 / 数值）。

    **顺序即契约**：前两段的先后决定前端看到哪条文案（422 还是 409），末段的
    分派顺序决定命中哪个校验器 —— 调整顺序等于改变行为。
    """
    kind = EXTRA_TYPES.get(domain, 'state')
    if _rejects_unsupported_target(extra, domain, kind):
        raise HTTPException(422, detail='此实体不支持配置的控制类型。')
    timestamp_unknown = _is_timestamp_unknown(state, domain)
    if _is_unavailable(state, domain, kind, timestamp_unknown):
        raise HTTPException(409, detail='附加实体当前不可用。')
    attrs = attributes_of(state)
    if _run_domain_validator(domain, kind, attrs, service, data, state):
        return
    if _light_single_param_allowed(domain, kind, service, data, attrs):
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
    if _number_value_allowed(kind, service, data, attrs):
        return
    raise HTTPException(422, detail='附加实体不支持此操作或参数。')


def _dispatch_category_validator(domain, service, data, state) -> bool:
    """域集合型分派：服务型 / 列表预报型 / 复合设备型，命中即返回 True。

    这三类的判定输入都是「域 ∈ 某个集合」，与后面的单域专门规则不同，因此整体前置。
    分支内一律函数内延迟导入：``extra_*`` 会反向导入 ``config_ctx``，模块级导入成环。
    """
    # 服务型域：服务名 / 参数各不相同，交给 extra_services。
    if domain in SERVICE_DOMAINS:
        from .extra_services import validate_service_extra

        validate_service_extra(domain, service, data, state)
        return True
    # 列表 / 预报 / 更新：能力位与字段组合按域拆开。
    if domain in LIST_DOMAINS:
        from .extra_lists import validate_list_extra

        validate_list_extra(domain, service, data, state)
        return True
    # 复合设备；气候域的 set_humidity 也走同一套湿度范围校验。
    if domain in DEVICE_DOMAINS or (domain == 'climate' and service == 'set_humidity'):
        from .extra_devices import validate_device_extra

        validate_device_extra(domain, service, data, state)
        return True
    return False


def _reject_camera_unsupported(attrs, service, data) -> None:
    """摄像头：只有 bit 0（TURN_ON）且无参数时才允许开 / 关。"""
    if feature_flags(attrs) & 1 and service in ('turn_on', 'turn_off') and not data:
        return
    raise HTTPException(422, detail='摄像头未提供此开关能力。')


def _reject_scene_with_args(service, data) -> None:
    """场景：只允许无参数 turn_on。"""
    if service == 'turn_on' and not data:
        return
    raise HTTPException(422, detail='场景只支持运行操作。')


def _run_domain_validator(domain, kind, attrs, service, data, state) -> bool:
    """按域分派到专属校验器；返回 ``True`` 表示已处理（调用方直接返回）。

    **分支顺序即优先级**：域集合型分派 → 门锁 → 摄像头 → 灯 → 输入类 → 场景 →
    整块面板 → 风扇。调换顺序会改变「最终命中哪条规则」，新增域只能插到语义对应处。
    各分支里的 import 必须是**函数内延迟导入**：``lock`` / ``climate`` / ``cover``
    等模块会反向导入 ``config_ctx``，模块级导入会形成环（见 ``extra_types`` 头部说明）。
    """
    if _dispatch_category_validator(domain, service, data, state):
        return True
    # 门锁：lock / unlock / open 的能力位与密码。
    if domain == 'lock':
        from .lock import validate_lock_command

        validate_lock_command(service, data, state)
        return True
    # 摄像头：只有 bit 0（TURN_ON）且无参数时才允许开 / 关。
    if domain == 'camera':
        _reject_camera_unsupported(attrs, service, data)
        return True
    # 灯：完整颜色 / 色温 / 亮度面。
    if domain == 'light':
        from .extra_light import validate_light_extra

        validate_light_extra(domain, service, data, state)
        return True
    # 文本 / 日期 / 时间 / 日期时间：由 extra_inputs 判格式。
    if domain in ('date', 'text', 'time', 'datetime'):
        from .extra_inputs import validate_input_command

        validate_input_command(domain, service, data, state)
        return True
    # 场景：只允许无参数 turn_on。
    if domain == 'scene':
        _reject_scene_with_args(service, data)
        return True
    # 整块设备面板：气候 / 窗帘 / 热水器 / 音箱。
    if kind == 'panel':
        _validate_panel_kind(domain, service, data, state)
        return True
    # 风扇类：整机交给净化器校验器复核同一套能力位（不只是风速那一条）。
    if kind == 'switch' and domain == 'fan':
        validate_purifier_command(service, data, state, name='风扇')
        return True
    return False


def _validate_panel_kind(domain, service, data, state) -> None:
    """``kind == 'panel'`` 的四个域各自校验；表外域保持原行为（``KeyError``）。"""
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


def _light_single_param_allowed(domain, kind, service, data, attrs) -> bool:
    """灯 ``turn_on`` 只带一个参数时，亮度/色温必须落在设备上报的范围内。

    这个窄口子只放行「单参数且在范围内」的请求；其余灯类请求已在
    ``_run_domain_validator`` 里交给 ``extra_light.validate_light_extra``。
    """
    if not (kind == 'switch' and domain == 'light' and service == 'turn_on' and len(data) == 1):
        return False
    modes = string_options(attrs.get('supported_color_modes'))
    key, value = next(iter(data.items()))
    numeric = _number(value)
    if key == 'brightness' and numeric and 1 <= value <= 255 and BRIGHTNESS_MODES.intersection(modes):
        return True
    low, high = (
        attribute_number(attrs.get(name))
        for name in ('min_color_temp_kelvin', 'max_color_temp_kelvin')
    )
    return bool(
        key == 'color_temp_kelvin'
        and numeric
        and 'color_temp' in modes
        and low is not None
        and high is not None
        and 0 < low <= value <= high
    )


def _number_value_allowed(kind, service, data, attrs) -> bool:
    """数值类 ``set_value``：必须落在 min~max 且与 step 对齐。

    HA 的 number 集成对步长是强校验的，这里先拦一道，避免设备端报错后前端只看到
    一个笼统的失败。
    """
    if not (kind == 'number' and service == 'set_value' and set(data) == {'value'}):
        return False
    value = data['value']
    low, high, step = (
        attribute_number(raw) for raw in (attrs.get('min'), attrs.get('max'), attrs.get('step', 1))
    )
    if not (
        _number(value)
        and low is not None
        and high is not None
        and step is not None
        and step > 0
        and low <= value <= high
    ):
        return False
    increments = (value - low) / step
    return math.isfinite(increments) and abs(increments - round(increments)) < 1e-5


def _purifier_percentage_allowed(service, data, attrs, features: int, legacy: bool) -> bool:
    """风速百分比：bit 0（PERCENTAGE）；没上报能力位时看设备是否给过 percentage 属性。"""
    if service != 'set_percentage' or set(data) != {'percentage'}:
        return False
    value = data['percentage']
    if not _number(value) or not 0 <= value <= 100:
        return False
    if not legacy:
        return bool(features & 1)
    return attribute_number(attrs.get('percentage')) is not None


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
    if _purifier_percentage_allowed(service, data, attrs, features, legacy):
        return
    raise HTTPException(422, detail=f'{name}不支持此操作或参数。')
