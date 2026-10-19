"""灯光附加实体的控制校验。

附加卡上的灯不是弹窗本体，能力位只能从实时状态里读：``supported_color_modes``
决定"能不能调色/调色温"，``effect_list`` 决定"能不能选特效"，色温上下限决定
"这个开尔文值合不合法"。判不准一律 422，宁可少下发一次，也不让 HA 端报一个
前端看不懂的集成错误。
"""

from __future__ import annotations

from typing import Any, NoReturn

from fastapi import HTTPException

from .capabilities import (
    BRIGHTNESS_MODES,
    attribute_number,
    attributes_of,
    feature_flags,
    string_options,
)
from .climate import _number

#: 单次命令允许出现的参数（``turn_on`` 全集）。
LIGHT_TURN_ON_FIELDS = frozenset(
    {
        'flash',
        'white',
        'effect',
        'hs_color',
        'xy_color',
        'rgb_color',
        'brightness',
        'rgbw_color',
        'transition',
        'rgbww_color',
        'color_temp_kelvin',
    }
)
#: ``turn_off`` 只允许过渡时间。
LIGHT_TURN_OFF_FIELDS = frozenset({'transition'})
#: 颜色参数：同一时刻只能给一种（HA 会以最后一个为准，这里直接拒绝歧义）。
LIGHT_COLOR_FIELDS = frozenset(
    {
        'white',
        'hs_color',
        'xy_color',
        'rgb_color',
        'rgbw_color',
        'rgbww_color',
        'color_temp_kelvin',
    }
)
#: 颜色参数 → ``supported_color_modes`` 里的模式名（``hs_color`` → ``hs``）。
LIGHT_COLOR_MODES = {
    'hs_color': 'hs',
    'xy_color': 'xy',
    'rgb_color': 'rgb',
    'rgbw_color': 'rgbw',
    'rgbww_color': 'rgbww',
    'white': 'white',
    'color_temp_kelvin': 'color_temp',
}
#: RGB 三通道 / 四通道 / 五通道的数值个数。
RGB_CHANNEL_COUNTS = {
    'rgb_color': 3,
    'rgbw_color': 4,
    'rgbww_color': 5,
}
#: 过渡时间上限（秒）：HA 没有硬上限，但超过 1 小时基本是误输入。
TRANSITION_LIMIT_SECONDS = 3600
#: 灯实体支持位：turn_on = 32，turn_off = 16（与净化器共用同一套 HA 位域）。
LIGHT_TURN_ON_FLAG = 32
LIGHT_TURN_OFF_FLAG = 16
#: 本校验器只处理灯。
LIGHT_DOMAINS = frozenset({'light'})


def _bad() -> NoReturn:
    raise HTTPException(422, detail='灯光不支持此能力或参数。')


def _channels(value: Any, count: int) -> bool:
    """``[r, g, b(, w, ww)]``：长度固定、每项 0..255 的整数。"""
    return (
        isinstance(value, list)
        and len(value) == count
        and all(
            isinstance(channel, int) and not isinstance(channel, bool) and 0 <= channel <= 255
            for channel in value
        )
    )


def validate_light_extra(domain: str, service: str, data: Any, state: Any) -> None:
    """校验一条附加灯命令；通过则返回，不通过直接 422。"""
    if domain not in LIGHT_DOMAINS:
        _bad()
    attrs = attributes_of(state)
    modes = set(string_options(attrs.get('supported_color_modes')))
    flags = feature_flags(attrs)
    if service not in ('turn_on', 'turn_off') or not isinstance(data, dict):
        _bad()
    if set(data) - (LIGHT_TURN_OFF_FIELDS if service == 'turn_off' else LIGHT_TURN_ON_FIELDS):
        _bad()
    # 同一时刻只能给一种颜色表达；亮度/过渡可以并存。
    if len(LIGHT_COLOR_FIELDS & set(data)) > 1:
        _bad()
    if 'flash' in data and data['flash'] not in ('short', 'long'):
        _bad()
    if 'transition' in data:
        transition = attribute_number(data['transition'])
        if transition is None or not 0 <= transition <= TRANSITION_LIMIT_SECONDS:
            _bad()
    if 'brightness' in data:
        brightness = data['brightness']
        if (
            not _number(brightness)
            or not 1 <= brightness <= 255
            or not BRIGHTNESS_MODES.intersection(modes)
        ):
            _bad()
    if 'effect' in data:
        effects = string_options(attrs.get('effect_list'))
        # ``effect_list`` 缺失时无法判断，按 HA 的口径：没有列表就不允许指定特效。
        if not isinstance(data['effect'], str) or data['effect'] not in effects:
            _bad()
    if 'white' in data:
        white = attribute_number(data['white'])
        if 'white' not in modes or white is None or not 0 <= white <= 255:
            _bad()
    for key, count in RGB_CHANNEL_COUNTS.items():
        if key in data and (
            LIGHT_COLOR_MODES[key] not in modes or not _channels(data[key], count)
        ):
            _bad()
    if 'hs_color' in data:
        value = data['hs_color']
        if (
            'hs' not in modes
            or not isinstance(value, list)
            or len(value) != 2
            or any(attribute_number(part) is None for part in value)
        ):
            _bad()
    if 'xy_color' in data:
        value = data['xy_color']
        if (
            'xy' not in modes
            or not isinstance(value, list)
            or len(value) != 2
            or any(not 0 <= (attribute_number(part) or -1) <= 1 for part in value)
        ):
            _bad()
    if 'color_temp_kelvin' in data:
        value = attribute_number(data['color_temp_kelvin'])
        low = attribute_number(attrs.get('min_color_temp_kelvin'))
        high = attribute_number(attrs.get('max_color_temp_kelvin'))
        if (
            'color_temp' not in modes
            or value is None
            or low is None
            or high is None
            or not 0 < low <= value <= high
        ):
            _bad()
    # 能力位里没有 turn_on / turn_off 的实体，HA 通常也不会给可写属性；
    # 缺 ``supported_features`` 时按旧口径放行（老集成不上报位域）。
    if flags and service == 'turn_on' and not flags & LIGHT_TURN_ON_FLAG:
        _bad()
    if flags and service == 'turn_off' and not flags & LIGHT_TURN_OFF_FLAG:
        _bad()
