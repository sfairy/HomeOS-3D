"""归一 Home Assistant 的实体元数据，但不放宽控制请求的类型口径。

HA 的实体属性来自集成方，写法并不统一：``supported_features`` 可能是整数、浮点数或带空格的
数字字符串；``brightness`` / ``color_temp`` 之类的数值字段也可能是字符串。控制逻辑如果直接
对这些值做位运算或比较，非标准实体就会出现「能力明明有、界面却说没有」或崩在类型错误上。

这里集中提供几个只做「安全解读」的入口：拿不准就返回缺省值（``0`` / ``[]`` / ``None``），
由调用方按「能力不存在」处理。刻意不做宽松解析 —— 不把布尔当数字、不放行 ``nan``/``inf``、
不把任意字符串转成数字，避免把非法输入放大成一次真实下发。
"""

from __future__ import annotations

import math
import re
from typing import Any

_DECIMAL = re.compile(r'^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$')

# 亮度模式集合：HA 的 light 实体用这组名字描述「亮度/颜色」的表达方式。
# 前端据此决定亮度滑条与色温/颜色控件是否可用，因此新增模式要同步前端。
BRIGHTNESS_MODES = {'hs', 'xy', 'rgb', 'rgbw', 'rgbww', 'white', 'brightness', 'color_temp'}


def attribute_number(value: Any) -> float | None:
    """把 ``value`` 读成有限浮点数；不是数字时返回 ``None``。

    布尔被直接拒绝（``bool`` 是 ``int`` 的子类，``True`` 会被当成 1），数字字符串必须先
    匹配严格十进制文法再交给 ``float``，``nan`` / ``inf`` 也一律拒绝。
    """
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        return None
    if isinstance(value, str):
        value = value.strip()
        if not _DECIMAL.fullmatch(value):
            return None
    try:
        result = float(value)
    except (ValueError, OverflowError):
        return None
    return result if math.isfinite(result) else None


def attributes_of(state: Any) -> dict[str, Any]:
    """取状态对象的 ``attributes`` 映射；缺失或类型不对时返回空字典。"""
    value = state.get('attributes') if isinstance(state, dict) else None
    return value if isinstance(value, dict) else {}


def feature_flags(attributes: dict[str, Any]) -> int:
    """读 HA 的 ``supported_features`` 位域；不可用时返回 ``0``。

    上界取 32 位有符号整数：HA 目前远没用到这么多位，超出说明这个值不是位域（可能是错误
    归一的数据），按「没有能力」处理比按位运算出一个幻影能力安全。
    """
    value = attribute_number(attributes.get('supported_features'))
    if value is not None and value.is_integer() and 0 <= value <= 2147483647:
        return int(value)
    return 0


def string_options(value: Any) -> list[str]:
    """取列表里的非空字符串；其它类型一律返回空列表。"""
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str) and item.strip()]
