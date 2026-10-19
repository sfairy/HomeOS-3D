"""没有专属主弹窗的复合设备附加卡校验。

覆盖面：``siren`` / ``valve`` / ``vacuum`` / ``humidifier`` / ``lawn_mower`` /
``alarm_control_panel``，外加气候实体走附加卡时的 ``set_humidity``。共同点是
"弹窗本体是通用设备面板，附加卡只读实时状态里声明的能力"，因此这里不接受
任何前端自造的字段。

所有"能不能做"的判断都以 HA 实时上报的 ``supported_features`` 位域为准，
不自行发明能力表；位域缺失时按 0 处理（该操作不支持），避免误放行。
"""

from __future__ import annotations

from typing import Any, NoReturn

from fastapi import HTTPException

from .capabilities import attribute_number, attributes_of, feature_flags, string_options
from .climate import _number

#: 本校验器负责的域。
COMPOUND_DOMAINS = frozenset(
    {'siren', 'valve', 'vacuum', 'humidifier', 'lawn_mower', 'alarm_control_panel'}
)

#: 警报器能力位（HA ``SirenEntityFeature``）。
SIREN_TURN_ON = 1
SIREN_TURN_OFF = 2
SIREN_TONES = 4
SIREN_VOLUME_SET = 8
SIREN_DURATION = 16
#: 阀门能力位（HA ``ValveEntityFeature``）。
VALVE_OPEN = 1
VALVE_CLOSE = 2
VALVE_SET_POSITION = 4
VALVE_STOP = 8
#: 割草机能力位（HA ``LawnMowerEntityFeature``）。
LAWN_MOWER_START = 1
LAWN_MOWER_PAUSE = 2
LAWN_MOWER_DOCK = 4
#: 扫地机能力位（HA ``VacuumEntityFeature``）。
VACUUM_PAUSE = 4
VACUUM_STOP = 8
VACUUM_RETURN_HOME = 16
VACUUM_FAN_SPEED = 32
VACUUM_SEND_COMMAND = 256
VACUUM_LOCATE = 512
VACUUM_CLEAN_SPOT = 1024
VACUUM_START = 8192
VACUUM_CLEAN_AREA = 16384
#: 安防能力位（HA ``AlarmControlPanelEntityFeature``）。
ALARM_ARM_HOME = 1
ALARM_ARM_AWAY = 2
ALARM_ARM_NIGHT = 4
ALARM_TRIGGER = 8
ALARM_ARM_CUSTOM_BYPASS = 16
ALARM_ARM_VACATION = 32

#: 警报器音量范围。
VOLUME_RANGE = (0, 1)
#: 阀门位置范围。
VALVE_POSITION_RANGE = (0, 100)
#: 安防密码长度上限（HA 允许 1..128 个字符）。
ALARM_CODE_LIMIT = 128
#: 扫地机 ``send_command`` 的命令串上限、区域 id 上限。
VACUUM_COMMAND_LIMIT = 256
VACUUM_AREA_ID_LIMIT = 128

_BAD_DETAIL = '此设备不支持该能力或参数。'


def _bad(message: str = _BAD_DETAIL) -> NoReturn:
    raise HTTPException(422, detail=message)


def _plain_action(service: str, data: dict, flags: int, services: dict[str, int]) -> bool:
    """无参数服务 + 能力位：支持且没带参数时返回 True（直接放行）。"""
    return service in services and bool(flags & services[service]) and not data


def _validate_siren(service: str, data: dict, attrs: dict, flags: int) -> None:
    if service == 'turn_off':
        if flags & SIREN_TURN_OFF and not data:
            return
        _bad()
    if service != 'turn_on' or flags & SIREN_TURN_ON == 0:
        _bad()
    if set(data) - {'tone', 'duration', 'volume_level'}:
        _bad()
    if 'tone' in data:
        tones = attrs.get('available_tones', [])
        # HA 的 ``available_tones`` 既可能是列表，也可能是「值 -> 展示名」字典。
        choices = (
            tones
            if isinstance(tones, list)
            else list(tones)
            if isinstance(tones, dict)
            else []
        )
        if flags & SIREN_TONES == 0 or data['tone'] not in choices:
            _bad()
    if 'volume_level' in data:
        value = data['volume_level']
        if flags & SIREN_VOLUME_SET == 0 or not _number(value) or not 0 <= value <= 1:
            _bad()
    if 'duration' in data:
        value = data['duration']
        if (
            flags & SIREN_DURATION == 0
            or not _number(value)
            or value <= 0
            or not float(value).is_integer()
        ):
            _bad()


def _validate_valve(service: str, data: dict, flags: int) -> None:
    if _plain_action(
        service,
        data,
        flags,
        {'open_valve': VALVE_OPEN, 'close_valve': VALVE_CLOSE, 'stop_valve': VALVE_STOP},
    ):
        return
    if service == 'set_valve_position' and flags & VALVE_SET_POSITION:
        if set(data) == {'position'}:
            position = data['position']
            if _number(position) and 0 <= position <= 100:
                return
    _bad()


def _validate_vacuum(service: str, data: dict, attrs: dict, flags: int) -> None:
    if _plain_action(
        service,
        data,
        flags,
        {
            'start': VACUUM_START,
            'pause': VACUUM_PAUSE,
            'stop': VACUUM_STOP,
            'return_to_base': VACUUM_RETURN_HOME,
            'locate': VACUUM_LOCATE,
            'clean_spot': VACUUM_CLEAN_SPOT,
        },
    ):
        return
    if service == 'set_fan_speed' and flags & VACUUM_FAN_SPEED:
        if set(data) == {'fan_speed'} and data['fan_speed'] in string_options(
            attrs.get('fan_speed_list')
        ):
            return
        _bad()
    if service == 'send_command' and flags & VACUUM_SEND_COMMAND:
        if set(data) - {'command', 'params'}:
            _bad()
        command = data.get('command')
        params = data.get('params')
        if (
            isinstance(command, str)
            and 0 < len(command) <= VACUUM_COMMAND_LIMIT
            and (params is None or isinstance(params, (list, dict)))
        ):
            return
        _bad()
    if service == 'clean_area' and flags & VACUUM_CLEAN_AREA:
        area = data.get('cleaning_area_id')
        if (
            set(data) == {'cleaning_area_id'}
            and isinstance(area, list)
            and area
            and all(
                isinstance(item, str) and 0 < len(item) <= VACUUM_AREA_ID_LIMIT
                for item in area
            )
        ):
            return
        _bad()
    _bad()


def _validate_humidifier(service: str, data: dict, attrs: dict, flags: int) -> None:
    if service in ('turn_on', 'turn_off') and not data:
        return
    if service == 'set_mode' and flags & 1:
        if set(data) == {'mode'} and data['mode'] in string_options(attrs.get('available_modes')):
            return
        _bad()
    if service == 'set_humidity':
        low = attribute_number(attrs.get('min_humidity'))
        high = attribute_number(attrs.get('max_humidity'))
        if (
            set(data) == {'humidity'}
            and low is not None
            and high is not None
            and _number(data['humidity'])
            and low <= data['humidity'] <= high
            and float(data['humidity']).is_integer()
        ):
            return
        _bad()
    _bad()


def _validate_lawn_mower(service: str, data: dict, flags: int) -> None:
    if _plain_action(
        service,
        data,
        flags,
        {'start_mowing': LAWN_MOWER_START, 'pause': LAWN_MOWER_PAUSE, 'dock': LAWN_MOWER_DOCK},
    ):
        return
    _bad()


def _validate_alarm(service: str, data: dict, attrs: dict, flags: int) -> None:
    bits = {
        'alarm_arm_home': ALARM_ARM_HOME,
        'alarm_arm_away': ALARM_ARM_AWAY,
        'alarm_arm_night': ALARM_ARM_NIGHT,
        'alarm_trigger': ALARM_TRIGGER,
        'alarm_arm_custom_bypass': ALARM_ARM_CUSTOM_BYPASS,
        'alarm_arm_vacation': ALARM_ARM_VACATION,
    }
    if service != 'alarm_disarm' and (service not in bits or not flags & bits[service]):
        _bad()
    if set(data) - {'code'}:
        _bad()
    code = data.get('code')
    if code is not None and (not isinstance(code, str) or not 1 <= len(code) <= ALARM_CODE_LIMIT):
        _bad('安防密码格式无效。')
    # 设备配置了 code_format 时，撤防 / 触发警报必须带密码；
    # 布防是否必须带密码由 code_arm_required 决定（缺省为 True）。
    required = bool(attrs.get('code_format')) and (
        service in frozenset({'alarm_disarm', 'alarm_trigger'})
        or attrs.get('code_arm_required', True)
    )
    if required and not code:
        _bad('此操作需要密码。')
    if code and attrs.get('code_format') == 'number' and not code.isdecimal():
        _bad('请输入数字密码。')


def validate_device_extra(domain: str, service: str, data: Any, state: Any) -> None:
    """校验复合设备（警报器 / 阀门 / 扫地机 / 加湿器 / 割草机 / 安防）的附加命令。

    气候域的 ``set_humidity`` 也由这里校验（与加湿器共享湿度范围口径）。
    """
    if (domain not in COMPOUND_DOMAINS and domain != 'climate') or not isinstance(data, dict):
        _bad()
    attrs = attributes_of(state)
    flags = feature_flags(attrs)
    if domain == 'climate':
        # 气候实体只接 ``set_humidity``：bit 4（TARGET_HUMIDITY）必须在，且落在上下限内。
        low = attribute_number(attrs.get('min_humidity'))
        high = attribute_number(attrs.get('max_humidity'))
        if (
            service == 'set_humidity'
            and flags & 4
            and set(data) == {'humidity'}
            and low is not None
            and high is not None
            and _number(data['humidity'])
            and low <= data['humidity'] <= high
        ):
            return
        _bad()
    if domain == 'siren':
        _validate_siren(service, data, attrs, flags)
    elif domain == 'valve':
        _validate_valve(service, data, flags)
    elif domain == 'vacuum':
        _validate_vacuum(service, data, attrs, flags)
    elif domain == 'humidifier':
        _validate_humidifier(service, data, attrs, flags)
    elif domain == 'lawn_mower':
        _validate_lawn_mower(service, data, flags)
    else:
        _validate_alarm(service, data, attrs, flags)
