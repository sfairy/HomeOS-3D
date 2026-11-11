"""家庭模式的执行记录与条件上下文（从 ``actions.py`` 拆出）。

两块内容都不属于「激活状态机」本身：

- **条件上下文**：按条件里引用的实体去取状态，交给 ``conditions.evaluate_conditions``；
- **执行记录**：把触发上下文 + 逐动作结果整理成一条可查询的历史（含 ``runId`` 与 trace）。

拆出来的动机：``actions.py`` 已被文件规模棘轮锁住，而这两块是「数据整形」，与激活的
四阶段逻辑不是同一类知识。
"""

from __future__ import annotations

import logging
import time
import uuid
from typing import Any

from .conditions import evaluate_mode_condition_group

logger = logging.getLogger("homeos.home_mode.execution_record")

_MISSING_FAILED_ITEMS: Any = object()


def new_run_id() -> str:
    """生成一次激活的追踪 id（``run-<毫秒>-<随机>``，便于日志与历史里肉眼对齐）。"""
    return f"run-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}"


def build_action_trace(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """把逐条结果整理成 trace（只保留排障需要的字段，避免历史条目膨胀）。"""
    return [
        {
            "index": index,
            "entityId": result.get("entity_id"),
            "service": result.get("service"),
            "ok": bool(result.get("success")),
            "verified": result.get("verified"),
            "durationMs": result.get("durationMs"),
            "error": result.get("error"),
        }
        for index, result in enumerate(results)
    ]


def execution_record(
    trigger: Any,
    event_reason: Any,
    success: bool,
    *,
    total: int,
    executed: int,
    failed_items: Any = _MISSING_FAILED_ITEMS,
    trace: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """构造 ``record_execution`` 的执行历史负载。

    ``runId`` 是这一轮激活的追踪 id：同一个 id 同时出现在触发日志、执行历史与
    逐动作 trace 里，排障时可以直接按 id 把三处串起来（否则只能按时间去猜）。

    ``trace`` 是逐动作的耗时与结论，用于回答「整组动作里到底是哪一步慢/失败」——
    只有汇总计数时无从下手。
    """
    record: dict[str, Any] = {
        "modeId": trigger.mode_id,
        "modeName": trigger.mode_name,
        "success": success,
        "source": trigger.source,
        "reason": event_reason,
        "executed": executed,
        "total": total,
    }
    run_id = getattr(trigger, "run_id", "")
    if run_id:
        record["runId"] = run_id
    if trace:
        record["trace"] = trace
    if failed_items is not _MISSING_FAILED_ITEMS:
        record["failedItems"] = failed_items
    return record


async def _collect_condition_context(deps: Any, conditions: list[dict[str, Any]]) -> dict[str, Any]:
    """按条件里引用的实体去取状态（只查需要的，不做全量扫描）。"""
    states: dict[str, dict[str, Any]] = {}
    entity_ids = {
        str(condition.get("entityId"))
        for condition in conditions
        if isinstance(condition, dict) and condition.get("entityId")
    }
    for entity_id in entity_ids:
        try:
            row = await deps.fetch_entity_state(entity_id)
        except Exception:  # 读不到就当成「缺数据」→ 条件不满足
            logger.debug("条件引用的实体状态读取失败: %s", entity_id, exc_info=True)
            row = None
        if row:
            states[entity_id] = row
    presence: dict[str, Any] = {}
    presence_probe = getattr(deps, "get_presence_context", None)
    if callable(presence_probe):
        try:
            presence = presence_probe() or {}
        except Exception:  # 在场信息拿不到时按「不知道」处理（presence 条件会判不满足）
            logger.debug("读取在场信息失败，presence 条件按不满足处理", exc_info=True)
            presence = {}
    return {"states": states, "presence": presence}


async def check_mode_conditions(deps: Any, mode: dict[str, Any]) -> tuple[bool, list[int]]:
    """求值模式的条件组；返回 ``(是否全部满足, 不满足的下标)``。"""
    conditions = mode.get("conditions")
    if not isinstance(conditions, list) or not conditions:
        return True, []
    context = await _collect_condition_context(deps, conditions)
    timezone_name: str | None = None
    timezone_probe = getattr(deps, "get_home_timezone", None)
    if callable(timezone_probe):
        try:
            timezone_name = (timezone_probe() or "").strip() or None
        except Exception:
            logger.debug("读取家庭时区失败，时间条件按本机时区判定", exc_info=True)
            timezone_name = None
    return evaluate_mode_condition_group(conditions, context, timezone_name=timezone_name)


def skipped_result(
    deps: Any, mode: dict[str, Any], mode_id: str, meta: dict[str, Any] | None, unmet: list[int]
) -> dict[str, Any]:
    """条件不满足时的激活结果：记触发日志并返回「跳过」（不是失败）。

    跳过与失败的区别是**用户可见语义**：失败会出现在错误提示与失败计数里，
    而「今天深夜不执行回家模式」是完全正常的行为，不该让用户以为出了问题。
    """
    deps.log(f"模式 {mode['name']} 条件不满足，跳过本次激活: {unmet}")
    deps.push_trigger_log(
        {
            "modeId": mode_id,
            "modeName": mode["name"],
            "source": (meta or {}).get("source") or "manual",
            "reason": "condition_unmet",
            "success": True,
            "unmetConditions": unmet,
        }
    )
    return {
        "success": True,
        "modeId": mode_id,
        "modeName": mode["name"],
        "active": False,
        "skipped": True,
        "reason": "condition_unmet",
        "unmetConditions": unmet,
        "executed": 0,
        "total": 0,
    }


__all__ = [
    "build_action_trace",
    "check_mode_conditions",
    "execution_record",
    "new_run_id",
    "skipped_result",
]
