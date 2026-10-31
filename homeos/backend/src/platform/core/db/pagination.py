"""通用分页工具集（对齐 ``common/crud/pagination.util.ts``）。"""

from __future__ import annotations

import math
from typing import Any, TypeVar

#: JS ``Number.MAX_SAFE_INTEGER``。
MAX_SAFE_INTEGER = 9_007_199_254_740_991

#: 分页条目类型参数。这里刻意不用 PEP 695 的 ``def f[T](...)`` 语法：Cython 3.2
#: 无法解析方括号形式，构建加密后端时会以 CompileError 中断（改用传统 TypeVar）。
T = TypeVar("T")


def clamp_int(value: Any, minimum: int, maximum: int) -> int:
    """将数字夹到 ``[minimum, maximum]``（非有限值回退 ``minimum``）。"""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return minimum
    if not math.isfinite(number):
        return minimum
    return min(max(int(number // 1), minimum), maximum)


def parse_int_10(value: Any) -> int | None:
    """等价 JS ``parseInt(value, 10)``；解析失败返回 ``None``。"""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    sign = 1
    if text[0] in "+-":
        sign = -1 if text[0] == "-" else 1
        text = text[1:]
    digits = ""
    for char in text:
        if char.isdigit() and char.isascii():
            digits += char
        else:
            break
    if not digits:
        return None
    return sign * int(digits)


def parse_optional_int(value: Any, fallback: int | None = None) -> int | None:
    """解析可选整数查询参数（缺省 / 空串 / 非法数字回退 ``fallback``）。"""
    if value is None or value == "":
        return fallback
    parsed = parse_int_10(value)
    return parsed if parsed is not None else fallback


def parse_bounded_limit(
    value: Any,
    default: int,
    minimum: int = 1,
    maximum: int = MAX_SAFE_INTEGER,
) -> int:
    """把 ``limit`` 查询参数解析为强制落在 ``[minimum, maximum]`` 内的整数。

    这是路由层解析 ``limit`` 的唯一受控入口：无论前端传缺省、空串、``"abc"``、
    负数还是天文数字，返回值一定带上下界，杜绝"手工 ``int()`` + 事后 clamp"时
    漏掉上限而暴露无界查询面。缺省 / 非数字回退 ``default``（并夹进上下界）。
    """
    if maximum < minimum:
        raise ValueError("parse_bounded_limit: maximum 不能小于 minimum")
    parsed = parse_int_10(value) if value is not None and value != "" else None
    if parsed is None:
        parsed = default
    return clamp_int(parsed, minimum, maximum)


def parse_crud_pagination(
    page: Any = None,
    limit: Any = None,
    min_size: int = 5,
    max_size: int = 200,
) -> dict[str, Any]:
    """解析联动器列表分页参数（``pageNum`` / ``pageSize`` / ``enabled``）。"""
    page_num = max(1, parse_int_10(page) or 0)
    parsed_limit = parse_int_10(limit) or 0
    page_size = clamp_int(parsed_limit, min_size, max_size) if parsed_limit > 0 else 0
    return {"pageNum": page_num, "pageSize": page_size, "enabled": page_size > 0 and page_num > 0}


def parse_page_limit(
    page: Any = None,
    limit: Any = None,
    default_limit: int = 20,
    max_limit: int = 100,
) -> dict[str, int]:
    """解析 ``page`` / ``limit`` 为独立分页变量（缺省时返回 0 表示不分页）。"""
    return {
        "pageNum": clamp_int(parse_int_10(page) or 1, 1, MAX_SAFE_INTEGER) if page else 0,
        "pageSize": clamp_int(parse_int_10(limit) or default_limit, 1, max_limit) if limit else 0,
    }


def build_paginated_result(
    items: list[T], total: int, page: int, page_size: int
) -> dict[str, Any]:
    """组装分页响应对象（``totalPages`` 兜底为 1）。"""
    total_pages = max(1, -(-total // page_size)) if page_size > 0 else 1
    return {
        "items": items,
        "total": total,
        "page": page,
        "pageSize": page_size,
        "totalPages": total_pages,
    }


__all__ = [
    "MAX_SAFE_INTEGER",
    "build_paginated_result",
    "clamp_int",
    "parse_bounded_limit",
    "parse_crud_pagination",
    "parse_int_10",
    "parse_optional_int",
    "parse_page_limit",
]
