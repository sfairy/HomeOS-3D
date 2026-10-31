"""JSON 字段安全读写（对齐 ``common/utils/json-field.util.ts``）。

非法 / 缺失输入一律降级为安全默认值，绝不抛出；不修改入参对象。
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any


def parse_json_array(value: Any) -> list[Any]:
    """将任意值规范为 JSON 数组。

    数组直通；**JSON 文本**（数据库里以 TEXT 存的 JSON 列）解析成数组；
    非数组 / 解析失败 / 空值一律 → ``[]``（调用方不需要自己判类型）。

    单一真源：``domains/notification/stats.py`` 与 ``realtime/gateway.py`` 原先各写一份
    （一份只认 list、一份只认文本），同名不同义 —— 通知回写与实时推送用错版本就会静默丢字段。
    """
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        try:
            parsed = json.loads(text)
        except (TypeError, ValueError):
            return []
        return parsed if isinstance(parsed, list) else []
    return []


def to_input_json(value: Any, fallback: Any = None) -> Any:
    """将任意值规范为可写入 JSON 列的值；非法则 ``fallback``。"""
    if fallback is None:
        fallback = {}
    if value is None:
        return fallback
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return fallback
        try:
            return json.loads(text)
        except (TypeError, ValueError):
            return fallback
    if isinstance(value, (dict, list)):
        return value
    return fallback


def read_json_object(value: Any, fallback: dict[str, Any] | None = None) -> dict[str, Any]:
    """读出对象（对象 / JSON 字符串直通；非对象 → ``fallback``）。"""
    if fallback is None:
        fallback = {}
    if value is None:
        return fallback
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except (TypeError, ValueError):
            return fallback
        return parsed if isinstance(parsed, dict) else fallback
    if isinstance(value, dict):
        return value
    return fallback


def read_json_array(value: Any, fallback: list[Any] | None = None) -> list[Any]:
    """读出数组（数组直通；非数组 → ``fallback``）。"""
    if fallback is None:
        fallback = []
    if isinstance(value, list):
        return value
    return fallback


def as_object(raw_value: Any) -> dict[str, Any]:
    """仅当值**本身**就是对象时返回它，否则 ``{}``。

    与 :func:`read_json_object` 的区别：不解析 JSON 文本。取配置分段 / HA 属性 / 反引用记录
    这类「已经在内存里的嵌套对象」时要用这一个 —— 那里的字符串只是类型不对，不该被当成 JSON。
    """
    return raw_value if isinstance(raw_value, dict) else {}


def object_field(mapping_source: Any, field_name: str) -> dict[str, Any]:
    """取 ``source[key]``，且仅当它是对象时返回；否则 ``{}``。

    单一真源：``source.get(K) if isinstance(source.get(K), dict) else {}`` 这种写法在仓里出现过
    二十余次 —— 判据读的是**另一次** ``.get()`` 的结果（同一个键读两遍，类型收窄也不会传递到
    取值表达式），静态分析因此把结果判成可能为 None，连 ``{**defaults, **section}`` 都会报
    「字典解包预期映射」。收敛到一处后，「类型不对就退化成空对象」只有一种口径。
    """
    if not isinstance(mapping_source, Mapping):
        return {}
    return as_object(mapping_source.get(field_name))


__all__ = [
    "as_object",
    "object_field",
    "parse_json_array",
    "read_json_array",
    "read_json_object",
    "to_input_json",
]
