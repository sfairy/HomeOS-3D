"""计划任务的请求体写入：动作白名单、调度字段与通用字段（从 ``scheduler`` 拆出）。

这三个函数只做「校验 + 写 row」，不读写数据库、不依赖 service 状态，因此是模块级纯函数：
调度器在同一个事务里依次调用，错误结果原样返回给调用方。
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from .scheduler_schema import ALLOWED_ACTION_TOOLS, MAX_NAME_CHARS, json_dump
from .scheduler_time import cron_trigger, delay_minutes, next_cron_run, normalize_cron, now_naive, parse_iso
from ....platform.core.db.models import AgentScheduledTask

logger = logging.getLogger("homeos.agent.scheduler")


def apply_action(row: AgentScheduledTask, payload: dict[str, Any]) -> dict[str, Any] | None:
    """校验并写入动作工具；返回错误结果或 ``None``。"""
    tool = str(payload.get("actionTool") or "").strip()
    if not tool:
        return {"ok": False, "message": "要执行的动作不能为空"}
    if tool not in ALLOWED_ACTION_TOOLS:
        return {"ok": False, "message": f"计划任务不支持动作: {tool}"}
    row.action_tool = tool
    return None


def apply_schedule(
    row: AgentScheduledTask,
    payload: dict[str, Any],
    timezone_name: str,
) -> dict[str, Any] | None:
    """按任务类型重算 ``cron`` / ``run_at`` / ``next_run_at``；返回错误结果或 ``None``。"""
    if row.schedule_type == "RECURRING":
        if "cron" in payload or "time" in payload or "runAt" in payload:
            try:
                row.cron = normalize_cron({**payload, "timezone": timezone_name})
                cron_trigger(row.cron, timezone_name)
            except Exception as exc:
                logger.info("更新周期任务表达式失败: %s", exc)
                return {"ok": False, "message": str(exc)}
        row.run_at = None
        # 与创建路径一致：算不出下次触发就必须报错。
        # `0 0 31 2 *` 这类「语法合法但永不成立」的表达式过去会静默写入
        # next_run_at=None 并回 ok:True，任务从此再也不会执行，用户却以为改成功了。
        next_run = next_cron_run(row.cron, timezone_name, now_naive())
        if next_run is None:
            return {
                "ok": False,
                "message": "cron 表达式无法计算下次执行时间（例如 2 月 31 日这类永不成立的日期）",
            }
        row.next_run_at = next_run
        return None
    if "runAt" in payload:
        parsed = parse_iso(payload.get("runAt"))
        if parsed is None:
            return {"ok": False, "message": "runAt 时间格式不合法"}
        row.run_at = parsed
    elif "delayMinutes" in payload:
        # 与创建路径同一套解析 / 夹紧，避免「PUT 改延迟」被静默忽略
        delay = delay_minutes(payload.get("delayMinutes"))
        if delay is None:
            return {"ok": False, "message": "delayMinutes 不是有效数字"}
        row.run_at = now_naive() + timedelta(minutes=delay)
    if row.run_at is None:
        # 更新成 ONCE 但既没给 runAt 也没给 delayMinutes（例如从 cron 切过来）：
        # 过去会把 run_at/next_run_at 一起写成 None 并回 ok:True，任务直接变成死任务。
        return {"ok": False, "message": "一次性任务需要 runAt 或 delayMinutes"}
    row.cron = ""
    row.next_run_at = row.run_at
    return None


def apply_task_fields(row: AgentScheduledTask, payload: dict[str, Any]) -> dict[str, Any] | None:
    """写入名称 / 动作 / 参数 / 前置条件；返回错误结果或 ``None``。"""
    if "name" in payload:
        row.name = str(payload.get("name") or "").strip()[:MAX_NAME_CHARS] or row.name
    if "actionTool" in payload:
        action_error = apply_action(row, payload)
        if action_error is not None:
            return action_error
    if "actionArgs" in payload:
        row.action_args = json_dump(payload.get("actionArgs"))
    if "precondition" in payload:
        row.precondition = json_dump(payload.get("precondition"))
    if "scheduleType" in payload:
        row.schedule_type = "RECURRING" if str(payload.get("scheduleType") or "").upper() == "RECURRING" else "ONCE"
    return None
