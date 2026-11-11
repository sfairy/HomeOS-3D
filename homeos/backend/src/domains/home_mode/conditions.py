"""家庭模式的条件求值（E1）。

条件与触发器是两件不同的事：

- **触发器**回答「什么时候开始考虑」（时间到点 / 门锁开了 / 有人回家）；
- **条件**回答「现在到底该不该执行」（门确实关着吗、现在是不是白天、有人在不在家）。

没有条件时，「到家开灯」这类模式在深夜回家也会把整屋灯全打开，因为触发成立就等于执行。
条件全部满足才执行，且不满足时记「跳过」而不是「失败」—— 跳过是正常结果，不该触发回滚。

表达式形态与告警条件保持一致的极简子集（便于复用与解释），支持：

- ``{"type": "state", "entityId": "cover.garage", "equals": "closed"}``
- ``{"type": "numeric", "entityId": "sensor.t", "op": "lt", "value": 26}``
- ``{"type": "time", "after": "18:00", "before": "23:30"}``（可跨午夜）
- ``{"type": "presence", "atHome": true}``
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from ...platform.core.runtime.zoned_time import zoned_date_parts

logger = logging.getLogger("homeos.home_mode.conditions")

#: 数值比较支持的运算符（与告警条件同一套符号，便于用户迁移认知）。
_NUMERIC_OPS: dict[str, Any] = {
    "gt": lambda left, right: left > right,
    "gte": lambda left, right: left >= right,
    "lt": lambda left, right: left < right,
    "lte": lambda left, right: left <= right,
    "eq": lambda left, right: left == right,
    "ne": lambda left, right: left != right,
}


def _as_hhmm(raw: Any) -> tuple[int, int] | None:
    text = str(raw or "").strip()
    if not text or ":" not in text:
        return None
    hour_text, _, minute_text = text.partition(":")
    try:
        hour, minute = int(hour_text), int(minute_text)
    except (TypeError, ValueError):  # fmt: skip
        logger.debug("时间条件的时刻无法解析: %r", text)
        return None
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None
    return hour, minute


def _time_condition_holds(condition: dict[str, Any], now: datetime, timezone_name: str | None) -> bool:
    """时间窗口判定；``after > before`` 视为跨午夜（如 22:00 → 06:00）。"""
    parts = zoned_date_parts(now, timezone_name)
    current = int(parts["hour"]) * 60 + int(parts["minute"])
    after = _as_hhmm(condition.get("after"))
    before = _as_hhmm(condition.get("before"))
    start = after[0] * 60 + after[1] if after else 0
    end = before[0] * 60 + before[1] if before else 24 * 60
    if start == end:
        return True
    if start < end:
        return start <= current < end
    # 跨午夜：22:00–06:00 → current >= 22:00 或 current < 06:00
    return current >= start or current < end


def _state_condition(condition: dict[str, Any], states: dict[str, dict[str, Any]]) -> bool:
    """``state`` 条件：目标实体的当前 state 必须等于 ``equals``。"""
    entity = states.get(str(condition.get("entityId") or ""))
    if not entity:
        return False
    expected = condition.get("equals")
    if expected is None:
        return False
    return str(entity.get("state") or "") == str(expected)


def _numeric_condition(condition: dict[str, Any], states: dict[str, dict[str, Any]]) -> bool:
    """``numeric`` 条件：状态与阈值都必须是数字，否则不满足（并留痕）。"""
    entity = states.get(str(condition.get("entityId") or ""))
    if not entity:
        return False
    try:
        actual = float(entity.get("state"))
        target = float(condition.get("value"))
    except (TypeError, ValueError):  # fmt: skip
        # 状态或阈值不是数字（``unknown`` / 用户填了单位）：条件不成立并留痕 ——
        # 静默返回 False 会让「模式再也不执行」变成无解谜题。
        logger.debug("数值条件无法解析，按不满足处理: %r vs %r", entity.get("state"), condition.get("value"))
        return False
    op = _NUMERIC_OPS.get(str(condition.get("op") or "gt"))
    return bool(op(actual, target)) if op else False


def _presence_condition(condition: dict[str, Any], presence: dict[str, Any]) -> bool:
    """``presence`` 条件：必须知道在场状态才判定（不知道 = 不满足）。"""
    expected = condition.get("atHome")
    if expected is None or "atHome" not in presence:
        return False
    return bool(presence.get("atHome")) is bool(expected)


def evaluate_mode_condition(
    condition: Any,
    context: dict[str, Any],
    *,
    timezone_name: str | None = None,
    now: datetime | None = None,
) -> bool:
    """求值单条条件；**读不到数据一律返回 False**（保守：不确定就不执行）。

    ``context`` 由调用方提供，至少含 ``states``（entity_id → 状态 dict）与
    ``presence``（``{"atHome": bool}``）。缺字段时按不满足处理 —— 宁可这一轮不执行，
    也不要在「不知道有没有人」的时候把门锁打开。
    """
    if not isinstance(condition, dict):
        return False
    kind = str(condition.get("type") or "").strip()
    states: dict[str, dict[str, Any]] = context.get("states") or {}

    if kind == "state":
        return _state_condition(condition, states)
    if kind == "numeric":
        return _numeric_condition(condition, states)
    if kind == "time":
        return _time_condition_holds(condition, now or datetime.now(tz=None), timezone_name)
    if kind == "presence":
        return _presence_condition(condition, context.get("presence") or {})

    # 未知类型：按不满足处理，并留日志（否则配置写错时模式会「再也不执行」）。
    logger.warning("未知的家庭模式条件类型: %s", kind or "<empty>")
    return False


def evaluate_mode_condition_group(
    conditions: Any,
    context: dict[str, Any],
    *,
    timezone_name: str | None = None,
    now: datetime | None = None,
) -> tuple[bool, list[int]]:
    """AND 求值整组条件；返回 ``(是否全部满足, 不满足的下标列表)``。

    返回下标而不是只返回布尔，是为了让触发日志能写「第 2 个条件不满足」——
    只说「条件不满足」时用户无法知道自己配错了哪一条。
    """
    if not isinstance(conditions, list) or not conditions:
        return True, []
    failed: list[int] = []
    for index, condition in enumerate(conditions):
        if not evaluate_mode_condition(condition, context, timezone_name=timezone_name, now=now):
            failed.append(index)
    return (not failed), failed


__all__ = ["evaluate_mode_condition", "evaluate_mode_condition_group"]
