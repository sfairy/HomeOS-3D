"""告警规则条件求值器（纯函数，不使用 eval）。

逐条对齐 ``common/utils/evaluate-condition.util.ts``：
- 支持复合表达式 ``A && B || C``：``||`` 切分为 OR 组，组内按 ``&&`` 切分为 AND；
- 支持单子条件：``> 30`` / ``== on`` / ``= on`` / ``attr:brightness > 100`` / ``contains motion``；
- 左侧可显式 ``state|value`` 或 ``attr:<attrName>`` 指定取值来源（默认 state）；
- 数值两侧都能解析时按数值比较，否则按字符串比较。
"""

from __future__ import annotations

import re
from typing import Any

_ATTR_RE = re.compile(r"^attr:([a-zA-Z0-9_]+)\s*(.*)$", re.DOTALL)
_STATE_PREFIX_RE = re.compile(r"^(state|value)\s+", re.IGNORECASE)
_OP_RE = re.compile(r"^(>=|<=|==|!=|>|<|=|contains)\s*(.+)$", re.IGNORECASE | re.DOTALL)


def evaluate_condition(
    condition: str | None,
    state: str,
    attributes: dict[str, Any] | None = None,
) -> bool:
    """告警规则条件求值入口。"""
    if not condition:
        return False
    expr = str(condition).strip()
    or_parts = [part.strip() for part in expr.split("||") if part.strip()]
    if len(or_parts) > 1:
        return any(_evaluate_and_group(part, state, attributes) for part in or_parts)
    return _evaluate_and_group(expr, state, attributes)


def _evaluate_and_group(
    expr: str, state: str, attributes: dict[str, Any] | None
) -> bool:
    and_parts = [part.strip() for part in expr.split("&&") if part.strip()]
    if len(and_parts) > 1:
        return all(_evaluate_single(part, state, attributes) for part in and_parts)
    return _evaluate_single(expr, state, attributes)


def _evaluate_single(
    expr: str, state: str, attributes: dict[str, Any] | None
) -> bool:
    if not expr:
        return False
    lhs_raw = state
    rest = expr
    attr_match = _ATTR_RE.match(expr)
    if attr_match:
        attr_value = (attributes or {}).get(attr_match.group(1))
        lhs_raw = "" if attr_value is None else str(attr_value)
        rest = attr_match.group(2).strip()
    else:
        rest = _STATE_PREFIX_RE.sub("", expr)

    match = _OP_RE.match(rest)
    if not match:
        return lhs_raw.lower() == expr.lower()
    op = match.group(1).lower()
    rhs = match.group(2).strip()
    if len(rhs) >= 2 and rhs[0] in "'\"" and rhs[-1] == rhs[0]:
        rhs = rhs[1:-1]

    lhs_num = _parse_float(lhs_raw)
    rhs_num = _parse_float(rhs)
    both_numeric = lhs_num is not None and rhs_num is not None

    if op == "contains":
        return rhs.lower() in lhs_raw.lower()
    if both_numeric:
        return _compare_numeric(lhs_num, op, rhs_num)  # type: ignore[arg-type]

    if op in ("==", "="):
        return lhs_raw.lower() == rhs.lower()
    if op == "!=":
        return lhs_raw.lower() != rhs.lower()
    return False


def _parse_float(value: str) -> float | None:
    """复刻 JS ``parseFloat`` 的前缀解析语义（非法时返回 None）。"""
    text = str(value).strip()
    if not text:
        return None
    match = re.match(r"^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?", text)
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def _compare_numeric(lhs: float, op: str, rhs: float) -> bool:
    if op == ">":
        return lhs > rhs
    if op == ">=":
        return lhs >= rhs
    if op == "<":
        return lhs < rhs
    if op == "<=":
        return lhs <= rhs
    if op in ("==", "="):
        return lhs == rhs
    if op == "!=":
        return lhs != rhs
    return False


__all__ = ["evaluate_condition"]
