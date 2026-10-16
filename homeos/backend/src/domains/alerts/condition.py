"""告警规则条件求值器（纯函数，不使用 eval）。

逐条对齐 ``common/utils/evaluate-condition.util.ts``：
- 支持复合表达式 ``A && B || C``：``||`` 切分为 OR 组，组内按 ``&&`` 切分为 AND；
- 支持单子条件：``> 30`` / ``== on`` / ``= on`` / ``attr:brightness > 100`` / ``contains motion``；
- 左侧可显式 ``state|value`` 或 ``attr:<attrName>`` 指定取值来源（默认 state）；
- 数值两侧都能解析时按数值比较，否则按字符串比较；
- **无有效读数不算命中**：状态是 ``unavailable`` / ``unknown``，或 ``attr:`` 指定的属性缺失时，
  条件一律不成立（除非条件本身显式比较 ``unavailable`` / ``unknown``）。
  这类「读数缺失」不是读数，旧实现按空串参与比较，``!=`` 会因此恒真。
"""

from __future__ import annotations

import re
from typing import Any

_ATTR_RE = re.compile(r"^attr:([a-zA-Z0-9_]+)\s*(.*)$", re.DOTALL)
_STATE_PREFIX_RE = re.compile(r"^(state|value)\s+", re.IGNORECASE)
_OP_RE = re.compile(r"^(>=|<=|==|!=|>|<|=|contains)\s*(.+)$", re.IGNORECASE | re.DOTALL)

#: 表示「没有有效读数」的状态（HA 侧实体未就绪 / 集成重载 / 中枢不可达）。
_ABSENT_STATES = frozenset({"unavailable", "unknown"})


def _is_absent_state(value: str) -> bool:
    return str(value).strip().lower() in _ABSENT_STATES


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
        if attr_value is None:
            # 属性缺失（实体不可用 / 该属性本轮未上报）：没有读数就谈不上满足条件。
            # 旧实现把它当空串参与比较，``attr:brightness != 0`` 会因此恒真 —— 中枢一断，
            # 每条属性类规则都会误报一次。
            return False
        lhs_raw = str(attr_value)
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

    # 无有效读数（HA 不可用 / 实体未就绪）：除显式比较 unavailable / unknown 的条件外一律
    # 不命中。否则 ``socket != on``、``!= 0`` 这类规则会在中枢断连、集成重载时集体误报。
    # 不是永久跳过：读数恢复后条件若成立，边沿触发仍会通知（规则匹配态此时是 False）。
    if _is_absent_state(lhs_raw) and not _is_absent_state(rhs):
        return False

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
