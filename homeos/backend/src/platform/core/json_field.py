"""JSON 字段安全读写（对齐 ``common/utils/json-field.util.ts``）。

非法 / 缺失输入一律降级为安全默认值，绝不抛出；不修改入参对象。
"""

from __future__ import annotations

import json
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


__all__ = ["parse_json_array", "read_json_array", "read_json_object", "to_input_json"]
