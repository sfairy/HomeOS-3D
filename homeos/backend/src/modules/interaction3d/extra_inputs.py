"""带类型的 HA 输入控件（``text`` / ``date`` / ``time`` / ``datetime`` / ``number``）。

传感器读数永远不会走到这里：``sensor`` 只显示状态，不接受命令。所有判定都以
设备**实时上报**的约束为准（``min`` / ``max`` / ``pattern``），因为这几个属性
会随集成配置变化，写死在代码里必然漂移。
"""

from __future__ import annotations

import re
from datetime import date, datetime, time
from typing import Any, NoReturn

from fastapi import HTTPException

from .capabilities import attribute_number, attributes_of

#: 本校验器负责的域。
INPUT_DOMAINS = frozenset({'text', 'date', 'time', 'datetime', 'number', 'input_number'})
#: 日期 / 时间 / 日期时间的字面文法（``fromisoformat`` 之前先挡掉明显不对的形状）。
DATE_PATTERN = re.compile(r'\d{4}-\d{2}-\d{2}')
TIME_PATTERN = re.compile(r'\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?')
#: 文本输入缺省的长度上限：设备没给 ``min``/``max`` 时的安全边界。
DEFAULT_TEXT_LIMIT = 255


def _bad() -> NoReturn:
    raise HTTPException(422, detail='输入内容不符合设备要求。')


def _text_value(attrs: dict[str, Any], value: Any) -> None:
    """文本：长度落在设备声明的区间内，且匹配设备给的正则。"""
    if not isinstance(value, str):
        _bad()
    low = attribute_number(attrs.get('min'))
    high = attribute_number(attrs.get('max'))
    low = 0 if low is None else max(0, int(low))
    high = DEFAULT_TEXT_LIMIT if high is None else min(DEFAULT_TEXT_LIMIT, int(high))
    if not low <= len(value) <= high:
        raise HTTPException(422, detail='文本长度不符合设备要求。')
    pattern = attrs.get('pattern')
    if pattern in (None, ''):
        return
    if not isinstance(pattern, str):
        raise HTTPException(422, detail='设备的文本格式规则无效。')
    try:
        compiled = re.compile(pattern)
    except re.error:
        raise HTTPException(422, detail='设备的文本格式规则无效。') from None
    # ``fullmatch``：HA 前端也用整串匹配，避免 ``abc`` 命中 ``ab`` 这类半截输入。
    if compiled.fullmatch(value) is None:
        raise HTTPException(422, detail='文本格式不符合设备要求。')


def _date_value(value: Any) -> None:
    if not isinstance(value, str) or DATE_PATTERN.fullmatch(value) is None:
        _bad()
    try:
        date.fromisoformat(value)
    except (ValueError, OverflowError):
        _bad()


def _time_value(value: Any) -> None:
    if not isinstance(value, str) or TIME_PATTERN.fullmatch(value) is None:
        _bad()
    try:
        time.fromisoformat(value)
    except (ValueError, OverflowError):
        _bad()


def _datetime_value(value: Any) -> None:
    if not isinstance(value, str) or 'T' not in value:
        _bad()
    try:
        parsed = datetime.fromisoformat(value)
    except (ValueError, OverflowError):
        raise HTTPException(422, detail='日期时间格式无效。') from None
    # 没有时区的 datetime 在 HA 里会被当成"本地时间"解释，跨设备就是错的。
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise HTTPException(422, detail='日期时间需要包含时区。')


def _number_value(attrs: dict[str, Any], value: Any) -> None:
    low = attribute_number(attrs.get('min'))
    high = attribute_number(attrs.get('max'))
    numeric = attribute_number(value)
    if numeric is None or not isinstance(value, (int, float)) or isinstance(value, bool):
        _bad()
    if low is not None and numeric < low:
        _bad()
    if high is not None and numeric > high:
        _bad()
    step = attribute_number(attrs.get('step'))
    if step and step > 0 and low is not None:
        increments = (numeric - low) / step
        if abs(increments - round(increments)) > 1e-5:
            _bad()


def validate_input_command(domain: str, service: str, data: Any, state: Any) -> None:
    """校验 ``text`` / ``date`` / ``time`` / ``datetime`` / ``number`` 的命令。"""
    if domain not in INPUT_DOMAINS or service != 'set_value':
        _bad()
    if not isinstance(data, dict) or set(data) != {'value'}:
        _bad()
    attrs = attributes_of(state)
    value = data['value']
    if domain == 'text':
        _text_value(attrs, value)
    elif domain == 'date':
        _date_value(value)
    elif domain == 'time':
        _time_value(value)
    elif domain == 'datetime':
        _datetime_value(value)
    else:
        _number_value(attrs, value)
