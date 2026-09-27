"""规范性 JSON 序列化：排序键 + 紧凑分隔符 + 不转义非 ASCII。
"""
from __future__ import annotations

import json
from typing import Any


def canonical_json(value: Any) -> str:
    """把任意可 JSON 化的值序列化成规范字符串。"""
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def canonical_json_bytes(value: Any) -> bytes:
    """规范字符串的 UTF-8 字节，供摘要 / 加密使用。"""
    return canonical_json(value).encode('utf-8')
