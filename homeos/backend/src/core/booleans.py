"""布尔值解析工具（对齐 ``common/utils/parse-boolean.util.ts``）。

两套口径：
- ``parse_env_boolean``：环境变量（多值真/假），未设置或无法识别返回 ``None``；
- ``parse_boolean_query``：HTTP 查询参数（仅 ``1`` / ``true`` 为真，其余一律为假）。
"""

from __future__ import annotations

from typing import Any

#: 视为「真」的环境变量取值（不区分大小写）
ENV_TRUTHY = frozenset({"1", "true", "yes", "on"})
#: 视为「假」的环境变量取值（不区分大小写）
ENV_FALSY = frozenset({"0", "false", "no", "off"})


def parse_env_boolean(raw: Any = None) -> bool | None:
    """解析环境变量布尔值；无法识别返回 ``None``。"""
    value = str("" if raw is None else raw).strip().lower()
    if value in ENV_TRUTHY:
        return True
    if value in ENV_FALSY:
        return False
    return None


def parse_boolean_query(raw: Any = None) -> bool:
    """解析 HTTP 查询参数布尔值（Express 可能给出 string 或 string[]）。"""
    value = raw[0] if isinstance(raw, (list, tuple)) and raw else raw
    return str("" if value is None else value).strip().lower() in ("1", "true")


__all__ = ["ENV_FALSY", "ENV_TRUTHY", "parse_boolean_query", "parse_env_boolean"]
